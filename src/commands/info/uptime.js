const { SlashCommandBuilder } = require("discord.js");
const { buildFromConfig } = require("../../embedBuilder");

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${sec}s`);
  return parts.join(" ");
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("uptime")
    .setDescription("Show how long L has been online"),
  name: "uptime",
  category: "Info",
  aliases: ["up"],

  async executeInteraction(interaction, client) {
    return this._run(interaction, client);
  },
  async execute(message, args, client) {
    return this._run(message, client);
  },
  async _run(ctx, client) {
    const uptime = formatUptime(client.uptime);
    const since = new Date(Date.now() - client.uptime).toISOString().replace("T", " ").slice(0, 19) + " UTC";
    const embed = buildFromConfig(
      {
        title: "L is Online",
        description: `**__Uptime__**: \`${uptime}\`\n**__Online since__**: \`${since}\`\n**__Serving__**: \`${client.guilds.cache.size}\` servers`,
        color: "57F287",
        footer: "L • Info",
        footerIcon: "bot",
        showTimestamp: false,
      },
      ctx.guild
    );
    return ctx.reply({ embeds: [embed] });
  },
};
