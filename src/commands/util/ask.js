const { SlashCommandBuilder } = require("discord.js");
const { buildFromConfig, error } = require("../../embedBuilder");

// Canned L / Death-Note-themed witty responses
const RESPONSES = [
  "I am justice.",
  "I'll consider it.",
  "The answer is within you.",
  "Interesting. I'll need more cake to think this over.",
  "Probability suggests... yes. Probably.",
  "Trust no one. Especially not the answer.",
  "Logic dictates that the truth will reveal itself in time.",
  "I'm 73% sure. The remaining 27% is cake.",
  "Sit. Reflect. Eat cake. Then decide.",
  "If you have to ask, you already know.",
  "He who stakes his life on a guess is a fool. Don't be a fool.",
  "The Notebook says... no comment.",
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ask")
    .setDescription("Ask L a yes/no question — receive a verdict")
    .addStringOption((o) =>
      o.setName("question").setDescription("Your question for L").setRequired(true)
    ),
  name: "ask",
  category: "Util",
  aliases: ["8ball", "l"],

  async executeInteraction(interaction, client) {
    const q = interaction.options.getString("question").trim();
    return answer(interaction, interaction.guild, interaction.user, q);
  },

  async execute(message, args, client) {
    const q = args.join(" ").trim();
    if (!q) return error(message, message.guild, "Ask me a question first.");
    return answer(message, message.guild, message.author, q);
  },
};

function answer(ctx, guild, user, q) {
  const verdict = RESPONSES[Math.floor(Math.random() * RESPONSES.length)];
  const embed = buildFromConfig(
    {
      title: "L Considers Your Query",
      titleEmoji: "💭",
      description: `**Question:** ${q}\n**Verdict:** *${verdict}*`,
      color: "2B2D31",
      footer: "L • The Detective",
      footerEmoji: "👑",
      showTimestamp: true,
      thumbnailUrl: user.displayAvatarURL(),
    },
    guild
  );
  return ctx.reply({ embeds: [embed] });
}
