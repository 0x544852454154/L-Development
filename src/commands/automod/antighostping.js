const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { getGuild, updateGuild, addAudit } = require("../../database");
const { success, error } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("antighostping")
    .setDescription("Toggle anti-ghost-ping detection")
    .addStringOption((o) =>
      o.setName("action").setDescription("Toggle on or off").setRequired(true)
        .addChoices({ name: "on", value: "on" }, { name: "off", value: "off" })
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  name: "antighostping",
  category: "Automod",
  permissions: [PermissionFlagsBits.ManageGuild],
  aliases: ["agp"],

  async executeInteraction(interaction, client) {
    const action = interaction.options.getString("action");
    return runAntiGhost(interaction, interaction.guild, interaction.user, action);
  },

  async execute(message, args, client) {
    const action = (args[0] || "").toLowerCase();
    if (!["on", "off"].includes(action)) {
      return error(message, message.guild, `Usage: \`${getGuild(message.guild.id).prefix}antighostping <on|off>\``);
    }
    return runAntiGhost(message, message.guild, message.author, action);
  },
};

function runAntiGhost(ctx, guild, user, action) {
  const enable = action === "on";
  updateGuild(guild.id, (d) => { d.automod.antighostping = enable; });
  addAudit(
    guild.id,
    "Antighostping Toggled",
    user.tag,
    `Antighostping ${enable ? "enabled" : "disabled"}`,
    enable ? "warning" : "info"
  );
  const detail = enable
    ? "Anti-Ghost-Ping is now **ENABLED**. Ghost pings will be logged and the pinger exposed."
    : "Anti-Ghost-Ping is now **DISABLED**.";
  return success(ctx, guild, detail);
}
