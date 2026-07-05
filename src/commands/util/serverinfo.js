const { SlashCommandBuilder } = require("discord.js");
const { buildFromConfig } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Show detailed information about this server"),
  name: "serverinfo",
  category: "Util",
  aliases: ["si", "server"],

  async executeInteraction(interaction, client) {
    return sendInfo(interaction, interaction.guild);
  },

  async execute(message, args, client) {
    return sendInfo(message, message.guild);
  },
};

async function sendInfo(ctx, guild) {
  const owner = await guild.fetchOwner().catch(() => null);
  const createdTs = Math.floor((guild.createdTimestamp || 0) / 1000);
  const created = `<t:${createdTs}:F> (<t:${createdTs}:R>)`;
  const channels = guild.channels.cache.size;
  const textChannels = guild.channels.cache.filter((c) => c.type === 0).size;
  const voiceChannels = guild.channels.cache.filter((c) => c.type === 2).size;
  const roles = guild.roles.cache.size;
  const boostLevel = guild.premiumTier ? `Tier ${guild.premiumTier}` : "None";
  const boostCount = guild.premiumSubscriptionCount || 0;

  const description =
    `**ID:** ${guild.id}\n` +
    `**Owner:** ${owner ? `${owner.user.tag} (${owner.user.id})` : "Unknown"}\n` +
    `**Members:** ${guild.memberCount}\n` +
    `**Channels:** ${channels} (${textChannels} text • ${voiceChannels} voice)\n` +
    `**Roles:** ${roles}\n` +
    `**Boosts:** ${boostCount} (${boostLevel})\n` +
    `**Created:** ${created}`;

  const embed = buildFromConfig(
    {
      title: guild.name,
      titleEmoji: "🏰",
      description,
      color: "2B2D31",
      footer: "L • Util",
      footerEmoji: "🔧",
      showTimestamp: true,
      thumbnailUrl: guild.iconURL(),
    },
    guild
  );
  if (guild.bannerURL()) {
    try { embed.setImage(guild.bannerURL({ size: 1024 })); } catch {}
  }
  return ctx.reply({ embeds: [embed] });
}
