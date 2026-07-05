const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { addAudit } = require("../../database");
const { success, error } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("resetserveravatar")
    .setDescription("Remove the server's icon")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator),
  name: "resetserveravatar",
  category: "Premium",
  premium: true,
  permissions: [PermissionFlagsBits.ManageGuild, PermissionFlagsBits.Administrator],
  aliases: [],

  async executeInteraction(interaction, client) {
    try {
      await interaction.guild.setIcon(null);
      addAudit(interaction.guild.id, "resetserveravatar", interaction.user.tag, "Server icon reset", "warning");
      return success(interaction, interaction.guild, "Server icon has been reset.");
    } catch (e) {
      return error(
        interaction,
        interaction.guild,
        `Failed to reset server icon. Missing permissions or the server has no icon set.\n\`${e.message}\``,
      );
    }
  },

  async execute(message, args, client) {
    try {
      await message.guild.setIcon(null);
      addAudit(message.guild.id, "resetserveravatar", message.author.tag, "Server icon reset", "warning");
      return success(message, message.guild, "Server icon has been reset.");
    } catch (e) {
      return error(
        message,
        message.guild,
        `Failed to reset server icon. Missing permissions or the server has no icon set.\n\`${e.message}\``,
      );
    }
  },
};
