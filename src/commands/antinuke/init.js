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
    vanity: guild.vanityURLCode,
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
      description: "**Status:** Online\n**Mode:** Strict\nAll protections active.\nAntinuke • Auto-Restore • Bot Anti-Add • Anti-Raid • Anti-Spam • Anti-Webhook • Anti-Ping • Identity Lock • Role Guard • Emoji Guard",
      color: "2B2D31",
      footer: "L",
      showTimestamp: false,
    },
    guild
  );
  return ctx.reply({ embeds: [embed] });
}
