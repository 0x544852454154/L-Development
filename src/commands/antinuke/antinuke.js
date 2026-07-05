const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { getGuild, updateGuild, addAudit } = require("../../database");
const { sendEmbed, buildFromConfig, success, error } = require("../../embedBuilder");
const config = require("../../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("antinuke")
    .setDescription("Configure the antinuke shield (enable, threshold, punishment, status)")
    .addStringOption((o) =>
      o.setName("action").setDescription("What to do").setRequired(true)
        .addChoices(
          { name: "on", value: "on" },
          { name: "off", value: "off" },
          { name: "threshold", value: "threshold" },
          { name: "punishment", value: "punishment" },
          { name: "status", value: "status" },
        )
    )
    .addIntegerOption((o) =>
      o.setName("value").setDescription("Threshold value (1-50)").setRequired(false).setMinValue(1).setMaxValue(50)
    )
    .addStringOption((o) =>
      o.setName("punishment").setDescription("Punishment type").setRequired(false)
        .addChoices(
          { name: "ban", value: "ban" },
          { name: "kick", value: "kick" },
          { name: "strip", value: "strip" },
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  name: "antinuke",
  category: "Antinuke",
  permissions: [PermissionFlagsBits.ManageGuild],
  aliases: ["an"],

  async executeInteraction(interaction, client) {
    const action = interaction.options.getString("action");
    const value = interaction.options.getInteger("value");
    const punishment = interaction.options.getString("punishment");
    return runAntinuke(interaction, interaction.guild, interaction.user, action, { value, punishment });
  },

  async execute(message, args, client) {
    const data = getGuild(message.guild.id);
    const action = (args[0] || "").toLowerCase();
    if (!action) {
      return error(message, message.guild, `Usage: \`${data.prefix}antinuke <on|off|threshold|punishment|status>\``);
    }
    let opts = {};
    if (action === "threshold") {
      const v = parseInt(args[1], 10);
      if (!Number.isFinite(v) || v < 1 || v > 50) {
        return error(message, message.guild, "Threshold must be a number between 1 and 50.");
      }
      opts.value = v;
    } else if (action === "punishment") {
      const p = (args[1] || "").toLowerCase();
      if (!["ban", "kick", "strip"].includes(p)) {
        return error(message, message.guild, "Punishment must be `ban`, `kick`, or `strip`.");
      }
      opts.punishment = p;
    }
    return runAntinuke(message, message.guild, message.author, action, opts);
  },
};

function runAntinuke(ctx, guild, user, action, opts = {}) {
  const data = getGuild(guild.id);

  if (action === "on") {
    updateGuild(guild.id, (d) => { d.antinuke.enabled = true; });
    addAudit(guild.id, "Antinuke Enabled", user.tag, "Antinuke shield turned on", "warning");
    return sendEmbed(ctx, "antinuke_enabled", guild, {});
  }

  if (action === "off") {
    updateGuild(guild.id, (d) => { d.antinuke.enabled = false; });
    addAudit(guild.id, "Antinuke Disabled", user.tag, "Antinuke shield turned off", "danger");
    return sendEmbed(ctx, "antinuke_disabled", guild, {});
  }

  if (action === "threshold") {
    const v = opts.value;
    if (!v || v < 1 || v > 50) {
      return error(ctx, guild, "Threshold must be a number between 1 and 50.");
    }
    updateGuild(guild.id, (d) => { d.antinuke.threshold = v; });
    addAudit(guild.id, "Antinuke Threshold Set", user.tag, `Threshold set to ${v}`, "info");
    return success(ctx, guild, `Antinuke threshold set to **${v}** destructive actions within ${data.antinuke.window / 1000}s.`);
  }

  if (action === "punishment") {
    const p = opts.punishment;
    if (!p || !["ban", "kick", "strip"].includes(p)) {
      return error(ctx, guild, "Punishment must be `ban`, `kick`, or `strip`.");
    }
    updateGuild(guild.id, (d) => { d.antinuke.punishment = p; });
    addAudit(guild.id, "Antinuke Punishment Set", user.tag, `Punishment set to ${p}`, "info");
    return success(ctx, guild, `Antinuke punishment set to **${p}**.`);
  }

  if (action === "status") {
    const a = data.antinuke;
    const cfg = {
      title: "Antinuke Status",
      titleEmoji: "🛡️",
      description:
        `**Shield:** ${a.enabled ? "🟢 ONLINE" : "🔴 OFFLINE"}\n` +
        `**Threshold:** ${a.threshold} actions / ${a.window / 1000}s\n` +
        `**Punishment:** ${a.punishment}\n` +
        `**Anti-Ping:** ${a.antiping ? "ON" : "OFF"}\n` +
        `**Nuke Hooks:** ${a.nukehooks ? "ON" : "OFF"}\n` +
        `**Whitelisted Users:** ${a.whitelistedUsers.length}\n` +
        `**Whitelisted Roles:** ${a.whitelistedRoles.length}\n` +
        `**Extra Owners:** ${a.extraOwners.length}`,
      color: a.enabled ? "57F287" : "ED4245",
      footer: "L • Antinuke System",
      footerEmoji: "👑",
      showTimestamp: true,
    };
    const embed = buildFromConfig(cfg, guild);
    return ctx.reply({ embeds: [embed] });
  }

  return error(ctx, guild, "Unknown action. Use `on`, `off`, `threshold`, `punishment`, or `status`.");
}
