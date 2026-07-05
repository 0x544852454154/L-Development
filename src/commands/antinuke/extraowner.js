const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { getGuild, updateGuild, addAudit } = require("../../database");
const { success, error } = require("../../embedBuilder");
const config = require("../../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("extraowner")
    .setDescription("Add or remove an extra owner (bypasses antinuke)")
    .addStringOption((o) =>
      o.setName("action").setDescription("Add or remove").setRequired(true)
        .addChoices({ name: "add", value: "add" }, { name: "remove", value: "remove" })
    )
    .addUserOption((o) => o.setName("user").setDescription("The user to add/remove").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  name: "extraowner",
  category: "Antinuke",
  permissions: [PermissionFlagsBits.ManageGuild],
  aliases: ["eo"],

  async executeInteraction(interaction, client) {
    const action = interaction.options.getString("action");
    const target = interaction.options.getUser("user");
    return runExtraOwner(interaction, interaction.guild, interaction.user, action, target);
  },

  async execute(message, args, client) {
    const data = getGuild(message.guild.id);
    const action = (args[0] || "").toLowerCase();
    if (!["add", "remove"].includes(action)) {
      return error(message, message.guild, `Usage: \`${data.prefix}extraowner <add|remove> @user\``);
    }
    let target = message.mentions.users.first();
    if (!target) {
      const id = args[1];
      if (!id || !/^\d+$/.test(id)) {
        return error(message, message.guild, "Please mention a user or provide a valid user ID.");
      }
      target = await client.users.fetch(id).catch(() => null);
      if (!target) return error(message, message.guild, "User not found.");
    }
    return runExtraOwner(message, message.guild, message.author, action, target);
  },
};

function runExtraOwner(ctx, guild, author, action, target) {
  const data = getGuild(guild.id);

  // Authorization: guild owner, existing extra owner, or bot owner
  const isOwner = author.id === guild.ownerId;
  const isExtraOwner = data.antinuke.extraOwners.includes(author.id);
  const isBotOwner = config.ownerId && author.id === config.ownerId;
  if (!isOwner && !isExtraOwner && !isBotOwner) {
    return error(ctx, guild, "Only the server owner, an existing extra owner, or the bot owner can manage extra owners.");
  }

  if (action === "add") {
    if (data.antinuke.extraOwners.includes(target.id)) {
      return error(ctx, guild, `**${target.tag}** is already an extra owner.`);
    }
    updateGuild(guild.id, (d) => { d.antinuke.extraOwners.push(target.id); });
    addAudit(guild.id, "Extra Owner Added", author.tag, `Added ${target.tag} (${target.id})`, "warning");
    return success(ctx, guild, `**${target.tag}** is now an **Extra Owner** — they bypass all antinuke protection.`);
  }

  // remove
  if (!data.antinuke.extraOwners.includes(target.id)) {
    return error(ctx, guild, `**${target.tag}** is not an extra owner.`);
  }
  updateGuild(guild.id, (d) => {
    d.antinuke.extraOwners = d.antinuke.extraOwners.filter((id) => id !== target.id);
  });
  addAudit(guild.id, "Extra Owner Removed", author.tag, `Removed ${target.tag} (${target.id})`, "warning");
  return success(ctx, guild, `**${target.tag}** is no longer an extra owner.`);
}
