const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { addAudit } = require("../../database");
const { success, error } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("resetserverbanner")
    .setDescription("Remove the server's banner")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator),
  name: "resetserverbanner",
  category: "Premium",
  premium: true,
  permissions: [PermissionFlagsBits.ManageGuild, PermissionFlagsBits.Administrator],
  aliases: [],

  async executeInteraction(interaction, client) {
    try {
      await interaction.guild.setBanner(null);
      addAudit(interaction.guild.id, "resetserverbanner", interaction.user.tag, "Server banner reset", "warning");
      return success(interaction, interaction.guild, "Server banner has been reset.");
    } catch (e) {
      return error(
        interaction,
        interaction.guild,
        `Failed to reset server banner. Missing permissions or insufficient server boosts (Level 2 required).\n\`${e.message}\``,
      );
    }
  },

  async execute(message, args, client) {
    try {
      await message.guild.setBanner(null);
      addAudit(message.guild.id, "resetserverbanner", message.author.tag, "Server banner reset", "warning");
      return success(message, message.guild, "Server banner has been reset.");
    } catch (e) {
      return error(
        message,
        message.guild,
        `Failed to reset server banner. Missing permissions or insufficient server boosts (Level 2 required).\n\`${e.message}\``,
      );
    }
  },
};
