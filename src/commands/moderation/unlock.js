const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const { success, error } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Unlock a channel by clearing the SendMessages deny on @everyone")
    .addChannelOption((o) =>
      o
        .setName("channel")
        .setDescription("The channel to unlock (defaults to current)")
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildStageVoice, ChannelType.GuildAnnouncement)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  name: "unlock",
  category: "Moderation",
  permissions: [PermissionFlagsBits.ManageChannels],
  aliases: [],

  async executeInteraction(interaction, client) {
    const channel = interaction.options.getChannel("channel") || interaction.channel;
    const me = interaction.guild.members.me;

    if (!me.permissionsIn(channel).has(PermissionFlagsBits.ManageChannels))
      return error(interaction, interaction.guild, `I lack **Manage Channels** permission in ${channel}.`);

    try {
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null });
    } catch (e) {
      return error(interaction, interaction.guild, `Failed to unlock ${channel}: ${e.message}`);
    }

    return success(interaction, interaction.guild, `${channel} has been unlocked.`);
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
      await channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null });
    } catch (e) {
      return error(message, message.guild, `Failed to unlock ${channel}: ${e.message}`);
    }

    return success(message, message.guild, `${channel} has been unlocked.`);
  },
};
