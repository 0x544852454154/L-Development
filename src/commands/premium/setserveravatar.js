const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { addAudit } = require("../../database");
const { success, error } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setserveravatar")
    .setDescription("Set the server's icon")
    .addStringOption((o) =>
      o.setName("url").setDescription("Image URL for the new server icon").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator),
  name: "setserveravatar",
  category: "Premium",
  premium: true,
  permissions: [PermissionFlagsBits.ManageGuild, PermissionFlagsBits.Administrator],
  aliases: [],

  async executeInteraction(interaction, client) {
    const url = interaction.options.getString("url");
    if (!url) return error(interaction, interaction.guild, "Please provide an image URL.");
    try {
      await interaction.guild.setIcon(url);
      addAudit(
        interaction.guild.id,
        "setserveravatar",
        interaction.user.tag,
        `Server icon updated to ${url.slice(0, 100)}`,
        "warning",
      );
      return success(interaction, interaction.guild, "Server icon updated successfully.");
    } catch (e) {
      return error(
        interaction,
        interaction.guild,
        `Failed to set server icon. Missing permissions or the URL is invalid.\n\`${e.message}\``,
      );
    }
  },

  async execute(message, args, client) {
    const url = args[0];
    if (!url) {
      return error(message, message.guild, "Please provide an image URL. Example: `!setserveravatar <url>`");
    }
    try {
      await message.guild.setIcon(url);
      addAudit(
        message.guild.id,
        "setserveravatar",
        message.author.tag,
        `Server icon updated to ${url.slice(0, 100)}`,
        "warning",
      );
      return success(message, message.guild, "Server icon updated successfully.");
    } catch (e) {
      return error(
        message,
        message.guild,
        `Failed to set server icon. Missing permissions or the URL is invalid.\n\`${e.message}\``,
      );
    }
  },
};
