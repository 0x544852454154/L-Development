const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { getGuild, updateGuild, addAudit } = require("../../database");
const { success, error } = require("../../embedBuilder");

const FILTERS = ["invites", "links", "spam"];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("automod")
    .setDescription("Configure automod (enable, toggle filters, view status)")
    .addStringOption((o) =>
      o.setName("action").setDescription("Action").setRequired(true)
        .addChoices(
          { name: "on", value: "on" },
          { name: "off", value: "off" },
          { name: "filter", value: "filter" },
          { name: "status", value: "status" },
        )
    )
    .addStringOption((o) =>
      o.setName("filter").setDescription("Filter to toggle (for action: filter)").setRequired(false)
        .addChoices(FILTERS.map((f) => ({ name: f, value: f })))
    )
    .addStringOption((o) =>
      o.setName("state").setDescription("On or off (for action: filter)").setRequired(false)
        .addChoices({ name: "on", value: "on" }, { name: "off", value: "off" })
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  name: "automod",
  category: "Automod",
  permissions: [PermissionFlagsBits.ManageGuild],
  aliases: ["am"],

  async executeInteraction(interaction, client) {
    const action = interaction.options.getString("action");
    const filter = interaction.options.getString("filter");
    const state = interaction.options.getString("state");
    return runAutomod(interaction, interaction.guild, interaction.user, action, { filter, state });
  },

  async execute(message, args, client) {
    const data = getGuild(message.guild.id);
    const action = (args[0] || "").toLowerCase();
    if (!["on", "off", "filter", "status"].includes(action)) {
      return error(
        message,
        message.guild,
        `Usage: \`${data.prefix}automod <on|off|filter|status>\` or \`${data.prefix}automod filter <invites|links|spam> <on|off>\``
      );
    }
    let opts = {};
    if (action === "filter") {
      const filter = (args[1] || "").toLowerCase();
      const state = (args[2] || "").toLowerCase();
      if (!FILTERS.includes(filter)) {
        return error(message, message.guild, `Filter must be one of: ${FILTERS.join(", ")}.`);
      }
      if (!["on", "off"].includes(state)) {
        return error(message, message.guild, "State must be `on` or `off`.");
      }
      opts = { filter, state };
    }
    return runAutomod(message, message.guild, message.author, action, opts);
  },
};

function runAutomod(ctx, guild, user, action, opts = {}) {
  const data = getGuild(guild.id);

  if (action === "on") {
    updateGuild(guild.id, (d) => { d.automod.enabled = true; });
    addAudit(guild.id, "Automod Enabled", user.tag, "Automod turned on", "warning");
    return success(ctx, guild, "Automod is now **ENABLED**. Configure filters with `/automod filter <invites|links|spam> <on|off>`.");
  }

  if (action === "off") {
    updateGuild(guild.id, (d) => { d.automod.enabled = false; });
    addAudit(guild.id, "Automod Disabled", user.tag, "Automod turned off", "danger");
    return success(ctx, guild, "Automod is now **DISABLED**.");
  }

  if (action === "filter") {
    const f = opts.filter;
    const s = opts.state;
    if (!f || !FILTERS.includes(f)) {
      return error(ctx, guild, `Filter must be one of: ${FILTERS.join(", ")}.`);
    }
    if (!s || !["on", "off"].includes(s)) {
      return error(ctx, guild, "State must be `on` or `off`.");
    }
    const enable = s === "on";
    updateGuild(guild.id, (d) => { d.automod.filters[f] = enable; });
    addAudit(guild.id, "Automod Filter Toggled", user.tag, `Filter ${f} ${enable ? "enabled" : "disabled"}`, "info");
    return success(ctx, guild, `Automod filter **${f}** is now **${enable ? "ENABLED" : "DISABLED"}**.`);
  }

  if (action === "status") {
    const a = data.automod;
    const filters = FILTERS.map((f) => `**${f}:** ${a.filters[f] ? "ON" : "OFF"}`).join("\n");
    return success(
      ctx,
      guild,
      `**Automod:** ${a.enabled ? "🟢 ENABLED" : "🔴 DISABLED"}\n` +
      `**Anti-Ghost-Ping:** ${a.antighostping ? "ON" : "OFF"}\n\n` +
      `**Filters:**\n${filters}\n\n` +
      `**Whitelisted Channels:** ${a.whitelistedChannels.length}\n` +
      `**Whitelisted Roles:** ${a.whitelistedRoles.length}`
    );
  }

  return error(ctx, guild, "Unknown action. Use `on`, `off`, `filter`, or `status`.");
}
