const { SlashCommandBuilder } = require("discord.js");
const { buildFromConfig } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check the bot's gateway and API latency"),
  name: "ping",
  category: "Info",
  aliases: ["latency", "pong"],

  async executeInteraction(interaction, client) {
    return this._run(interaction, client);
  },
  async execute(message, args, client) {
    return this._run(message, client);
  },
  async _run(ctx, client) {
    const apiPing = Math.round(client.ws.ping);
    const isInteraction = !!ctx.commandName;
    const start = Date.now();
    const send = isInteraction ? ctx.reply.bind(ctx) : ctx.reply.bind(ctx);
    const sent = await send({
      embeds: [
        buildFromConfig(
          { title: "Pinging…", titleEmoji: "📡", description: "Measuring latency…", color: "F1C40F", showTimestamp: false },
          ctx.guild
        ),
      ],
      fetchReply: true,
    }).catch(() => null);
    const roundTrip = sent ? Date.now() - start : 0;
    const color = apiPing < 100 ? "57F287" : apiPing < 250 ? "F1C40F" : "ED4245";
    const embed = buildFromConfig(
      {
        title: "Pong! 🏓",
        titleEmoji: "🏓",
        description: `**Gateway:** \`${apiPing}ms\`\n**API Round-Trip:** \`${roundTrip}ms\``,
        color,
        footer: "L • Info",
        footerEmoji: "📡",
        showTimestamp: true,
      },
      ctx.guild
    );
    if (sent && sent.edit) {
      return sent.edit({ embeds: [embed] });
    }
    return send({ embeds: [embed] });
  },
};
