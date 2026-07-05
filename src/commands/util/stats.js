const { SlashCommandBuilder } = require("discord.js");
const config = require("../../config");
const { buildFromConfig } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Show live bot statistics — servers, users, uptime, memory, ping"),
  name: "stats",
  category: "Util",
  aliases: ["botinfo", "botstats"],

  async executeInteraction(interaction, client) {
    return sendStats(interaction, interaction.guild, client);
  },

  async execute(message, args, client) {
    return sendStats(message, message.guild, client);
  },
};

function sendStats(ctx, guild, client) {
  const guilds = client.guilds.cache.size;
  const users = client.users.cache.size;
  const uptimeMs = client.uptime || 0;
  const days = Math.floor(uptimeMs / 86400000);
  const hours = Math.floor((uptimeMs % 86400000) / 3600000);
  const minutes = Math.floor((uptimeMs % 3600000) / 60000);
  const seconds = Math.floor((uptimeMs % 60000) / 1000);
  const uptime = `${days}d ${hours}h ${minutes}m ${seconds}s`;
  const mem = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);
  const ping = Math.round(client.ws.ping);

  const description =
    `**Servers:** ${guilds}\n` +
    `**Cached Users:** ${users}\n` +
    `**Uptime:** ${uptime}\n` +
    `**Memory (RSS):** ${mem} MB\n` +
    `**WebSocket Ping:** ${ping} ms\n` +
    `**Node.js:** ${process.version}`;

  const embed = buildFromConfig(
    {
      title: `${config.name} — Statistics`,
      titleEmoji: "📊",
      description,
      color: "2B2D31",
      footer: `${config.name} • ${config.tagline}`,
      footerEmoji: "👑",
      showTimestamp: true,
      thumbnailUrl: client.user ? client.user.displayAvatarURL() : undefined,
    },
    guild
  );
  return ctx.reply({ embeds: [embed] });
}
