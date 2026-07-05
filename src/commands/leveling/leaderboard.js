const { SlashCommandBuilder } = require("discord.js");
const { getGuild } = require("../../database");
const { buildFromConfig } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Show the top 10 members by XP"),
  name: "leaderboard",
  category: "Leveling",
  aliases: ["lb", "top"],

  async executeInteraction(interaction, client) {
    return sendLeaderboard(interaction, interaction.guild);
  },

  async execute(message, args, client) {
    return sendLeaderboard(message, message.guild);
  },
};

function sendLeaderboard(ctx, guild) {
  const data = getGuild(guild.id);
  const xpMap = (data.leveling && data.leveling.xp) || {};
  const entries = Object.entries(xpMap).map(([userId, v]) => ({
    userId,
    xp: (v && v.xp) || 0,
    level: (v && v.level) || 0,
  }));
  entries.sort((a, b) => b.xp - a.xp);
  const top = entries.slice(0, 10);

  if (top.length === 0) {
    const embed = buildFromConfig(
      {
        title: "Leaderboard Empty",
        description: "No one has earned XP yet.\nEnable leveling with `/leveling on` and start chatting!",
        color: "F1C40F",
        footer: "L • Leveling",
        footerIcon: "bot",
        showTimestamp: false,
      },
      guild
    );
    return ctx.reply({ embeds: [embed] });
  }

  const medals = ["🥇", "🥈", "🥉"];
  const lines = top.map((e, i) => {
    const rank = i < 3 ? medals[i] : `**${i + 1}.**`;
    return `${rank} <@${e.userId}> — **Level ${e.level}** • ${e.xp} XP`;
  });

  const embed = buildFromConfig(
    {
      title: `${guild.name} — Top Members`,
      description: lines.join("\n"),
      color: "F1C40F",
      footer: "L • Leveling",
      footerIcon: "bot",
      showTimestamp: false,
      thumbnail: "guild",
    },
    guild
  );
  return ctx.reply({ embeds: [embed] });
}
