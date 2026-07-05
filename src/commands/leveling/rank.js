const { SlashCommandBuilder } = require("discord.js");
const { getGuild } = require("../../database");
const { buildFromConfig } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Show your XP and level (or someone else's)")
    .addUserOption((o) =>
      o.setName("user").setDescription("User to check (defaults to you)").setRequired(false)
    ),
  name: "rank",
  category: "Leveling",
  aliases: ["xp", "level"],

  async executeInteraction(interaction, client) {
    const user = interaction.options.getUser("user") || interaction.user;
    return sendRank(interaction, interaction.guild, user);
  },

  async execute(message, args, client) {
    const user = message.mentions.users.first() || message.author;
    return sendRank(message, message.guild, user);
  },
};

function sendRank(ctx, guild, user) {
  const data = getGuild(guild.id);
  const xpMap = (data.leveling && data.leveling.xp) || {};
  const entry = xpMap[user.id] || { xp: 0, level: 0 };
  const xp = entry.xp || 0;
  const level = entry.level || 0;
  // XP needed to reach the next level — simple curve: 100 * (level+1)^2
  const needed = 100 * Math.pow(level + 1, 2);
  const progress = needed > 0 ? Math.min(100, Math.floor((xp / needed) * 100)) : 0;
  const filled = Math.floor(progress / 10);
  const bar = "█".repeat(filled) + "░".repeat(10 - filled);

  const embed = buildFromConfig(
    {
      title: `${user.tag}'s Rank`,
      titleEmoji: "🏆",
      description:
        `**Level:** ${level}\n` +
        `**XP:** ${xp} / ${needed}\n` +
        `\`${bar}\` ${progress}%`,
      color: "F1C40F",
      footer: "L • Leveling",
      footerEmoji: "🏆",
      showTimestamp: true,
      thumbnailUrl: user.displayAvatarURL(),
    },
    guild
  );
  return ctx.reply({ embeds: [embed] });
}
