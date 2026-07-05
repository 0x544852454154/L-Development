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
        locked: true,
      };
    });
    addAudit(guild.id, "Antinuke Enabled", user.tag, "Antinuke shield + ALL protections armed", "warning");
    const embed = buildFromConfig({
      title: "Antinuke Shield Activated",
      description:
        "The L antinuke shield is now **online** with **all protections armed**.\n\n" +
        "**Strict Mode:** ON — any unauthorized deletion = instant ban + restore\n" +
        "**Anti-Ping:** ON — blocks @everyone/@here from non-whitelisted\n" +
        "**Nuke Hooks:** ON — detects webhook spam\n" +
        "**Anti-Webhook:** ON — blocks unauthorized webhook create + use\n" +
        "**Anti-Spam:** ON — rate-limits message spam\n" +
        "**Bot Anti-Add:** ON — auto-kicks unauthorized bots\n" +
        "**Anti-Raid:** ON — detects join bursts, engages panic mode\n" +
        "**Channel Rename:** blocked (strict)\n" +
        "**Server Rename:** blocked (strict)\n\n" +
        "Use `/whitelist` to exempt trusted users/roles.",
      color: "57F287",
      footer: "L • Antinuke System",
      showTimestamp: true,
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
        `**Shield:** ${a.enabled ? "ONLINE" : "OFFLINE"}\n` +
        `**Strict Mode:** ${on(a.strict)} — instant punish on any unauthorized action\n` +
        `**Punishment:** ${a.punishment}\n` +
        `**Threshold:** ${a.threshold} / ${a.window / 1000}s (threshold mode only)\n\n` +
        `**Protections:**\n` +
        `Anti-Ping: ${on(a.antiping)}\n` +
        `Nuke Hooks: ${on(a.nukehooks)}\n` +
        `Anti-Webhook: ${on(a.antiWebhook)} (create + use blocked)\n` +
        `Anti-Spam: ${on(a.antiSpam)} (threshold: ${a.spamThreshold || 7}/5s)\n` +
        `Bot Anti-Add: ${on(a.blockBotAdd)} (${a.whitelistedBots.length} whitelisted)\n` +
        `Anti-Raid: ${on(ar.enabled)} (${ar.panicMode ? "PANIC MODE" : "standby"})\n` +
        `Identity Lock: ${on(id.locked)} (name/icon/description protected)\n\n` +
        `**Whitelists:**\n` +
        `Users: ${a.whitelistedUsers.length} | Roles: ${a.whitelistedRoles.length} | Extra Owners: ${a.extraOwners.length} | Bots: ${a.whitelistedBots.length}`,
      color: a.enabled ? "57F287" : "ED4245",
      footer: "L • Antinuke System",
      showTimestamp: true,
    };
    const embed = buildFromConfig(cfg, guild);
    return ctx.reply({ embeds: [embed] });
  }

  return error(ctx, guild, "Unknown action. Use `on`, `off`, `threshold`, `punishment`, or `status`.");
}
