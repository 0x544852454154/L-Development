const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require("discord.js");
const { updateGuild } = require("../../database");
const { success, error } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leveling")
    .setDescription("Configure the XP leveling system")
    .addStringOption((o) =>
      o
        .setName("action")
        .setDescription("What to do")
        .setRequired(true)
        .addChoices(
          { name: "on — enable leveling", value: "on" },
          { name: "off — disable leveling", value: "off" },
          { name: "channel — set level-up channel", value: "channel" }
        )
    )
    .addChannelOption((o) =>
      o
        .setName("channel")
        .setDescription("Level-up announcement channel (required for `channel`)")
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  name: "leveling",
  category: "Leveling",
  permissions: [PermissionFlagsBits.ManageGuild],
  aliases: ["xpconfig"],

  async executeInteraction(interaction, client) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return error(interaction, interaction.guild, "You need **Manage Server** permission.");
    }
    const action = interaction.options.getString("action");
    const channel = interaction.options.getChannel("channel");
    return handle(interaction, interaction.guild, action, channel);
  },

  async execute(message, args, client) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return error(message, message.guild, "You need **Manage Server** permission.");
    }
    const action = (args[0] || "").toLowerCase();
    if (!["on", "off", "channel"].includes(action)) {
      return error(message, message.guild, "Usage: `leveling on | off | channel #channel`");
    }
    const channelMention = message.mentions.channels.first();
    return handle(message, message.guild, action, channelMention);
  },
};

function handle(ctx, guild, action, channel) {
  if (action === "on") {
    updateGuild(guild.id, (d) => {
      d.leveling.enabled = true;
    });
    return success(ctx, guild, "Leveling is now **enabled**. Members will earn XP by chatting.");
  }
  if (action === "off") {
    updateGuild(guild.id, (d) => {
      d.leveling.enabled = false;
    });
    return success(ctx, guild, "Leveling is now **disabled**. Existing XP is preserved.");
  }
  // action === "channel"
  if (!channel) {
    return error(ctx, guild, "Mention or specify a channel: `leveling channel #levelups`");
  }
  updateGuild(guild.id, (d) => {
    d.leveling.channel = channel.id;
  });
  return success(ctx, guild, `Level-up announcements will be sent to ${channel}.`);
}
