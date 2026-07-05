const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const { buildFromConfig, error } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("unhide")
    .setDescription("Unhide a channel by clearing the ViewChannel deny on @everyone")
    .addChannelOption((o) =>
      o
        .setName("channel")
        .setDescription("The channel to unhide (defaults to current)")
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildStageVoice, ChannelType.GuildAnnouncement)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  name: "unhide",
  category: "Moderation",
  permissions: [PermissionFlagsBits.ManageChannels],
  aliases: [],

  async executeInteraction(interaction, client) {
    const channel = interaction.options.getChannel("channel") || interaction.channel;
    const me = interaction.guild.members.me;

    if (!me.permissionsIn(channel).has(PermissionFlagsBits.ManageChannels))
      return error(interaction, interaction.guild, `I lack **Manage Channels** permission in ${channel}.`);

    try {
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: null });
    } catch (e) {
      return error(interaction, interaction.guild, `Failed to unhide ${channel}: ${e.message}`);
    }

    const embed = buildFromConfig(
      {
        title: "Channel Unhidden",
        titleEmoji: "👁️",
        description: `${channel} is now visible to \`@everyone\`.`,
        color: "57F287",
        footer: "L • Moderation",
        footerEmoji: "🛡️",
        showTimestamp: true,
      },
      interaction.guild,
      { channel: channel.toString() }
    );
    return interaction.reply({ embeds: [embed] });
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
      await channel.permissionOverwrites.edit(message.guild.roles.everyone, { ViewChannel: null });
    } catch (e) {
      return error(message, message.guild, `Failed to unhide ${channel}: ${e.message}`);
    }

    const embed = buildFromConfig(
      {
        title: "Channel Unhidden",
        titleEmoji: "👁️",
        description: `${channel} is now visible to \`@everyone\`.`,
        color: "57F287",
        footer: "L • Moderation",
        footerEmoji: "🛡️",
        showTimestamp: true,
      },
      message.guild,
      { channel: channel.toString() }
    );
    return message.reply({ embeds: [embed] });
  },
};
