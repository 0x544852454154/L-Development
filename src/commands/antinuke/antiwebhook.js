const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { getGuild, updateGuild, addAudit } = require("../../database");
const { success, error, buildFromConfig } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("antiwebhook")
    .setDescription("Toggle anti-webhook (block webhook creation by non-whitelisted users)")
    .addStringOption((o) =>
      o.setName("action").setDescription("What to do").setRequired(true)
        .addChoices(
          { name: "on", value: "on" },
          { name: "off", value: "off" },
          { name: "status", value: "status" },
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  name: "antiwebhook",
  category: "Antinuke",
  permissions: [PermissionFlagsBits.ManageGuild],
  aliases: ["awh"],

  async executeInteraction(interaction, client) {
    const action = interaction.options.getString("action");
    return run(interaction, interaction.guild, interaction.user, action);
  },

  async execute(message, args, client) {
    const data = getGuild(message.guild.id);
    const action = (args[0] || "").toLowerCase();
    if (!action) {
      return error(message, message.guild, `Usage: \`${data.prefix}antiwebhook <on|off|status>\``);
    }
    if (!["on", "off", "status"].includes(action)) {
      return error(message, message.guild, "Action must be `on`, `off`, or `status`.");
    }
    return run(message, message.guild, message.author, action);
  },
};

function run(ctx, guild, user, action) {
  const data = getGuild(guild.id);

  if (action === "on") {
    updateGuild(guild.id, (d) => { d.antinuke.antiWebhook = true; });
    addAudit(guild.id, "Anti-Webhook Enabled", user.tag, "Anti-webhook protection turned ON", "warning");
    return success(ctx, guild, "Anti-webhook is now **ON**.\nWebhook creation by non-whitelisted users will be blocked, the webhook deleted, and the offender punished.");
  }

  if (action === "off") {
    updateGuild(guild.id, (d) => { d.antinuke.antiWebhook = false; });
    addAudit(guild.id, "Anti-Webhook Disabled", user.tag, "Anti-webhook protection turned OFF", "danger");
    return success(ctx, guild, "Anti-webhook is now **OFF**.\nWebhook creation will no longer be blocked.");
  }

  // status
  const cfg = {
    title: "Anti-Webhook Status",
    description:
      `**Anti-Webhook:** ${data.antinuke.antiWebhook ? "ON" : "OFF"}\n` +
      `**Antinuke Shield:** ${data.antinuke.enabled ? "ONLINE" : "OFFLINE"}\n` +
      `**Whitelisted Users:** ${data.antinuke.whitelistedUsers.length}\n` +
      `**Whitelisted Roles:** ${data.antinuke.whitelistedRoles.length}`,
    color: data.antinuke.antiWebhook ? "57F287" : "949BA4",
    footer: "L • Antinuke",
    showTimestamp: true,
  };
  const embed = buildFromConfig(cfg, guild);
  return ctx.reply({ embeds: [embed] });
}
