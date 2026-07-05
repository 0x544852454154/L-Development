const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { getGuild, updateGuild, addAudit } = require("../../database");
const { success, error } = require("../../embedBuilder");

const EVENTS = ["memberRemove", "memberBan", "channelDelete", "roleDelete", "messageDelete"];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("logging")
    .setDescription("Configure logging (set channel, turn off, toggle events, view status)")
    .addStringOption((o) =>
      o.setName("action").setDescription("Action").setRequired(true)
        .addChoices(
          { name: "set", value: "set" },
          { name: "off", value: "off" },
          { name: "event", value: "event" },
          { name: "status", value: "status" },
        )
    )
    .addChannelOption((o) => o.setName("channel").setDescription("The log channel (for action: set)").setRequired(false))
    .addStringOption((o) =>
      o.setName("event").setDescription("Event name (for action: event)").setRequired(false)
        .addChoices(EVENTS.map((e) => ({ name: e, value: e })))
    )
    .addStringOption((o) =>
      o.setName("state").setDescription("On or off (for action: event)").setRequired(false)
        .addChoices({ name: "on", value: "on" }, { name: "off", value: "off" })
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  name: "logging",
  category: "Logging",
  permissions: [PermissionFlagsBits.ManageGuild],
  aliases: ["log", "logs"],

  async executeInteraction(interaction, client) {
    const action = interaction.options.getString("action");
    const channel = interaction.options.getChannel("channel");
    const event = interaction.options.getString("event");
    const state = interaction.options.getString("state");
    return runLogging(interaction, interaction.guild, interaction.user, action, { channel, event, state });
  },

  async execute(message, args, client) {
    const data = getGuild(message.guild.id);
    const action = (args[0] || "").toLowerCase();
    if (!["set", "off", "event", "status"].includes(action)) {
      return error(
        message,
        message.guild,
        `Usage: \`${data.prefix}logging <set|off|event|status>\` or \`${data.prefix}logging event <eventName> <on|off>\``
      );
    }
    let opts = {};
    if (action === "set") {
      const channel = message.mentions.channels.first();
      if (channel) {
        opts.channel = channel;
      } else {
        const id = args[1];
        if (!id || !/^\d+$/.test(id)) {
          return error(message, message.guild, "Please mention a channel or provide a valid channel ID.");
        }
        const fetched = await message.guild.channels.fetch(id).catch(() => null);
        if (!fetched) return error(message, message.guild, "Channel not found.");
        opts.channel = fetched;
      }
    } else if (action === "event") {
      const event = (args[1] || "").toLowerCase();
      const state = (args[2] || "").toLowerCase();
      if (!EVENTS.includes(event)) {
        return error(message, message.guild, `Event must be one of: ${EVENTS.join(", ")}.`);
      }
      if (!["on", "off"].includes(state)) {
        return error(message, message.guild, "State must be `on` or `off`.");
      }
      opts = { event, state };
    }
    return runLogging(message, message.guild, message.author, action, opts);
  },
};

function runLogging(ctx, guild, user, action, opts = {}) {
  const data = getGuild(guild.id);

  if (action === "set") {
    const channel = opts.channel;
    if (!channel) {
      return error(ctx, guild, "Please provide a channel to set as the log channel.");
    }
    updateGuild(guild.id, (d) => { d.logging.channel = channel.id; });
    addAudit(guild.id, "Logging Channel Set", user.tag, `Log channel set to #${channel.name}`, "info");
    return success(ctx, guild, `Log channel set to **#${channel.name}**. Toggle individual events with \`/logging event <event> <on|off>\`.`);
  }

  if (action === "off") {
    updateGuild(guild.id, (d) => { d.logging.channel = null; });
    addAudit(guild.id, "Logging Disabled", user.tag, "Log channel cleared", "warning");
    return success(ctx, guild, "Logging is now **OFF** — log channel cleared.");
  }

  if (action === "event") {
    const e = opts.event;
    const s = opts.state;
    if (!e || !EVENTS.includes(e)) {
      return error(ctx, guild, `Event must be one of: ${EVENTS.join(", ")}.`);
    }
    if (!s || !["on", "off"].includes(s)) {
      return error(ctx, guild, "State must be `on` or `off`.");
    }
    const enable = s === "on";
    updateGuild(guild.id, (d) => { d.logging.events[e] = enable; });
    addAudit(guild.id, "Logging Event Toggled", user.tag, `Event ${e} ${enable ? "enabled" : "disabled"}`, "info");
    return success(ctx, guild, `Logging event **${e}** is now **${enable ? "ENABLED" : "DISABLED"}**.`);
  }

  if (action === "status") {
    const l = data.logging;
    const ch = l.channel ? `<#${l.channel}>` : "**not set**";
    const events = EVENTS.map((e) => `**${e}:** ${l.events[e] ? "ON" : "OFF"}`).join("\n");
    return success(
      ctx,
      guild,
      `**Log Channel:** ${ch}\n\n**Events:**\n${events}`
    );
  }

  return error(ctx, guild, "Unknown action. Use `set`, `off`, `event`, or `status`.");
}
