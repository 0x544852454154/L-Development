const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { getGuild, updateGuild, addAudit } = require("../../database");
const { success, error, buildFromConfig } = require("../../embedBuilder");
const { clearPanic } = require("../../handlers/antinuke");

const PANIC_DURATION_MS = 5 * 60 * 1000; // 5 minutes

module.exports = {
  data: new SlashCommandBuilder()
    .setName("panic")
    .setDescription("Manually engage or disengage anti-raid panic mode")
    .addStringOption((o) =>
      o.setName("action").setDescription("What to do").setRequired(true)
        .addChoices(
          { name: "on", value: "on" },
          { name: "off", value: "off" },
          { name: "status", value: "status" },
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  name: "panic",
  category: "Antinuke",
  permissions: [PermissionFlagsBits.ManageGuild],
  aliases: [],

  async executeInteraction(interaction, client) {
    const action = interaction.options.getString("action");
    return run(interaction, interaction.guild, interaction.user, action);
  },

  async execute(message, args, client) {
    const data = getGuild(message.guild.id);
    const action = (args[0] || "").toLowerCase();
    if (!action) {
      return error(message, message.guild, `Usage: \`${data.prefix}panic <on|off|status>\``);
    }
    if (!["on", "off", "status"].includes(action)) {
      return error(message, message.guild, "Action must be `on`, `off`, or `status`.");
    }
    return run(message, message.guild, message.author, action);
  },
};

function run(ctx, guild, user, action) {
  const data = getGuild(guild.id);

  if (action === "on") {
    updateGuild(guild.id, (d) => {
      d.antiRaid.panicMode = true;
      d.antiRaid.panicUntil = Date.now() + PANIC_DURATION_MS;
    });
    addAudit(guild.id, "Panic Mode Engaged", user.tag, `Panic mode manually engaged for ${PANIC_DURATION_MS / 1000}s`, "danger");
    return success(ctx, guild,
      `Panic mode **engaged** for ${PANIC_DURATION_MS / 60000} minutes.\nNew joiners will be subject to the configured raid action (\`${data.antiRaid.action || "kick"}\`) until panic clears or is disengaged.`);
  }

  if (action === "off") {
    clearPanic(guild.id);
    addAudit(guild.id, "Panic Mode Disengaged", user.tag, "Panic mode manually cleared", "info");
    return success(ctx, guild, "Panic mode has been **disengaged**.\nNew joiners will no longer be auto-actioned by anti-raid.");
  }

  // status
  const a = data.antiRaid;
  const remaining = a.panicMode && a.panicUntil > Date.now() ? Math.max(0, Math.round((a.panicUntil - Date.now()) / 1000)) : 0;
  const cfg = {
    title: "Panic Mode Status",
    description:
      `**__Panic Mode__**: ${a.panicMode && remaining > 0 ? `ACTIVE (${remaining}s remaining)` : "CLEAR"}\n` +
      `**__Raid Action__**: ${a.action || "kick"}\n` +
      `**__Anti-Raid Shield__**: ${a.enabled ? "ONLINE" : "OFFLINE"}`,
    color: a.panicMode && remaining > 0 ? "ED4245" : "57F287",
    footer: "L • Anti-Raid",
    footerIcon: "bot",
    showTimestamp: false,
  };
  const embed = buildFromConfig(cfg, guild);
  return ctx.reply({ embeds: [embed] });
}
