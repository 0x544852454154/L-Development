const { SlashCommandBuilder } = require("discord.js");
const config = require("../../config");
const { getGuild } = require("../../database");
const { buildFromConfig, sendEmbed } = require("../../embedBuilder");
const { resolveEmojis } = require("../../emojiUtils");

// The L-color emoji banner — resolved against the guild's custom emojis.
const L_BANNER = ":lblue: :lwhite: :lred: :lgreen: :lorange: :lpink:";

function banner(guild) {
  return resolveEmojis(L_BANNER, guild);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show the interactive help menu with all command categories")
    .addStringOption((o) =>
      o.setName("category").setDescription("View a specific category").setRequired(false)
        .addChoices(config.categories.map((c) => ({ name: c.name, value: c.name })))
    ),
  name: "help",
  category: "Info",
  aliases: ["commands", "h"],

  async executeInteraction(interaction, client) {
    const cat = interaction.options.getString("category");
    const data = getGuild(interaction.guild.id);
    const total = config.categories.reduce((a, c) => a + c.commands.length, 0);

    if (cat) {
      const category = config.categories.find((c) => c.name === cat);
      if (!category) return sendEmbed(interaction, "error", interaction.guild, { detail: "Category not found." });
      // Per-category: compact list, one line of commands
      const embed = buildFromConfig(
        {
          authorName: banner(interaction.guild),
          title: category.name,
          description: category.commands.map((c) => `\`${c}\``).join("  "),
          color: "2B2D31",
          footer: `L • ${category.commands.length} commands`,
          showTimestamp: false,
        },
        interaction.guild
      );
      return interaction.reply({ embeds: [embed] });
    }

    // Full menu — compact, each category on its own block (matches the screenshot style)
    let body = "";
    for (const c of config.categories) {
      body += `**${c.name}**\n${c.commands.join(" ")}\n\n`;
    }
    const embed = buildFromConfig(
      {
        authorName: banner(interaction.guild),
        title: "All Commands",
        description: body.trim(),
        color: "2B2D31",
        footer: `L • ${total} commands`,
        showTimestamp: false,
      },
      interaction.guild
    );
    return interaction.reply({ embeds: [embed] });
  },

  async execute(message, args, client) {
    const data = getGuild(message.guild.id);
    const cat = args[0];
    const total = config.categories.reduce((a, c) => a + c.commands.length, 0);

    if (cat) {
      const category = config.categories.find((c) => c.name.toLowerCase() === cat.toLowerCase());
      if (!category) return sendEmbed(message, "error", message.guild, { detail: "Category not found." });
      const embed = buildFromConfig(
        {
          authorName: banner(message.guild),
          title: category.name,
          description: category.commands.map((c) => `\`${c}\``).join("  "),
          color: "2B2D31",
          footer: `L • ${category.commands.length} commands`,
          showTimestamp: false,
        },
        message.guild
      );
      return message.reply({ embeds: [embed] });
    }

    let body = "";
    for (const c of config.categories) {
      body += `**${c.name}**\n${c.commands.join(" ")}\n\n`;
    }
    const embed = buildFromConfig(
      {
        authorName: banner(message.guild),
        title: "All Commands",
        description: body.trim(),
        color: "2B2D31",
        footer: `L • ${total} commands`,
        showTimestamp: false,
      },
      message.guild
    );
    return message.reply({ embeds: [embed] });
  },
};
