const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { getGuild, updateGuild, addAudit } = require("../../database");
const { sendEmbed, success, error, buildFromConfig } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("strictmode")
    .setDescription("Toggle antinuke strict mode (immediate punish on any destructive action)")
    .addStringOption((o) =>
      o.setName("action").setDescription("What to do").setRequired(true)
        .addChoices(
          { name: "on", value: "on" },
          { name: "off", value: "off" },
          { name: "status", value: "status" },
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  name: "strictmode",
  category: "Antinuke",
  permissions: [PermissionFlagsBits.ManageGuild],
  aliases: ["strict"],

  async executeInteraction(interaction, client) {
    const action = interaction.options.getString("action");
    return run(interaction, interaction.guild, interaction.user, action);
  },

  async execute(message, args, client) {
    const data = getGuild(message.guild.id);
    const action = (args[0] || "").toLowerCase();
    if (!action) {
      return error(message, message.guild, `Usage: \`${data.prefix}strictmode <on|off|status>\``);
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
    updateGuild(guild.id, (d) => { d.antinuke.strict = true; });
    addAudit(guild.id, "Strict Mode Enabled", user.tag, "Antinuke strict mode turned ON — immediate punish on any destructive action", "warning");
    return success(ctx, guild,
      "Strict mode is now **ON**.\nAny single destructive action by a non-whitelisted user will trigger **immediate punishment + auto-restore** — no threshold wait.");
  }

  if (action === "off") {
    updateGuild(guild.id, (d) => { d.antinuke.strict = false; });
    addAudit(guild.id, "Strict Mode Disabled", user.tag, "Antinuke strict mode turned OFF — threshold mode active", "danger");
    return success(ctx, guild,
      "Strict mode is now **OFF**.\nAntinuke will use **threshold mode**: a destructive-action count must reach the configured threshold before punishment is triggered.");
  }

  // status
  const cfg = {
    title: "Strict Mode Status",
    description:
      `**Strict Mode:** ${data.antinuke.strict ? "ON (immediate punish)" : "OFF (threshold mode)"}\n` +
      `**Threshold:** ${data.antinuke.threshold} actions / ${data.antinuke.window / 1000}s\n` +
      `**Punishment:** ${data.antinuke.punishment}\n` +
      `**Antinuke Shield:** ${data.antinuke.enabled ? "ONLINE" : "OFFLINE"}`,
    color: data.antinuke.strict ? "57F287" : "F1C40F",
    footer: "L • Antinuke",
    showTimestamp: true,
  };
  const embed = buildFromConfig(cfg, guild);
  return ctx.reply({ embeds: [embed] });
}
