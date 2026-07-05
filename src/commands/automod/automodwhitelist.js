const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { getGuild, updateGuild, addAudit } = require("../../database");
const { success, error } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("automodwhitelist")
    .setDescription("Add or remove a channel or role from the automod whitelist")
    .addStringOption((o) =>
      o.setName("action").setDescription("Add or remove").setRequired(true)
        .addChoices({ name: "add", value: "add" }, { name: "remove", value: "remove" })
    )
    .addStringOption((o) =>
      o.setName("type").setDescription("Channel or role").setRequired(true)
        .addChoices({ name: "channel", value: "channel" }, { name: "role", value: "role" })
    )
    .addChannelOption((o) => o.setName("channel").setDescription("The channel to whitelist").setRequired(false))
    .addRoleOption((o) => o.setName("role").setDescription("The role to whitelist").setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  name: "automodwhitelist",
  category: "Automod",
  permissions: [PermissionFlagsBits.ManageGuild],
  aliases: ["amwl"],

  async executeInteraction(interaction, client) {
    const action = interaction.options.getString("action");
    const type = interaction.options.getString("type");
    const channel = interaction.options.getChannel("channel");
    const role = interaction.options.getRole("role");
    if (type === "channel" && !channel) {
      return error(interaction, interaction.guild, "Please provide a channel to whitelist.");
    }
    if (type === "role" && !role) {
      return error(interaction, interaction.guild, "Please provide a role to whitelist.");
    }
    const target = type === "channel"
      ? { id: channel.id, name: channel.name }
      : { id: role.id, name: role.name };
    return runAmWhitelist(interaction, interaction.guild, interaction.user, action, type, target);
  },

  async execute(message, args, client) {
    const data = getGuild(message.guild.id);
    const action = (args[0] || "").toLowerCase();
    const type = (args[1] || "").toLowerCase();
    if (!["add", "remove"].includes(action) || !["channel", "role"].includes(type)) {
      return error(message, message.guild, `Usage: \`${data.prefix}automodwhitelist <add|remove> <channel|role> @target\``);
    }
    let target;
    if (type === "channel") {
      const channel = message.mentions.channels.first();
      if (channel) {
        target = { id: channel.id, name: channel.name };
      } else {
        const id = args[2];
        if (!id || !/^\d+$/.test(id)) {
          return error(message, message.guild, "Please mention a channel or provide a valid channel ID.");
        }
        const fetched = await message.guild.channels.fetch(id).catch(() => null);
        if (!fetched) return error(message, message.guild, "Channel not found.");
        target = { id: fetched.id, name: fetched.name };
      }
    } else {
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
    }
    return runAmWhitelist(message, message.guild, message.author, action, type, target);
  },
};

function runAmWhitelist(ctx, guild, author, action, type, target) {
  const data = getGuild(guild.id);
  const key = type === "channel" ? "whitelistedChannels" : "whitelistedRoles";
  const list = data.automod[key] || [];
  const typeLabel = type === "channel" ? "Channel" : "Role";

  if (action === "add") {
    if (list.includes(target.id)) {
      return error(ctx, guild, `${typeLabel} **${target.name}** is already automod-whitelisted.`);
    }
    updateGuild(guild.id, (d) => { d.automod[key].push(target.id); });
    addAudit(guild.id, "Automod Whitelist Add", author.tag, `Added ${typeLabel.toLowerCase()} ${target.name} (${target.id})`, "info");
    return success(ctx, guild, `${typeLabel} **${target.name}** added to the automod whitelist.`);
  }

  // remove
  if (!list.includes(target.id)) {
    return error(ctx, guild, `${typeLabel} **${target.name}** is not automod-whitelisted.`);
  }
  updateGuild(guild.id, (d) => {
    d.automod[key] = d.automod[key].filter((id) => id !== target.id);
  });
  addAudit(guild.id, "Automod Whitelist Remove", author.tag, `Removed ${typeLabel.toLowerCase()} ${target.name} (${target.id})`, "info");
  return success(ctx, guild, `${typeLabel} **${target.name}** removed from the automod whitelist.`);
}
