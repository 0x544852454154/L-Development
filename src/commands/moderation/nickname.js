const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { success, error } = require("../../embedBuilder");

const CLEAR_TOKENS = new Set(["none", "off", "clear", "reset"]);

module.exports = {
  data: new SlashCommandBuilder()
    .setName("nickname")
    .setDescription("Change or clear a member's nickname")
    .addUserOption((o) =>
      o.setName("user").setDescription("The member to rename").setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName("name")
        .setDescription("New nickname (use 'none' to clear)")
        .setRequired(true)
        .setMaxLength(32)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),
  name: "nickname",
  category: "Moderation",
  permissions: [PermissionFlagsBits.ManageNicknames],
  aliases: ["nick", "rename"],

  async executeInteraction(interaction, client) {
    const target = interaction.options.getMember("user");
    const name = interaction.options.getString("name");

    if (!target) return error(interaction, interaction.guild, "That member was not found in this server.");
    if (target.id === interaction.guild.ownerId) return error(interaction, interaction.guild, "I cannot rename the server owner.");
    if (target.id === client.user.id) return error(interaction, interaction.guild, "I cannot rename myself.");

    const me = interaction.guild.members.me;
    if (!me.permissions.has(PermissionFlagsBits.ManageNicknames))
      return error(interaction, interaction.guild, "I lack the **Manage Nicknames** permission.");

    if (
      target.roles.highest.position >= interaction.member.roles.highest.position &&
      interaction.guild.ownerId !== interaction.user.id
    )
      return error(interaction, interaction.guild, "You cannot rename a member with an equal or higher role than you.");

    if (target.roles.highest.position >= me.roles.highest.position)
      return error(interaction, interaction.guild, "That member has an equal or higher role than me. I cannot rename them.");

    const newName = CLEAR_TOKENS.has(name.toLowerCase()) ? null : name;
    try {
      await target.setNickname(newName, `${interaction.user.tag}: nickname change`);
    } catch (e) {
      return error(interaction, interaction.guild, `Failed to set nickname: ${e.message}`);
    }

    return success(
      interaction,
      interaction.guild,
      `Nickname for **${target.user.tag}** set to **${newName ? newName : "(cleared)"}**.`
    );
  },

  async execute(message, args, client) {
    const target = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
    const name = args.slice(1).join(" ");

    if (!target) return error(message, message.guild, "Please mention a user or provide a valid user ID.");
    if (!name) return error(message, message.guild, "Please provide a new nickname (or `none` to clear).");
    if (target.id === message.guild.ownerId) return error(message, message.guild, "I cannot rename the server owner.");
    if (target.id === client.user.id) return error(message, message.guild, "I cannot rename myself.");

    const me = message.guild.members.me;
    if (!me.permissions.has(PermissionFlagsBits.ManageNicknames))
      return error(message, message.guild, "I lack the **Manage Nicknames** permission.");

    if (
      target.roles.highest.position >= message.member.roles.highest.position &&
      message.guild.ownerId !== message.author.id
    )
      return error(message, message.guild, "You cannot rename a member with an equal or higher role than you.");

    if (target.roles.highest.position >= me.roles.highest.position)
      return error(message, message.guild, "That member has an equal or higher role than me. I cannot rename them.");

    if (name.length > 32) return error(message, message.guild, "Nicknames cannot exceed 32 characters.");

    const newName = CLEAR_TOKENS.has(name.toLowerCase()) ? null : name;
    try {
      await target.setNickname(newName, `${message.author.tag}: nickname change`);
    } catch (e) {
      return error(message, message.guild, `Failed to set nickname: ${e.message}`);
    }

    return success(
      message,
      message.guild,
      `Nickname for **${target.user.tag}** set to **${newName ? newName : "(cleared)"}**.`
    );
  },
};
