const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { getGuild, updateGuild, addAudit } = require("../../database");
const { success, error } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("whitelist")
    .setDescription("Add or remove a single role or user from the antinuke whitelist")
    .addStringOption((o) =>
      o.setName("action").setDescription("Add or remove").setRequired(true)
        .addChoices({ name: "add", value: "add" }, { name: "remove", value: "remove" })
    )
    .addStringOption((o) =>
      o.setName("type").setDescription("Role or user").setRequired(true)
        .addChoices({ name: "role", value: "role" }, { name: "user", value: "user" })
    )
    .addRoleOption((o) => o.setName("role").setDescription("The role to whitelist").setRequired(false))
    .addUserOption((o) => o.setName("user").setDescription("The user to whitelist").setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  name: "whitelist",
  category: "Antinuke",
  permissions: [PermissionFlagsBits.ManageGuild],
  aliases: ["wl"],

  async executeInteraction(interaction, client) {
    const action = interaction.options.getString("action");
    const type = interaction.options.getString("type");
    const role = interaction.options.getRole("role");
    const user = interaction.options.getUser("user");
    if (type === "role" && !role) {
      return error(interaction, interaction.guild, "Please provide a role to whitelist.");
    }
    if (type === "user" && !user) {
      return error(interaction, interaction.guild, "Please provide a user to whitelist.");
    }
    const target = type === "role"
      ? { id: role.id, name: role.name }
      : { id: user.id, name: user.tag };
    return runWhitelist(interaction, interaction.guild, interaction.user, action, type, target);
  },

  async execute(message, args, client) {
    const data = getGuild(message.guild.id);
    const action = (args[0] || "").toLowerCase();
    const type = (args[1] || "").toLowerCase();
    if (!["add", "remove"].includes(action) || !["role", "user"].includes(type)) {
      return error(message, message.guild, `Usage: \`${data.prefix}whitelist <add|remove> <role|user> @target\``);
    }
    let target;
    if (type === "role") {
      const role = message.mentions.roles.first();
      if (role) {
        target = { id: role.id, name: role.name };
      } else {
        const id = args[2];
        if (!id || !/^\d+$/.test(id)) {
          return error(message, message.guild, "Please mention a role or provide a valid role ID.");
        }
        const fetched = await message.guild.roles.fetch(id).catch(() => null);
        if (!fetched) return error(message, message.guild, "Role not found.");
        target = { id: fetched.id, name: fetched.name };
      }
    } else {
      const user = message.mentions.users.first();
      if (user) {
        target = { id: user.id, name: user.tag };
      } else {
        const id = args[2];
        if (!id || !/^\d+$/.test(id)) {
          return error(message, message.guild, "Please mention a user or provide a valid user ID.");
        }
        const fetched = await client.users.fetch(id).catch(() => null);
        if (!fetched) return error(message, message.guild, "User not found.");
        target = { id: fetched.id, name: fetched.tag };
      }
    }
    return runWhitelist(message, message.guild, message.author, action, type, target);
  },
};

function runWhitelist(ctx, guild, author, action, type, target) {
  const data = getGuild(guild.id);
  const key = type === "role" ? "whitelistedRoles" : "whitelistedUsers";
  const list = data.antinuke[key] || [];
  const typeLabel = type === "role" ? "Role" : "User";

  if (action === "add") {
    if (list.includes(target.id)) {
      return error(ctx, guild, `${typeLabel} **${target.name}** is already whitelisted.`);
    }
    updateGuild(guild.id, (d) => { d.antinuke[key].push(target.id); });
    addAudit(guild.id, "Whitelist Add", author.tag, `Added ${typeLabel.toLowerCase()} ${target.name} (${target.id})`, "info");
    return success(ctx, guild, `${typeLabel} **${target.name}** added to the antinuke whitelist.`);
  }

  // remove
  if (!list.includes(target.id)) {
    return error(ctx, guild, `${typeLabel} **${target.name}** is not whitelisted.`);
  }
  updateGuild(guild.id, (d) => {
    d.antinuke[key] = d.antinuke[key].filter((id) => id !== target.id);
  });
  addAudit(guild.id, "Whitelist Remove", author.tag, `Removed ${typeLabel.toLowerCase()} ${target.name} (${target.id})`, "info");
  return success(ctx, guild, `${typeLabel} **${target.name}** removed from the antinuke whitelist.`);
}
