const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { addAudit } = require("../../database");
const { success, error } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban a user by their ID")
    .addStringOption((o) =>
      o.setName("userid").setDescription("The banned user's ID").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("reason").setDescription("Reason for the unban").setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  name: "unban",
  category: "Moderation",
  permissions: [PermissionFlagsBits.BanMembers],
  aliases: [],

  async executeInteraction(interaction, client) {
    const userId = interaction.options.getString("userid")?.trim();
    const reason = interaction.options.getString("reason") || "No reason provided";

    if (!userId || !/^\d{17,20}$/.test(userId))
      return error(interaction, interaction.guild, "Please provide a valid user ID (17-20 digits).");

    const me = interaction.guild.members.me;
    if (!me.permissions.has(PermissionFlagsBits.BanMembers))
      return error(interaction, interaction.guild, "I lack the **Ban Members** permission.");

    try {
      await interaction.guild.bans.unban(userId, `${interaction.user.tag}: ${reason}`);
    } catch (e) {
      if (e.code === 10026) return error(interaction, interaction.guild, "That user is not banned.");
      return error(interaction, interaction.guild, `Failed to unban: ${e.message}`);
    }

    addAudit(interaction.guild.id, "unban", interaction.user.tag, `Unbanned ${userId} — ${reason}`, "info");
    return success(interaction, interaction.guild, `User **\`${userId}\`** has been unbanned.`);
  },

  async execute(message, args, client) {
    const userId = (args[0] || "").trim();
    const reason = args.slice(1).join(" ") || "No reason provided";

    if (!userId || !/^\d{17,20}$/.test(userId))
      return error(message, message.guild, "Please provide a valid user ID (17-20 digits).");

    const me = message.guild.members.me;
    if (!me.permissions.has(PermissionFlagsBits.BanMembers))
      return error(message, message.guild, "I lack the **Ban Members** permission.");

    try {
      await message.guild.bans.unban(userId, `${message.author.tag}: ${reason}`);
    } catch (e) {
      if (e.code === 10026) return error(message, message.guild, "That user is not banned.");
      return error(message, message.guild, `Failed to unban: ${e.message}`);
    }

    addAudit(message.guild.id, "unban", message.author.tag, `Unbanned ${userId} — ${reason}`, "info");
    return success(message, message.guild, `User **\`${userId}\`** has been unbanned.`);
  },
};
