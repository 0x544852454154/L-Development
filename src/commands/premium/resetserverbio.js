const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { addAudit } = require("../../database");
const { success, error } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("resetserverbio")
    .setDescription("Clear the server's description (About)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator),
  name: "resetserverbio",
  category: "Premium",
  premium: true,
  permissions: [PermissionFlagsBits.ManageGuild, PermissionFlagsBits.Administrator],
  aliases: [],

  async executeInteraction(interaction, client) {
    try {
      await interaction.guild.setDescription(null);
      addAudit(interaction.guild.id, "resetserverbio", interaction.user.tag, "Server description cleared", "warning");
      return success(interaction, interaction.guild, "Server description has been cleared.");
    } catch (e) {
      return error(
        interaction,
        interaction.guild,
        `Failed to clear server description. Missing permissions.\n\`${e.message}\``,
      );
    }
  },

  async execute(message, args, client) {
    try {
      await message.guild.setDescription(null);
      addAudit(message.guild.id, "resetserverbio", message.author.tag, "Server description cleared", "warning");
      return success(message, message.guild, "Server description has been cleared.");
    } catch (e) {
      return error(
        message,
        message.guild,
        `Failed to clear server description. Missing permissions.\n\`${e.message}\``,
      );
    }
  },
};
