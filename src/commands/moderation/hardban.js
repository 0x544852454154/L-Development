const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { addAudit } = require("../../database");
const { sendEmbed, error } = require("../../embedBuilder");

const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60; // 604800

module.exports = {
  data: new SlashCommandBuilder()
    .setName("hardban")
    .setDescription("Ban a member and delete their last 7 days of messages")
    .addUserOption((o) =>
      o.setName("user").setDescription("The member to hardban").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("reason").setDescription("Reason for the hardban").setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  name: "hardban",
  category: "Moderation",
  permissions: [PermissionFlagsBits.BanMembers],
  aliases: ["forceban"],

  async executeInteraction(interaction, client) {
    const target = interaction.options.getMember("user");
    const reason = interaction.options.getString("reason") || "No reason provided";

    if (!target) return error(interaction, interaction.guild, "That member was not found in this server.");
    if (target.id === interaction.guild.ownerId) return error(interaction, interaction.guild, "I cannot ban the server owner.");
    if (target.id === client.user.id) return error(interaction, interaction.guild, "I cannot ban myself.");

    const me = interaction.guild.members.me;
    if (!me.permissions.has(PermissionFlagsBits.BanMembers))
      return error(interaction, interaction.guild, "I lack the **Ban Members** permission.");

    if (
      target.roles.highest.position >= interaction.member.roles.highest.position &&
      interaction.guild.ownerId !== interaction.user.id
    )
      return error(interaction, interaction.guild, "You cannot hardban a member with an equal or higher role than you.");

    if (target.roles.highest.position >= me.roles.highest.position)
      return error(interaction, interaction.guild, "That member has an equal or higher role than me. I cannot ban them.");

    try {
      await target.ban({
        reason: `${interaction.user.tag}: ${reason}`,
        deleteMessageSeconds: SEVEN_DAYS_SECONDS,
      });
    } catch (e) {
      return error(interaction, interaction.guild, `Failed to hardban: ${e.message}`);
    }

    addAudit(
      interaction.guild.id,
      "hardban",
      interaction.user.tag,
      `Hardbanned ${target.user.tag} (7d messages wiped) — ${reason}`,
      "danger"
    );
    return sendEmbed(interaction, "ban_success", interaction.guild, { user: target.user.tag, reason });
  },

  async execute(message, args, client) {
    const target = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
    const reason = args.slice(1).join(" ") || "No reason provided";

    if (!target) return error(message, message.guild, "Please mention a user or provide a valid user ID.");
    if (target.id === message.guild.ownerId) return error(message, message.guild, "I cannot ban the server owner.");
    if (target.id === client.user.id) return error(message, message.guild, "I cannot ban myself.");

    const me = message.guild.members.me;
    if (!me.permissions.has(PermissionFlagsBits.BanMembers))
      return error(message, message.guild, "I lack the **Ban Members** permission.");

    if (
      target.roles.highest.position >= message.member.roles.highest.position &&
      message.guild.ownerId !== message.author.id
    )
      return error(message, message.guild, "You cannot hardban a member with an equal or higher role than you.");

    if (target.roles.highest.position >= me.roles.highest.position)
      return error(message, message.guild, "That member has an equal or higher role than me. I cannot ban them.");

    try {
      await target.ban({
        reason: `${message.author.tag}: ${reason}`,
        deleteMessageSeconds: SEVEN_DAYS_SECONDS,
      });
    } catch (e) {
      return error(message, message.guild, `Failed to hardban: ${e.message}`);
    }

    addAudit(
      message.guild.id,
      "hardban",
      message.author.tag,
      `Hardbanned ${target.user.tag} (7d messages wiped) — ${reason}`,
      "danger"
    );
    return sendEmbed(message, "ban_success", message.guild, { user: target.user.tag, reason });
  },
};
