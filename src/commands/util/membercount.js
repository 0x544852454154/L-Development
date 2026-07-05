const { SlashCommandBuilder } = require("discord.js");
const { buildFromConfig } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("membercount")
    .setDescription("Show the server's current member count and breakdown"),
  name: "membercount",
  category: "Util",
  aliases: ["mc", "members"],

  async executeInteraction(interaction, client) {
    return sendCount(interaction, interaction.guild);
  },

  async execute(message, args, client) {
    return sendCount(message, message.guild);
  },
};

async function sendCount(ctx, guild) {
  // Best-effort cache hydration (intents may limit this).
  await guild.members.fetch().catch(() => {});
  const total = guild.memberCount;
  const cached = guild.members.cache;
  const bots = cached.filter((m) => m.user && m.user.bot).size;
  const humans = Math.max(0, total - bots);
  const online = cached.filter((m) => m.presence && m.presence.status !== "offline").size;
  const embed = buildFromConfig(
    {
      title: `${guild.name} — Members`,
      description: `**__Total__**: ${total}\n**__Humans__**: ${humans}\n**__Bots__**: ${bots}\n**__Online (cached)__**: ${online}`,
      color: "2B2D31",
      footer: "L • Util",
      footerIcon: "bot",
      showTimestamp: false,
      thumbnail: "guild",
    },
    guild
  );
  return ctx.reply({ embeds: [embed] });
}
