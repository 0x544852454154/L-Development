const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { updateGuild, getGuild, addAudit } = require("../../database");
const { success, error } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("autorole")
    .setDescription("Manage roles automatically assigned to new members")
    .addStringOption((o) =>
      o
        .setName("action")
        .setDescription("Action to perform")
        .setRequired(true)
        .addChoices(
          { name: "add — add an autorole", value: "add" },
          { name: "remove — remove an autorole", value: "remove" },
          { name: "list — list autoroles", value: "list" },
        )
    )
    .addRoleOption((o) => o.setName("role").setDescription("Role to add or remove").setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  name: "autorole",
  category: "Premium",
  premium: true,
  permissions: [PermissionFlagsBits.ManageRoles],
  aliases: [],

  async executeInteraction(interaction, client) {
    const action = interaction.options.getString("action");
    const role = interaction.options.getRole("role");
    const data = getGuild(interaction.guild.id);
    const autorole = data.autorole || { roles: [] };

    if (action === "list") {
      if (!autorole.roles.length) {
        return success(interaction, interaction.guild, "No autoroles configured. Use `/autorole add @role` to add one.");
      }
      const list = autorole.roles.map((id) => `<@&${id}> (\`${id}\`)`).join("\n") || "None";
      return success(interaction, interaction.guild, `**Autoroles (${autorole.roles.length}):**\n${list}`);
    }

    if (action === "add") {
      if (!role) return error(interaction, interaction.guild, "Please specify a role to add.");
      if (autorole.roles.includes(role.id)) {
        return error(interaction, interaction.guild, "That role is already an autorole.");
      }
      updateGuild(interaction.guild.id, (d) => {
        if (!d.autorole) d.autorole = { roles: [] };
        d.autorole.roles.push(role.id);
      });
      addAudit(
        interaction.guild.id,
        "autorole_add",
        interaction.user.tag,
        `Added ${role.name} (${role.id}) to autoroles`,
        "info",
      );
      return success(
        interaction,
        interaction.guild,
        `Added **${role.name}** to autoroles. New members will receive this role automatically.`,
      );
    }

    if (action === "remove") {
      if (!role) return error(interaction, interaction.guild, "Please specify a role to remove.");
      if (!autorole.roles.includes(role.id)) {
        return error(interaction, interaction.guild, "That role is not an autorole.");
      }
      updateGuild(interaction.guild.id, (d) => {
        if (!d.autorole) d.autorole = { roles: [] };
        d.autorole.roles = d.autorole.roles.filter((id) => id !== role.id);
      });
      addAudit(
        interaction.guild.id,
        "autorole_remove",
        interaction.user.tag,
        `Removed ${role.name} (${role.id}) from autoroles`,
        "info",
      );
      return success(interaction, interaction.guild, `Removed **${role.name}** from autoroles.`);
    }

    return error(interaction, interaction.guild, "Unknown action. Use `add`, `remove`, or `list`.");
  },

  async execute(message, args, client) {
    const action = args[0];
    const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[1]);
    const data = getGuild(message.guild.id);
    const autorole = data.autorole || { roles: [] };

    if (action === "list" || !action) {
      if (!autorole.roles.length) {
        return success(message, message.guild, "No autoroles configured. Use `!autorole add @role` to add one.");
      }
      const list = autorole.roles.map((id) => `<@&${id}> (\`${id}\`)`).join("\n") || "None";
      return success(message, message.guild, `**Autoroles (${autorole.roles.length}):**\n${list}`);
    }

    if (action === "add") {
      if (!role) {
        return error(message, message.guild, "Please mention a role or provide its ID. Example: `!autorole add @role`");
      }
      if (autorole.roles.includes(role.id)) {
        return error(message, message.guild, "That role is already an autorole.");
      }
      updateGuild(message.guild.id, (d) => {
        if (!d.autorole) d.autorole = { roles: [] };
        d.autorole.roles.push(role.id);
      });
      addAudit(
        message.guild.id,
        "autorole_add",
        message.author.tag,
        `Added ${role.name} (${role.id}) to autoroles`,
        "info",
      );
      return success(
        message,
        message.guild,
        `Added **${role.name}** to autoroles. New members will receive this role automatically.`,
      );
    }

    if (action === "remove") {
      if (!role) {
        return error(message, message.guild, "Please mention a role or provide its ID. Example: `!autorole remove @role`");
      }
      if (!autorole.roles.includes(role.id)) {
        return error(message, message.guild, "That role is not an autorole.");
      }
      updateGuild(message.guild.id, (d) => {
        if (!d.autorole) d.autorole = { roles: [] };
        d.autorole.roles = d.autorole.roles.filter((id) => id !== role.id);
      });
      addAudit(
        message.guild.id,
        "autorole_remove",
        message.author.tag,
        `Removed ${role.name} (${role.id}) from autoroles`,
        "info",
      );
      return success(message, message.guild, `Removed **${role.name}** from autoroles.`);
    }

    return error(message, message.guild, "Usage: `!autorole add|remove|list @role`");
  },
};
