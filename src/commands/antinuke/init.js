const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { updateGuild, addAudit } = require("../../database");
const { buildFromConfig } = require("../../embedBuilder");
const config = require("../../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("init")
    .setDescription("Initialize L with safe antinuke defaults for this server")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  name: "init",
  category: "Antinuke",
  permissions: [PermissionFlagsBits.ManageGuild],
  aliases: ["setup"],

  async executeInteraction(interaction, client) {
    return runInit(interaction, interaction.guild, interaction.user);
  },

  async execute(message, args, client) {
    return runInit(message, message.guild, message.author);
  },
};

function runInit(ctx, guild, user) {
  updateGuild(guild.id, (d) => {
    d.antinuke.enabled = true;
    d.antinuke.threshold = config.antinuke.defaultThreshold;
    d.antinuke.window = config.antinuke.defaultWindow;
    d.antinuke.punishment = config.antinuke.punishment;
    d.antinuke.antiping = true;
    d.antinuke.nukehooks = true;
    d.antinuke.botSpamDetection = true;
    d.autoRestore.enabled = true;
    d.autoRestore.restoreChannels = true;
    d.autoRestore.restoreRoles = true;
    d.autoRestore.restoreBans = true;
    d.autoRestore.restoreWebhooks = true;
    d.autoRestore.threshold = 3;
  });
  addAudit(guild.id, "Server Initialized", user.tag, "L initialized with safe antinuke defaults", "info");
  const embed = buildFromConfig(
    {
      title: "L Initialized",
      titleEmoji: "🛡️",
      description:
        `The **L** antinuke shield is now **online** with safe defaults.\n\n` +
        `**Antinuke:** ✅ Enabled (threshold: ${config.antinuke.defaultThreshold} actions / 10s, punishment: ${config.antinuke.punishment})\n` +
        `**Anti-Ping:** ✅ Enabled\n` +
        `**Anti-Webhook:** ✅ Enabled\n` +
        `**Bot Spam Detection:** ✅ Enabled\n` +
        `**Auto-Restore:** ✅ Enabled (channels, roles, bans, webhooks)\n\n` +
        `Customize further with \`/antinuke\`, \`/whitelist\`, \`/automod\`, and \`/logging\`.`,
      color: "57F287",
      footer: "L • Antinuke System",
      footerEmoji: "👑",
      showTimestamp: true,
    },
    guild
  );
  return ctx.reply({ embeds: [embed] });
}
