const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require("discord.js");
const { updateGuild } = require("../../database");
const { success, error } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("greet")
    .setDescription("Configure welcome and goodbye messages")
    .addStringOption((o) =>
      o
        .setName("type")
        .setDescription("Which greeting to configure")
        .setRequired(true)
        .addChoices(
          { name: "welcome", value: "welcome" },
          { name: "goodbye", value: "goodbye" }
        )
    )
    .addStringOption((o) =>
      o
        .setName("setting")
        .setDescription("What to set")
        .setRequired(true)
        .addChoices(
          { name: "on", value: "on" },
          { name: "off", value: "off" },
          { name: "channel", value: "channel" }
        )
    )
    .addChannelOption((o) =>
      o
        .setName("channel")
        .setDescription("Channel for the welcome/goodbye message (required for `channel`)")
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  name: "greet",
  category: "Welcome",
  permissions: [PermissionFlagsBits.ManageGuild],
  aliases: ["welcome"],

  async executeInteraction(interaction, client) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return error(interaction, interaction.guild, "You need **Manage Server** permission.");
    }
    const type = interaction.options.getString("type");
    const setting = interaction.options.getString("setting");
    const channel = interaction.options.getChannel("channel");
    return handle(interaction, interaction.guild, type, setting, channel);
  },

  async execute(message, args, client) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return error(message, message.guild, "You need **Manage Server** permission.");
    }
    const type = (args[0] || "").toLowerCase();
    const setting = (args[1] || "").toLowerCase();
    if (!["welcome", "goodbye"].includes(type) || !["on", "off", "channel"].includes(setting)) {
      return error(
        message,
        message.guild,
        "Usage: `greet <welcome|goodbye> <on|off|channel> [#channel]`"
      );
    }
    const channelMention = message.mentions.channels.first();
    return handle(message, message.guild, type, setting, channelMention);
  },
};

function handle(ctx, guild, type, setting, channel) {
  const isWelcome = type === "welcome";

  if (setting === "on") {
    updateGuild(guild.id, (d) => {
      if (isWelcome) d.welcome.enabled = true;
      else d.welcome.goodbyeEnabled = true;
    });
    return success(ctx, guild, `${cap(type)} messages are now **enabled**.`);
  }
  if (setting === "off") {
    updateGuild(guild.id, (d) => {
      if (isWelcome) d.welcome.enabled = false;
      else d.welcome.goodbyeEnabled = false;
    });
    return success(ctx, guild, `${cap(type)} messages are now **disabled**.`);
  }
  // setting === "channel"
  if (!channel) {
    return error(
      ctx,
      guild,
      `Mention or specify a channel: \`greet ${type} channel #${type}\``
    );
  }
  updateGuild(guild.id, (d) => {
    if (isWelcome) d.welcome.channel = channel.id;
    else d.welcome.goodbyeChannel = channel.id;
  });
  return success(ctx, guild, `${cap(type)} channel set to ${channel}.`);
}

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
