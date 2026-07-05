const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { getGuild, updateGuild, addAudit } = require("../../database");
const { success, error, buildFromConfig } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("antiraid")
    .setDescription("Configure anti-raid (join-burst detection, panic mode, raid action)")
    .addStringOption((o) =>
      o.setName("action").setDescription("What to do").setRequired(true)
        .addChoices(
          { name: "on", value: "on" },
          { name: "off", value: "off" },
          { name: "threshold", value: "threshold" },
          { name: "window", value: "window" },
          { name: "action", value: "action" },
          { name: "status", value: "status" },
        )
    )
    .addIntegerOption((o) =>
      o.setName("value").setDescription("Numeric value (threshold joins or window seconds)").setRequired(false).setMinValue(1)
    )
    .addStringOption((o) =>
      o.setName("raid_action").setDescription("Raid action to take (used with action=action)").setRequired(false)
        .addChoices(
          { name: "kick", value: "kick" },
          { name: "ban", value: "ban" },
          { name: "verify", value: "verify" },
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  name: "antiraid",
  category: "Antinuke",
  permissions: [PermissionFlagsBits.ManageGuild],
  aliases: ["ar"],

  async executeInteraction(interaction, client) {
    const action = interaction.options.getString("action");
    const value = interaction.options.getInteger("value");
    const raidAction = interaction.options.getString("raid_action");
    return run(interaction, interaction.guild, interaction.user, action, { value, raidAction });
  },

  async execute(message, args, client) {
    const data = getGuild(message.guild.id);
    const action = (args[0] || "").toLowerCase();
    if (!action) {
      return error(message, message.guild, `Usage: \`${data.prefix}antiraid <on|off|threshold|window|action|status> [value]\``);
    }
    if (!["on", "off", "threshold", "window", "action", "status"].includes(action)) {
      return error(message, message.guild, "Action must be `on`, `off`, `threshold`, `window`, `action`, or `status`.");
    }
    const opts = {};
    if (action === "threshold" || action === "window") {
      const v = parseInt(args[1], 10);
      if (!Number.isFinite(v) || v < 1) {
        return error(message, message.guild, action === "threshold" ? "Threshold must be a positive integer (joins)." : "Window must be a positive integer (seconds).");
      }
      if (action === "window" && v > 3600) return error(message, message.guild, "Window cannot exceed 3600 seconds (1 hour).");
      opts.value = v;
    } else if (action === "action") {
      const a = (args[1] || "").toLowerCase();
      if (!["kick", "ban", "verify"].includes(a)) {
        return error(message, message.guild, "Raid action must be `kick`, `ban`, or `verify`.");
      }
      opts.raidAction = a;
    }
    return run(message, message.guild, message.author, action, opts);
  },
};

function run(ctx, guild, user, action, opts = {}) {
  const data = getGuild(guild.id);

  if (action === "on") {
    updateGuild(guild.id, (d) => { d.antiRaid.enabled = true; });
    addAudit(guild.id, "Anti-Raid Enabled", user.tag, "Anti-raid shield turned ON", "warning");
    return success(ctx, guild, "Anti-raid is now **ON**.\nJoin bursts will be detected and panic mode will engage automatically.");
  }

  if (action === "off") {
    updateGuild(guild.id, (d) => { d.antiRaid.enabled = false; });
    addAudit(guild.id, "Anti-Raid Disabled", user.tag, "Anti-raid shield turned OFF", "danger");
    return success(ctx, guild, "Anti-raid is now **OFF**.");
  }

  if (action === "threshold") {
    const v = opts.value;
    if (!v || v < 1) return error(ctx, guild, "Threshold must be a positive integer (number of joins).");
    updateGuild(guild.id, (d) => { d.antiRaid.joinThreshold = v; });
    addAudit(guild.id, "Anti-Raid Threshold Set", user.tag, `Join threshold set to ${v} joins`, "info");
    return success(ctx, guild, `Anti-raid join threshold set to **${v}** joins within ${(data.antiRaid.joinWindow || 10000) / 1000}s.`);
  }

  if (action === "window") {
    const v = opts.value;
    if (!v || v < 1) return error(ctx, guild, "Window must be a positive integer (seconds).");
    if (v > 3600) return error(ctx, guild, "Window cannot exceed 3600 seconds (1 hour).");
    updateGuild(guild.id, (d) => { d.antiRaid.joinWindow = v * 1000; });
    addAudit(guild.id, "Anti-Raid Window Set", user.tag, `Join window set to ${v}s`, "info");
    return success(ctx, guild, `Anti-raid join window set to **${v} seconds**.`);
  }

  if (action === "action") {
    const a = opts.raidAction;
    if (!a || !["kick", "ban", "verify"].includes(a)) {
      return error(ctx, guild, "Raid action must be `kick`, `ban`, or `verify`.");
    }
    updateGuild(guild.id, (d) => { d.antiRaid.action = a; });
    addAudit(guild.id, "Anti-Raid Action Set", user.tag, `Raid action set to ${a}`, "info");
    const detail = a === "kick" ? "kicked" : a === "ban" ? "banned" : "required to verify (no auto action)";
    return success(ctx, guild, `Anti-raid action set to **${a}**.\nDuring panic mode, new joiners will be ${detail}.`);
  }

  // status
  const a = data.antiRaid;
  const panicRemaining = a.panicMode && a.panicUntil > Date.now() ? Math.max(0, Math.round((a.panicUntil - Date.now()) / 1000)) : 0;
  const cfg = {
    title: "Anti-Raid Status",
    description:
      `**Shield:** ${a.enabled ? "ONLINE" : "OFFLINE"}\n` +
      `**Join Threshold:** ${a.joinThreshold} joins / ${(a.joinWindow || 10000) / 1000}s\n` +
      `**Raid Action:** ${a.action}\n` +
      `**Min Account Age:** ${a.minAccountAge > 0 ? `${Math.round(a.minAccountAge / 3600000)}h` : "off"}\n` +
      `**Panic Mode:** ${a.panicMode ? `ACTIVE${panicRemaining ? ` (${panicRemaining}s remaining)` : ""}` : "clear"}`,
    color: a.enabled ? (a.panicMode ? "ED4245" : "57F287") : "949BA4",
    footer: "L • Anti-Raid",
    showTimestamp: true,
  };
  const embed = buildFromConfig(cfg, guild);
  return ctx.reply({ embeds: [embed] });
}
