const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { getGuild, updateGuild, addAudit } = require("../../database");
const { success, error } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("nukehooks")
    .setDescription("Toggle webhook nuke detection (mass webhook deletion)")
    .addStringOption((o) =>
      o.setName("action").setDescription("Toggle nukehooks on or off").setRequired(true)
        .addChoices({ name: "on", value: "on" }, { name: "off", value: "off" })
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  name: "nukehooks",
  category: "Antinuke",
  permissions: [PermissionFlagsBits.ManageGuild],
  aliases: ["nh"],

  async executeInteraction(interaction, client) {
    const action = interaction.options.getString("action");
    return runNukehooks(interaction, interaction.guild, interaction.user, action);
  },

  async execute(message, args, client) {
    const action = (args[0] || "").toLowerCase();
    if (!["on", "off"].includes(action)) {
      return error(message, message.guild, `Usage: \`${getGuild(message.guild.id).prefix}nukehooks <on|off>\``);
    }
    return runNukehooks(message, message.guild, message.author, action);
  },
};

function runNukehooks(ctx, guild, user, action) {
  const enable = action === "on";
  updateGuild(guild.id, (d) => { d.antinuke.nukehooks = enable; });
  addAudit(
    guild.id,
    "Nukehooks Toggled",
    user.tag,
    `Nukehooks ${enable ? "enabled" : "disabled"}`,
    enable ? "warning" : "info"
  );
  const detail = enable
    ? "Webhook nuke detection is now **ENABLED**. Mass webhook deletion will trigger the antinuke shield."
    : "Webhook nuke detection is now **DISABLED**.";
  return success(ctx, guild, detail);
}
