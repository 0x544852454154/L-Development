const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const { buildFromConfig } = require("../../embedBuilder");
const { error } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("hide")
    .setDescription("Hide a channel by denying ViewChannel for @everyone")
    .addChannelOption((o) =>
      o
        .setName("channel")
        .setDescription("The channel to hide (defaults to current)")
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildStageVoice, ChannelType.GuildAnnouncement)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  name: "hide",
  category: "Moderation",
  permissions: [PermissionFlagsBits.ManageChannels],
  aliases: [],

  async executeInteraction(interaction, client) {
    const channel = interaction.options.getChannel("channel") || interaction.channel;
    const me = interaction.guild.members.me;

    if (!me.permissionsIn(channel).has(PermissionFlagsBits.ManageChannels))
      return error(interaction, interaction.guild, `I lack **Manage Channels** permission in ${channel}.`);

    try {
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: false });
    } catch (e) {
      return error(interaction, interaction.guild, `Failed to hide ${channel}: ${e.message}`);
    }

    const embed = buildFromConfig(
      {
        title: "Channel Hidden",
        description:
          `**__Channel__**: ${channel}\n` +
          `**__Visibility__**: Hidden from \`@everyone\``,
        color: "F1C40F",
        footer: "L • Moderation",
        footerIcon: "bot",
        showTimestamp: false,
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
      await channel.permissionOverwrites.edit(message.guild.roles.everyone, { ViewChannel: false });
    } catch (e) {
      return error(message, message.guild, `Failed to hide ${channel}: ${e.message}`);
    }

    const embed = buildFromConfig(
      {
        title: "Channel Hidden",
        description:
          `**__Channel__**: ${channel}\n` +
          `**__Visibility__**: Hidden from \`@everyone\``,
        color: "F1C40F",
        footer: "L • Moderation",
        footerIcon: "bot",
        showTimestamp: false,
      },
      message.guild,
      { channel: channel.toString() }
    );
    return message.reply({ embeds: [embed] });
  },
};
