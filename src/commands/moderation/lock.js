const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const { sendEmbed, error } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Lock a channel by denying SendMessages for @everyone")
    .addChannelOption((o) =>
      o
        .setName("channel")
        .setDescription("The channel to lock (defaults to current)")
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildStageVoice, ChannelType.GuildAnnouncement)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  name: "lock",
  category: "Moderation",
  permissions: [PermissionFlagsBits.ManageChannels],
  aliases: [],

  async executeInteraction(interaction, client) {
    const channel = interaction.options.getChannel("channel") || interaction.channel;
    const me = interaction.guild.members.me;

    if (!me.permissionsIn(channel).has(PermissionFlagsBits.ManageChannels))
      return error(interaction, interaction.guild, `I lack **Manage Channels** permission in ${channel}.`);

    try {
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
    } catch (e) {
      return error(interaction, interaction.guild, `Failed to lock ${channel}: ${e.message}`);
    }

    return sendEmbed(interaction, "lock_success", interaction.guild, { channel: channel.toString() });
  },

  async execute(message, args, client) {
    const channel =
      message.mentions.channels.first() ||
      message.guild.channels.cache.get(args[0]) ||
      message.channel;
    const me = message.guild.members.me;

    if (!me.permissionsIn(channel).has(PermissionFlagsBits.ManageChannels))
      return error(message, message.guild, `I lack **Manage Channels** permission in ${channel}.`);

    try {
      await channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
    } catch (e) {
      return error(message, message.guild, `Failed to lock ${channel}: ${e.message}`);
    }

    return sendEmbed(message, "lock_success", message.guild, { channel: channel.toString() });
  },
};
