const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { success, error } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("role")
    .setDescription("Add or remove a role from a member")
    .addStringOption((o) =>
      o
        .setName("action")
        .setDescription("Add or remove")
        .setRequired(true)
        .addChoices(
          { name: "add", value: "add" },
          { name: "remove", value: "remove" }
        )
    )
    .addUserOption((o) =>
      o.setName("user").setDescription("The member to modify").setRequired(true)
    )
    .addRoleOption((o) =>
      o.setName("role").setDescription("The role to add or remove").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  name: "role",
  category: "Moderation",
  permissions: [PermissionFlagsBits.ManageRoles],
  aliases: [],

  async executeInteraction(interaction, client) {
    const action = interaction.options.getString("action");
    const target = interaction.options.getMember("user");
    const role = interaction.options.getRole("role");

    if (!target) return error(interaction, interaction.guild, "That member was not found in this server.");
    if (!role) return error(interaction, interaction.guild, "Please specify a role.");

    const me = interaction.guild.members.me;
    if (!me.permissions.has(PermissionFlagsBits.ManageRoles))
      return error(interaction, interaction.guild, "I lack the **Manage Roles** permission.");
    if (role.position >= me.roles.highest.position)
      return error(interaction, interaction.guild, "That role is equal to or higher than my highest role. I cannot manage it.");
    if (
      role.position >= interaction.member.roles.highest.position &&
      interaction.guild.ownerId !== interaction.user.id
    )
      return error(interaction, interaction.guild, "You cannot manage a role equal to or higher than your highest role.");
    if (role.id === role.guild.roles.everyone.id)
      return error(interaction, interaction.guild, "I cannot add or remove the \`@everyone\` role.");
    if (role.managed)
      return error(interaction, interaction.guild, "That role is managed by an integration (e.g. bot or booster) and cannot be assigned manually.");

    try {
      if (action === "add") {
        if (target.roles.cache.has(role.id))
          return error(interaction, interaction.guild, `${target.user.tag} already has the **${role.name}** role.`);
        await target.roles.add(role, `${interaction.user.tag}: role add`);
        return success(interaction, interaction.guild, `Added **${role.name}** to **${target.user.tag}**.`);
      } else {
        if (!target.roles.cache.has(role.id))
          return error(interaction, interaction.guild, `${target.user.tag} does not have the **${role.name}** role.`);
        await target.roles.remove(role, `${interaction.user.tag}: role remove`);
        return success(interaction, interaction.guild, `Removed **${role.name}** from **${target.user.tag}**.`);
      }
    } catch (e) {
      return error(interaction, interaction.guild, `Failed to modify role: ${e.message}`);
    }
  },

  async execute(message, args, client) {
    const action = (args[0] || "").toLowerCase();
    if (action !== "add" && action !== "remove")
      return error(message, message.guild, "Usage: `role add @user @role` or `role remove @user @role`.");

    const target = message.mentions.members.first() || message.guild.members.cache.get(args[1]);
    const role =
      message.mentions.roles.first() ||
      message.guild.roles.cache.get(args[2]) ||
      (target ? message.guild.roles.cache.find((r) => r.name.toLowerCase() === args.slice(2).join(" ").toLowerCase()) : null);

    if (!target) return error(message, message.guild, "Please mention a user or provide a valid user ID.");
    if (!role) return error(message, message.guild, "Please mention a role or provide a valid role ID/name.");

    const me = message.guild.members.me;
    if (!me.permissions.has(PermissionFlagsBits.ManageRoles))
      return error(message, message.guild, "I lack the **Manage Roles** permission.");
    if (role.position >= me.roles.highest.position)
      return error(message, message.guild, "That role is equal to or higher than my highest role. I cannot manage it.");
    if (
      role.position >= message.member.roles.highest.position &&
      message.guild.ownerId !== message.author.id
    )
      return error(message, message.guild, "You cannot manage a role equal to or higher than your highest role.");
    if (role.id === role.guild.roles.everyone.id)
      return error(message, message.guild, "I cannot add or remove the \`@everyone\` role.");
    if (role.managed)
      return error(message, message.guild, "That role is managed by an integration (e.g. bot or booster) and cannot be assigned manually.");

    try {
      if (action === "add") {
        if (target.roles.cache.has(role.id))
          return error(message, message.guild, `${target.user.tag} already has the **${role.name}** role.`);
        await target.roles.add(role, `${message.author.tag}: role add`);
        return success(message, message.guild, `Added **${role.name}** to **${target.user.tag}**.`);
      } else {
        if (!target.roles.cache.has(role.id))
          return error(message, message.guild, `${target.user.tag} does not have the **${role.name}** role.`);
        await target.roles.remove(role, `${message.author.tag}: role remove`);
        return success(message, message.guild, `Removed **${role.name}** from **${target.user.tag}**.`);
      }
    } catch (e) {
      return error(message, message.guild, `Failed to modify role: ${e.message}`);
    }
  },
};
