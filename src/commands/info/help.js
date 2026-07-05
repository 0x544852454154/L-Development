const { SlashCommandBuilder } = require("discord.js");
const config = require("../../config");
const { getGuild } = require("../../database");
const { buildFromConfig, sendEmbed } = require("../../embedBuilder");

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
    if (cat) {
      const category = config.categories.find((c) => c.name === cat);
      if (!category) return sendEmbed(interaction, "error", interaction.guild, { detail: "Category not found." });
      const lines = category.commands.map((cmd) => `\`${data.prefix}${cmd}\``);
      const embed = buildFromConfig(
        { title: `${category.emoji} ${category.name}`, description: `${category.blurb}\n\n**Commands (${category.commands.length}):**\n${lines.join("\n")}`, color: "2B2D31", footer: "L • Help Menu", footerEmoji: "👑", showTimestamp: false },
        interaction.guild
      );
      return interaction.reply({ embeds: [embed] });
    }
    // Full menu
    const fields = config.categories.map((c) => ({
      name: `${c.emoji} ${c.name} (${c.commands.length})`,
      value: c.blurb,
    }));
    const embed = buildFromConfig(
      { title: "L — Command Center", titleEmoji: "👑", description: `**${config.categories.reduce((a, c) => a + c.commands.length, 0)} commands** across **${config.categories.length} categories**.\nUse \`/help <category>\` or \`${data.prefix}help <category>\` to browse a category.\n\nCustomize these embeds with \`/embed edit\`.`, color: "2B2D31", footer: "L • The Antinuke Authority", footerEmoji: "⚡", showTimestamp: false },
      interaction.guild
    );
    embed.addFields(fields.slice(0, 9));
    // Add remaining as a second embed if needed (Discord caps at 25 fields, we have 9)
    return interaction.reply({ embeds: [embed] });
  },

  async execute(message, args, client) {
    const data = getGuild(message.guild.id);
    const cat = args[0];
    if (cat) {
      const category = config.categories.find((c) => c.name.toLowerCase() === cat.toLowerCase());
      if (!category) return sendEmbed(message, "error", message.guild, { detail: "Category not found." });
      const lines = category.commands.map((cmd) => `\`${data.prefix}${cmd}\``);
      const embed = buildFromConfig(
        { title: `${category.emoji} ${category.name}`, description: `${category.blurb}\n\n**Commands (${category.commands.length}):**\n${lines.join("\n")}`, color: "2B2D31", footer: "L • Help Menu", footerEmoji: "👑", showTimestamp: false },
        message.guild
      );
      return message.reply({ embeds: [embed] });
    }
    const fields = config.categories.map((c) => ({
      name: `${c.emoji} ${c.name} (${c.commands.length})`,
      value: c.blurb,
    }));
    const embed = buildFromConfig(
      { title: "L — Command Center", titleEmoji: "👑", description: `**${config.categories.reduce((a, c) => a + c.commands.length, 0)} commands** across **${config.categories.length} categories**.\nUse \`${data.prefix}help <category>\` to browse a category.\n\nCustomize embeds with \`${data.prefix}embed edit\`.`, color: "2B2D31", footer: "L • The Antinuke Authority", footerEmoji: "⚡", showTimestamp: false },
      message.guild
    );
    embed.addFields(fields.slice(0, 9));
    return message.reply({ embeds: [embed] });
  },
};
