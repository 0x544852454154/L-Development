const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { updateGuild, getGuild, addAudit } = require("../../database");
const { success, error } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("boosterrole")
    .setDescription("Configure a role that server boosters can self-assign")
    .addStringOption((o) =>
      o
        .setName("action")
        .setDescription("Action to perform")
        .setRequired(true)
        .addChoices(
          { name: "setup — set the booster role", value: "setup" },
          { name: "remove — remove the booster role", value: "remove" },
        )
    )
    .addRoleOption((o) => o.setName("role").setDescription("Role boosters can self-assign (for setup)").setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  name: "boosterrole",
  category: "Premium",
  premium: true,
  permissions: [PermissionFlagsBits.ManageRoles],
  aliases: [],

  async executeInteraction(interaction, client) {
    const action = interaction.options.getString("action");
    const role = interaction.options.getRole("role");

    if (action === "setup") {
      if (!role) return error(interaction, interaction.guild, "Please specify a role to set as the booster role.");
      updateGuild(interaction.guild.id, (d) => {
        d.boosterRole = role.id;
      });
      addAudit(
        interaction.guild.id,
        "boosterrole_setup",
        interaction.user.tag,
        `Booster role set to ${role.name} (${role.id})`,
        "info",
      );
      return success(
        interaction,
        interaction.guild,
        `Booster role set to **${role.name}**. Server boosters can now self-assign this role.`,
      );
    }

    if (action === "remove") {
      const data = getGuild(interaction.guild.id);
      if (!data.boosterRole) {
        return error(interaction, interaction.guild, "No booster role is currently configured.");
      }
      updateGuild(interaction.guild.id, (d) => {
        d.boosterRole = null;
      });
      addAudit(interaction.guild.id, "boosterrole_remove", interaction.user.tag, "Booster role removed", "info");
      return success(interaction, interaction.guild, "Booster role has been removed.");
    }

    return error(interaction, interaction.guild, "Unknown action. Use `setup` or `remove`.");
  },

  async execute(message, args, client) {
    const action = args[0];

    if (action === "setup") {
      const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[1]);
      if (!role) {
        return error(message, message.guild, "Please mention a role or provide its ID. Example: `!boosterrole setup @role`");
      }
      updateGuild(message.guild.id, (d) => {
        d.boosterRole = role.id;
      });
      addAudit(
        message.guild.id,
        "boosterrole_setup",
        message.author.tag,
        `Booster role set to ${role.name} (${role.id})`,
        "info",
      );
      return success(
        message,
        message.guild,
        `Booster role set to **${role.name}**. Server boosters can now self-assign this role.`,
      );
    }

    if (action === "remove") {
      const data = getGuild(message.guild.id);
      if (!data.boosterRole) {
        return error(message, message.guild, "No booster role is currently configured.");
      }
      updateGuild(message.guild.id, (d) => {
        d.boosterRole = null;
      });
      addAudit(message.guild.id, "boosterrole_remove", message.author.tag, "Booster role removed", "info");
      return success(message, message.guild, "Booster role has been removed.");
    }

    return error(message, message.guild, "Usage: `!boosterrole setup @role` or `!boosterrole remove`");
  },
};
