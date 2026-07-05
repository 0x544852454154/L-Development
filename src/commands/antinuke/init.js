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

async function runInit(ctx, guild, user) {
  // Snapshot the current server identity for the identity lock
  const identitySnapshot = {
    name: guild.name,
    iconUrl: guild.iconURL(),
    description: guild.description,
    locked: true,
  };

  updateGuild(guild.id, (d) => {
    // Arm ALL protections (same as /antinuke on)
    d.antinuke.enabled = true;
    d.antinuke.strict = true;
    d.antinuke.threshold = config.antinuke.defaultThreshold;
    d.antinuke.window = config.antinuke.defaultWindow;
    d.antinuke.punishment = config.antinuke.punishment;
    d.antinuke.antiping = true;
    d.antinuke.nukehooks = true;
    d.antinuke.antiWebhook = true;
    d.antinuke.antiSpam = true;
    d.antinuke.blockBotAdd = true;
    d.antiRaid.enabled = true;
    // Auto-restore everything
    d.autoRestore.enabled = true;
    d.autoRestore.restoreChannels = true;
    d.autoRestore.restoreRoles = true;
    d.autoRestore.restoreBans = true;
    d.autoRestore.restoreWebhooks = true;
    d.autoRestore.threshold = 3;
    // Lock the server identity
    d.serverIdentity = identitySnapshot;
  });

  // Try to set the L icon if the server doesn't have one, or keep the current one
  if (config.protectedServerIcon) {
    try {
      await guild.setIcon(config.protectedServerIcon, "[L Init] Set L server icon").catch(() => {});
      // Update the snapshot with the new icon URL after setting
      updateGuild(guild.id, (d) => {
        d.serverIdentity.iconUrl = guild.iconURL();
      });
    } catch {}
  }

  addAudit(guild.id, "Server Initialized", user.tag, "L initialized with all protections armed + identity locked", "info");
  const embed = buildFromConfig(
    {
      title: "L Initialized",
      description:
        `The **L** antinuke shield is now **online** with all protections armed.\n\n` +
        `**Antinuke:** Enabled (strict mode, punishment: ${config.antinuke.punishment})\n` +
        `**Auto-Restore:** Enabled (channels, roles, bans, webhooks)\n` +
        `**Bot Anti-Add:** Enabled\n` +
        `**Anti-Raid:** Enabled\n` +
        `**Anti-Spam:** Enabled\n` +
        `**Anti-Webhook:** Enabled\n` +
        `**Anti-Ping:** Enabled\n` +
        `**Server Identity Lock:** Enabled\n` +
        `  - Name, icon, and description are now protected\n` +
        `  - Any unauthorized change = instant revert + ban\n\n` +
        `Use \`/whitelist add\` to exempt trusted users/roles.`,
      color: "57F287",
      footer: "L • Antinuke System",
      showTimestamp: true,
    },
    guild
  );
  return ctx.reply({ embeds: [embed] });
}
