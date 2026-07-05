const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { getGuild, updateGuild, addAudit } = require("../../database");
const { success, error, buildFromConfig } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("antispam")
    .setDescription("Toggle anti-spam protection and configure the spam threshold")
    .addStringOption((o) =>
      o.setName("action").setDescription("What to do").setRequired(true)
        .addChoices(
          { name: "on", value: "on" },
          { name: "off", value: "off" },
          { name: "threshold", value: "threshold" },
          { name: "status", value: "status" },
        )
    )
    .addIntegerOption((o) =>
      o.setName("value").setDescription("Spam threshold (messages in 5s, 3-50)").setRequired(false).setMinValue(3).setMaxValue(50)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  name: "antispam",
  category: "Antinuke",
  permissions: [PermissionFlagsBits.ManageGuild],
  aliases: ["as"],

  async executeInteraction(interaction, client) {
    const action = interaction.options.getString("action");
    const value = interaction.options.getInteger("value");
    return run(interaction, interaction.guild, interaction.user, action, value);
  },

  async execute(message, args, client) {
    const data = getGuild(message.guild.id);
    const action = (args[0] || "").toLowerCase();
    if (!action) {
      return error(message, message.guild, `Usage: \`${data.prefix}antispam <on|off|threshold|status> [value]\``);
    }
    if (!["on", "off", "threshold", "status"].includes(action)) {
      return error(message, message.guild, "Action must be `on`, `off`, `threshold`, or `status`.");
    }
    let value = null;
    if (action === "threshold") {
      const v = parseInt(args[1], 10);
      if (!Number.isFinite(v) || v < 3 || v > 50) {
        return error(message, message.guild, "Threshold must be a number between 3 and 50 (messages in 5s).");
      }
      value = v;
    }
    return run(message, message.guild, message.author, action, value);
  },
};

function run(ctx, guild, user, action, value) {
  const data = getGuild(guild.id);

  if (action === "on") {
    updateGuild(guild.id, (d) => { d.antinuke.antiSpam = true; });
    addAudit(guild.id, "Anti-Spam Enabled", user.tag, "Anti-spam protection turned ON", "warning");
    return success(ctx, guild, `Anti-spam is now **ON**.\nUsers sending **${data.antinuke.spamThreshold || 7}** messages within 5s will be timed out for 10 minutes.`);
  }

  if (action === "off") {
    updateGuild(guild.id, (d) => { d.antinuke.antiSpam = false; });
    addAudit(guild.id, "Anti-Spam Disabled", user.tag, "Anti-spam protection turned OFF", "danger");
    return success(ctx, guild, "Anti-spam is now **OFF**.");
  }

  if (action === "threshold") {
    if (!value || value < 3 || value > 50) {
      return error(ctx, guild, "Threshold must be a number between 3 and 50 (messages in 5s).");
    }
    updateGuild(guild.id, (d) => { d.antinuke.spamThreshold = value; });
    addAudit(guild.id, "Anti-Spam Threshold Set", user.tag, `Spam threshold set to ${value} messages/5s`, "info");
    return success(ctx, guild, `Anti-spam threshold set to **${value} messages within 5s**.\nUsers exceeding this rate will be timed out.`);
  }

  // status
  const cfg = {
    title: "Anti-Spam Status",
    description:
      `**Anti-Spam:** ${data.antinuke.antiSpam ? "ON" : "OFF"}\n` +
      `**Threshold:** ${data.antinuke.spamThreshold || 7} messages / 5s\n` +
      `**Punishment:** 10-minute timeout\n` +
      `**Antinuke Shield:** ${data.antinuke.enabled ? "ONLINE" : "OFFLINE"}`,
    color: data.antinuke.antiSpam ? "57F287" : "949BA4",
    footer: "L • Antinuke",
    showTimestamp: true,
  };
  const embed = buildFromConfig(cfg, guild);
  return ctx.reply({ embeds: [embed] });
}
