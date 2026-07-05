const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { getGuild, updateGuild, addAudit } = require("../../database");
const { sendEmbed, buildFromConfig, success, error } = require("../../embedBuilder");

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
    // Enable ALL protections — the master switch arms everything
    updateGuild(guild.id, (d) => {
      d.antinuke.enabled = true;
      d.antinuke.strict = true;
      d.antinuke.antiping = true;
      d.antinuke.nukehooks = true;
      d.antinuke.antiWebhook = true;
      d.antinuke.antiSpam = true;
      d.antinuke.blockBotAdd = true;
      d.antiRaid.enabled = true;
      // Snapshot the server identity for the identity lock
      d.serverIdentity = {
        name: guild.name,
        iconUrl: guild.iconURL(),
        description: guild.description,
        vanity: guild.vanityURLCode,
        locked: true,
      };
    });
    addAudit(guild.id, "Antinuke Enabled", user.tag, "Antinuke shield + ALL protections armed", "warning");
    const embed = buildFromConfig({
      title: "Antinuke Enabled",
      description: "**__Status__**: Online\n**__Mode__**: Strict\nAll protections are now active.\nStrict • Anti-Ping • Anti-Webhook • Anti-Spam • Bot Anti-Add • Anti-Raid • Identity Lock • Role Guard • Emoji Guard",
      color: "57F287",
      footer: "L • Antinuke",
      footerIcon: "bot",
      showTimestamp: false,
    }, guild);
    return ctx.reply({ embeds: [embed] });
  }

  if (action === "off") {
    updateGuild(guild.id, (d) => {
      d.antinuke.enabled = false;
      d.antiRaid.panicMode = false;
      d.antiRaid.panicUntil = 0;
    });
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
    const ar = data.antiRaid;
    const id = data.serverIdentity || {};
    const on = (v) => v ? "ON" : "OFF";
    const cfg = {
      title: "Antinuke Status",
      description:
        `**__Shield__**: ${a.enabled ? "ONLINE" : "OFFLINE"}\n` +
        `**__Mode__**: ${on(a.strict)} • **__Punishment__**: ${a.punishment}\n` +
        `**__Anti-Ping__**: ${on(a.antiping)} • **__Anti-Webhook__**: ${on(a.antiWebhook)}\n` +
        `**__Anti-Spam__**: ${on(a.antiSpam)} • **__Bot Anti-Add__**: ${on(a.blockBotAdd)}\n` +
        `**__Anti-Raid__**: ${on(ar.enabled)}${ar.panicMode ? " (PANIC)" : ""}\n` +
        `**__Identity Lock__**: ${on(id.locked)}\n` +
        `**__Role Guard__**: ${on(a.strict)} • **__Emoji Guard__**: ${on(a.strict)}\n\n` +
        `**__Whitelists__**: ${a.whitelistedUsers.length} users • ${a.whitelistedRoles.length} roles • ${a.whitelistedBots.length} bots`,
      color: a.enabled ? "2B2D31" : "ED4245",
      thumbnail: "guild",
      footer: "L • Antinuke",
      footerIcon: "bot",
      showTimestamp: false,
    };
    const embed = buildFromConfig(cfg, guild);
    return ctx.reply({ embeds: [embed] });
  }

  return error(ctx, guild, "Unknown action. Use `on`, `off`, `threshold`, `punishment`, or `status`.");
}
