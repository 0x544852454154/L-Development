const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { addAudit } = require("../../database");
const { success, error } = require("../../embedBuilder");

const MAX_BIO = 1000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setserverbio")
    .setDescription("Set the server's description (About)")
    .addStringOption((o) =>
      o
        .setName("text")
        .setDescription("The new server description (max 1000 chars)")
        .setRequired(true)
        .setMaxLength(MAX_BIO)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator),
  name: "setserverbio",
  category: "Premium",
  premium: true,
  permissions: [PermissionFlagsBits.ManageGuild, PermissionFlagsBits.Administrator],
  aliases: [],

  async executeInteraction(interaction, client) {
    const text = interaction.options.getString("text");
    if (!text) return error(interaction, interaction.guild, "Please provide text for the server description.");
    try {
      await interaction.guild.setDescription(text);
      addAudit(
        interaction.guild.id,
        "setserverbio",
        interaction.user.tag,
        `Server description updated to: ${text.slice(0, 200)}${text.length > 200 ? "…" : ""}`,
        "warning",
      );
      return success(interaction, interaction.guild, "Server description updated successfully.");
    } catch (e) {
      return error(
        interaction,
        interaction.guild,
        `Failed to set server description. Missing permissions.\n\`${e.message}\``,
      );
    }
  },

  async execute(message, args, client) {
    const text = args.join(" ").trim();
    if (!text) {
      return error(message, message.guild, "Please provide text for the server description. Example: `!setserverbio Welcome to our server!`");
    }
    if (text.length > MAX_BIO) {
      return error(message, message.guild, `Server description cannot exceed **${MAX_BIO}** characters (you provided ${text.length}).`);
    }
    try {
      await message.guild.setDescription(text);
      addAudit(
        message.guild.id,
        "setserverbio",
        message.author.tag,
        `Server description updated to: ${text.slice(0, 200)}${text.length > 200 ? "…" : ""}`,
        "warning",
      );
      return success(message, message.guild, "Server description updated successfully.");
    } catch (e) {
      return error(
        message,
        message.guild,
        `Failed to set server description. Missing permissions.\n\`${e.message}\``,
      );
    }
  },
};
