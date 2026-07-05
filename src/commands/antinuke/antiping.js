const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { getGuild, updateGuild, addAudit } = require("../../database");
const { success, error } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("antiping")
    .setDescription("Toggle anti-ping (blocks everyone/here pings from non-whitelisted users)")
    .addStringOption((o) =>
      o.setName("action").setDescription("Toggle antiping on or off").setRequired(true)
        .addChoices({ name: "on", value: "on" }, { name: "off", value: "off" })
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  name: "antiping",
  category: "Antinuke",
  permissions: [PermissionFlagsBits.ManageGuild],
  aliases: ["ap"],

  async executeInteraction(interaction, client) {
    const action = interaction.options.getString("action");
    return runAntiping(interaction, interaction.guild, interaction.user, action);
  },

  async execute(message, args, client) {
    const action = (args[0] || "").toLowerCase();
    if (!["on", "off"].includes(action)) {
      return error(message, message.guild, `Usage: \`${getGuild(message.guild.id).prefix}antiping <on|off>\``);
    }
    return runAntiping(message, message.guild, message.author, action);
  },
};

function runAntiping(ctx, guild, user, action) {
  const enable = action === "on";
  updateGuild(guild.id, (d) => { d.antinuke.antiping = enable; });
  addAudit(
    guild.id,
    "Antiping Toggled",
    user.tag,
    `Antiping ${enable ? "enabled" : "disabled"}`,
    enable ? "warning" : "info"
  );
  const detail = enable
    ? "Anti-Ping is now **ENABLED**. Non-whitelisted users pinging @everyone/@here will be timed out."
    : "Anti-Ping is now **DISABLED**.";
  return success(ctx, guild, detail);
}
