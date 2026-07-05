const { SlashCommandBuilder } = require("discord.js");
const { buildFromConfig, error } = require("../../embedBuilder");

// A small built-in dictionary of L/antinuke-themed words.
const DICTIONARY = {
  justice: "The maintenance or administration of what is just — by the impartial adjustment of conflicting claims. L's favorite word.",
  light: "The natural agent that stimulates sight; also the name of a certain someone L was hunting.",
  shadow: "A dark area produced by a body coming between rays of light and a surface. Where L prefers to operate.",
  nuke: "A mass-destruction event in a Discord server — channels, roles, and bans wiped out. L auto-restores these.",
  shield: "A piece of personal armor held to intercept attacks. L's antinuke shield intercepts nukes before they land.",
  owner: "The person who owns a Discord server. By default, the only one with full Administrator powers.",
  premium: "L's paid tier — unlocks anti-alt detection, autorole, mass roles, server identity tools and more.",
  cake: "A sweet baked dessert. L's primary fuel source during investigations.",
  truth: "That which is in accordance with fact or reality. L always finds it, eventually.",
  detective: "A person whose occupation is to investigate and solve crimes. Like a certain someone we know.",
  kira: "A Japanese word meaning 'killer' — and the alias a certain someone adopted. L's opposite number.",
  shinigami: "A god of death in Japanese folklore. They love apples, apparently.",
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("define")
    .setDescription("Look up a word in L's mini-dictionary")
    .addStringOption((o) =>
      o.setName("word").setDescription("Word to define").setRequired(true)
    ),
  name: "define",
  category: "Util",
  aliases: ["def", "dict", "dictionary"],

  async executeInteraction(interaction, client) {
    const word = interaction.options.getString("word").trim().toLowerCase();
    return sendDef(interaction, interaction.guild, word);
  },

  async execute(message, args, client) {
    const word = args.join(" ").trim().toLowerCase();
    if (!word) return error(message, message.guild, "Provide a word to define.");
    return sendDef(message, message.guild, word);
  },
};

function sendDef(ctx, guild, word) {
  const def = DICTIONARY[word];
  let embed;
  if (def) {
    embed = buildFromConfig(
      {
        title: `Definition: ${word}`,
        titleEmoji: "📖",
        description: def,
        color: "2B2D31",
        footer: "L • Mini Dictionary",
        footerEmoji: "📚",
        showTimestamp: true,
      },
      guild
    );
  } else {
    const known = Object.keys(DICTIONARY).map((k) => `\`${k}\``).join(", ");
    embed = buildFromConfig(
      {
        title: "Not In Dictionary",
        titleEmoji: "🔍",
        description: `**${word}** isn't in L's mini-dictionary yet.\n\nTry one of: ${known}`,
        color: "F1C40F",
        footer: "L • Mini Dictionary",
        footerEmoji: "📚",
        showTimestamp: true,
      },
      guild
    );
  }
  return ctx.reply({ embeds: [embed] });
}
