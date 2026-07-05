const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { addAudit } = require("../../database");
const { sendEmbed, error } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a member from the server")
    .addUserOption((o) =>
      o.setName("user").setDescription("The member to kick").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("reason").setDescription("Reason for the kick").setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  name: "kick",
  category: "Moderation",
  permissions: [PermissionFlagsBits.KickMembers],
  aliases: [],

  async executeInteraction(interaction, client) {
    const target = interaction.options.getMember("user");
    const reason = interaction.options.getString("reason") || "No reason provided";

    if (!target) return error(interaction, interaction.guild, "That member was not found in this server.");
    if (target.id === interaction.guild.ownerId) return error(interaction, interaction.guild, "I cannot kick the server owner.");
    if (target.id === client.user.id) return error(interaction, interaction.guild, "I cannot kick myself.");

    const me = interaction.guild.members.me;
    if (!me.permissions.has(PermissionFlagsBits.KickMembers))
      return error(interaction, interaction.guild, "I lack the **Kick Members** permission.");

    if (
      target.roles.highest.position >= interaction.member.roles.highest.position &&
      interaction.guild.ownerId !== interaction.user.id
    )
      return error(interaction, interaction.guild, "You cannot kick a member with an equal or higher role than you.");

    if (target.roles.highest.position >= me.roles.highest.position)
      return error(interaction, interaction.guild, "That member has an equal or higher role than me. I cannot kick them.");

    try {
      await target.kick(`${interaction.user.tag}: ${reason}`);
    } catch (e) {
      return error(interaction, interaction.guild, `Failed to kick: ${e.message}`);
    }

    addAudit(interaction.guild.id, "kick", interaction.user.tag, `Kicked ${target.user.tag} — ${reason}`, "warning");
    return sendEmbed(interaction, "kick_success", interaction.guild, { user: target.user.tag, reason });
  },

  async execute(message, args, client) {
    const target = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
    const reason = args.slice(1).join(" ") || "No reason provided";

    if (!target) return error(message, message.guild, "Please mention a user or provide a valid user ID.");
    if (target.id === message.guild.ownerId) return error(message, message.guild, "I cannot kick the server owner.");
    if (target.id === client.user.id) return error(message, message.guild, "I cannot kick myself.");

    const me = message.guild.members.me;
    if (!me.permissions.has(PermissionFlagsBits.KickMembers))
      return error(message, message.guild, "I lack the **Kick Members** permission.");

    if (
      target.roles.highest.position >= message.member.roles.highest.position &&
      message.guild.ownerId !== message.author.id
    )
      return error(message, message.guild, "You cannot kick a member with an equal or higher role than you.");

    if (target.roles.highest.position >= me.roles.highest.position)
      return error(message, message.guild, "That member has an equal or higher role than me. I cannot kick them.");

    try {
      await target.kick(`${message.author.tag}: ${reason}`);
    } catch (e) {
      return error(message, message.guild, `Failed to kick: ${e.message}`);
    }

    addAudit(message.guild.id, "kick", message.author.tag, `Kicked ${target.user.tag} — ${reason}`, "warning");
    return sendEmbed(message, "kick_success", message.guild, { user: target.user.tag, reason });
  },
};
