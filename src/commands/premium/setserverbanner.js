const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { addAudit } = require("../../database");
const { success, error } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setserverbanner")
    .setDescription("Set the server's banner (requires Level 2 server boost)")
    .addStringOption((o) =>
      o.setName("url").setDescription("Image URL for the new server banner").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator),
  name: "setserverbanner",
  category: "Premium",
  premium: true,
  permissions: [PermissionFlagsBits.ManageGuild, PermissionFlagsBits.Administrator],
  aliases: [],

  async executeInteraction(interaction, client) {
    const url = interaction.options.getString("url");
    if (!url) return error(interaction, interaction.guild, "Please provide an image URL.");
    try {
      await interaction.guild.setBanner(url);
      addAudit(
        interaction.guild.id,
        "setserverbanner",
        interaction.user.tag,
        `Server banner updated to ${url.slice(0, 100)}`,
        "warning",
      );
      return success(interaction, interaction.guild, "Server banner updated successfully.");
    } catch (e) {
      return error(
        interaction,
        interaction.guild,
        `Failed to set server banner. Missing permissions or insufficient server boosts (Level 2 required).\n\`${e.message}\``,
      );
    }
  },

  async execute(message, args, client) {
    const url = args[0];
    if (!url) {
      return error(message, message.guild, "Please provide an image URL. Example: `!setserverbanner <url>`");
    }
    try {
      await message.guild.setBanner(url);
      addAudit(
        message.guild.id,
        "setserverbanner",
        message.author.tag,
        `Server banner updated to ${url.slice(0, 100)}`,
        "warning",
      );
      return success(message, message.guild, "Server banner updated successfully.");
    } catch (e) {
      return error(
        message,
        message.guild,
        `Failed to set server banner. Missing permissions or insufficient server boosts (Level 2 required).\n\`${e.message}\``,
      );
    }
  },
};
