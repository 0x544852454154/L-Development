const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { updateGuild } = require("../../database");
const { success, error } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("prefix")
    .setDescription("Set the bot's command prefix for this server")
    .addStringOption((o) =>
      o.setName("prefix").setDescription("New prefix (max 5 characters)").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  name: "prefix",
  category: "Util",
  permissions: [PermissionFlagsBits.ManageGuild],
  aliases: ["setprefix"],

  async executeInteraction(interaction, client) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return error(interaction, interaction.guild, "You need **Manage Server** permission.");
    }
    const newPrefix = (interaction.options.getString("prefix") || "").trim();
    return setPrefix(interaction, interaction.guild, newPrefix, interaction.user);
  },

  async execute(message, args, client) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return error(message, message.guild, "You need **Manage Server** permission.");
    }
    const newPrefix = args.join(" ").trim();
    return setPrefix(message, message.guild, newPrefix, message.author);
  },
};

function setPrefix(ctx, guild, newPrefix, actor) {
  if (!newPrefix) return error(ctx, guild, "Provide a new prefix.");
  if (newPrefix.length > 5) return error(ctx, guild, "Prefix must be **5 characters or fewer**.");
  updateGuild(guild.id, (d) => {
    d.prefix = newPrefix;
  });
  return success(ctx, guild, `Prefix changed to \`${newPrefix}\` by ${actor}.`);
}
