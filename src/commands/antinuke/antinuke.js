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
          { name: "botspam", value: "botspam" },
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
    .addStringOption((o) =>
      o.setName("type").setDescription("Bot spam type to configure").setRequired(false)
        .addChoices(
          { name: "messages", value: "messages" },
          { name: "channels", value: "channels" },
          { name: "roles", value: "roles" },
        )
    )
    .addIntegerOption((o) =>
      o.setName("threshold").setDescription("Bot spam threshold (1-100)").setRequired(false).setMinValue(1).setMaxValue(100)
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
    const botSpamType = interaction.options.getString("type");
    const botSpamThreshold = interaction.options.getInteger("threshold");
    return runAntinuke(interaction, interaction.guild, interaction.user, action, { value, punishment, botSpamType, botSpamThreshold });
  },

  async execute(message, args, client) {
    const data = getGuild(message.guild.id);
    const action = (args[0] || "").toLowerCase();
    if (!action) {
      return error(message, message.guild, `Usage: \`${data.prefix}antinuke <on|off|threshold|punishment|status|botspam>\``);
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
    } else if (action === "botspam") {
      const type = (args[1] || "").toLowerCase();
      const threshold = parseInt(args[2], 10);
      if (!["messages", "channels", "roles", "on", "off"].includes(type)) {
        return error(message, message.guild, "Bot spam type must be `messages`, `channels`, `roles`, `on`, or `off`.");
      }
      if (type !== "on" && type !== "off" && (!Number.isFinite(threshold) || threshold < 1 || threshold > 100)) {
        return error(message, message.guild, "Bot spam threshold must be a number between 1 and 100.");
      }
      opts.botSpamType = type;
      opts.botSpamThreshold = threshold;
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
        `**Bot Spam Detection:** ${a.botSpamDetection ? "ON" : "OFF"}\n` +
        `**Bot Message Threshold:** ${a.botSpamThreshold || 20} msgs/10s\n` +
        `**Bot Channel Threshold:** ${a.botChannelSpamThreshold || 5} ch/10s\n` +
        `**Bot Role Threshold:** ${a.botRoleSpamThreshold || 5} roles/10s\n` +
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

  if (action === "botspam") {
    const type = opts.botSpamType;
    const threshold = opts.botSpamThreshold;

    if (type === "on") {
      updateGuild(guild.id, (d) => { d.antinuke.botSpamDetection = true; });
      addAudit(guild.id, "Bot Spam Detection Enabled", user.tag, "Bot spam detection turned on", "info");
      return success(ctx, guild, "Bot spam detection is now **ENABLED**.");
    }

    if (type === "off") {
      updateGuild(guild.id, (d) => { d.antinuke.botSpamDetection = false; });
      addAudit(guild.id, "Bot Spam Detection Disabled", user.tag, "Bot spam detection turned off", "danger");
      return success(ctx, guild, "Bot spam detection is now **DISABLED**.");
    }

    if (type === "messages") {
      if (!threshold || threshold < 1 || threshold > 100) {
        return error(ctx, guild, "Threshold must be a number between 1 and 100.");
      }
      updateGuild(guild.id, (d) => { d.antinuke.botSpamThreshold = threshold; });
      addAudit(guild.id, "Bot Message Threshold Set", user.tag, `Bot message threshold set to ${threshold}`, "info");
      return success(ctx, guild, `Bot message spam threshold set to **${threshold}** messages in 10 seconds.`);
    }

    if (type === "channels") {
      if (!threshold || threshold < 1 || threshold > 100) {
        return error(ctx, guild, "Threshold must be a number between 1 and 100.");
      }
      updateGuild(guild.id, (d) => { d.antinuke.botChannelSpamThreshold = threshold; });
      addAudit(guild.id, "Bot Channel Threshold Set", user.tag, `Bot channel threshold set to ${threshold}`, "info");
      return success(ctx, guild, `Bot channel spam threshold set to **${threshold}** channels in 10 seconds.`);
    }

    if (type === "roles") {
      if (!threshold || threshold < 1 || threshold > 100) {
        return error(ctx, guild, "Threshold must be a number between 1 and 100.");
      }
      updateGuild(guild.id, (d) => { d.antinuke.botRoleSpamThreshold = threshold; });
      addAudit(guild.id, "Bot Role Threshold Set", user.tag, `Bot role threshold set to ${threshold}`, "info");
      return success(ctx, guild, `Bot role spam threshold set to **${threshold}** roles in 10 seconds.`);
    }

    return error(ctx, guild, "Invalid bot spam type. Use `on`, `off`, `messages`, `channels`, or `roles`.");
  }

  return error(ctx, guild, "Unknown action. Use `on`, `off`, `threshold`, `punishment`, `status`, or `botspam`.");
}
