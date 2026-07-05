const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { addAudit } = require("../../database");
const { success, error } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Remove a timeout from a member")
    .addUserOption((o) =>
      o.setName("user").setDescription("The member to unmute").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("reason").setDescription("Reason for the untimeout").setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  name: "untimeout",
  category: "Moderation",
  permissions: [PermissionFlagsBits.ModerateMembers],
  aliases: ["unmute"],

  async executeInteraction(interaction, client) {
    const target = interaction.options.getMember("user");
    const reason = interaction.options.getString("reason") || "No reason provided";

    if (!target) return error(interaction, interaction.guild, "That member was not found in this server.");
    if (target.id === client.user.id) return error(interaction, interaction.guild, "I cannot untimeout myself.");

    const me = interaction.guild.members.me;
    if (!me.permissions.has(PermissionFlagsBits.ModerateMembers))
      return error(interaction, interaction.guild, "I lack the **Moderate Members** permission.");

    if (
      target.roles.highest.position >= interaction.member.roles.highest.position &&
      interaction.guild.ownerId !== interaction.user.id
    )
      return error(interaction, interaction.guild, "You cannot untimeout a member with an equal or higher role than you.");

    if (target.roles.highest.position >= me.roles.highest.position)
      return error(interaction, interaction.guild, "That member has an equal or higher role than me. I cannot untimeout them.");

    if (!target.isCommunicationDisabled || !target.isCommunicationDisabled())
      return error(interaction, interaction.guild, `${target.user.tag} is not currently timed out.`);

    try {
      await target.timeout(null, `${interaction.user.tag}: ${reason}`);
    } catch (e) {
      return error(interaction, interaction.guild, `Failed to remove timeout: ${e.message}`);
    }

    addAudit(interaction.guild.id, "untimeout", interaction.user.tag, `Untimed out ${target.user.tag} — ${reason}`, "info");
    return success(interaction, interaction.guild, `Removed timeout from **${target.user.tag}**.`);
  },

  async execute(message, args, client) {
    const target = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
    const reason = args.slice(1).join(" ") || "No reason provided";

    if (!target) return error(message, message.guild, "Please mention a user or provide a valid user ID.");
    if (target.id === client.user.id) return error(message, message.guild, "I cannot untimeout myself.");

    const me = message.guild.members.me;
    if (!me.permissions.has(PermissionFlagsBits.ModerateMembers))
      return error(message, message.guild, "I lack the **Moderate Members** permission.");

    if (
      target.roles.highest.position >= message.member.roles.highest.position &&
      message.guild.ownerId !== message.author.id
    )
      return error(message, message.guild, "You cannot untimeout a member with an equal or higher role than you.");

    if (target.roles.highest.position >= me.roles.highest.position)
      return error(message, message.guild, "That member has an equal or higher role than me. I cannot untimeout them.");

    if (!target.isCommunicationDisabled || !target.isCommunicationDisabled())
      return error(message, message.guild, `${target.user.tag} is not currently timed out.`);

    try {
      await target.timeout(null, `${message.author.tag}: ${reason}`);
    } catch (e) {
      return error(message, message.guild, `Failed to remove timeout: ${e.message}`);
    }

    addAudit(message.guild.id, "untimeout", message.author.tag, `Untimed out ${target.user.tag} — ${reason}`, "info");
    return success(message, message.guild, `Removed timeout from **${target.user.tag}**.`);
  },
};
