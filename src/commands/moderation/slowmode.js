const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const { getGuild } = require("../../database");
const { success, error } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Set the slowmode (rate limit) on a channel")
    .addIntegerOption((o) =>
      o.setName("seconds").setDescription("Slowmode in seconds (0 to disable, max 21600)").setRequired(true).setMinValue(0).setMaxValue(21600)
    )
    .addChannelOption((o) =>
      o.setName("channel").setDescription("Channel to set slowmode on (defaults to current)").setRequired(false)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildStageVoice, ChannelType.GuildAnnouncement)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  name: "slowmode",
  category: "Moderation",
  permissions: [PermissionFlagsBits.ManageChannels],
  aliases: ["slow"],

  async executeInteraction(interaction, client) {
    const seconds = interaction.options.getInteger("seconds");
    const channel = interaction.options.getChannel("channel") || interaction.channel;
    return run(interaction, interaction.guild, interaction.user, seconds, channel);
  },

  async execute(message, args, client) {
    const data = getGuild(message.guild.id);
    const raw = args[0];
    if (!raw) {
      return error(message, message.guild, `Usage: \`${data.prefix}slowmode <seconds 0-21600> [#channel]\``);
    }
    const seconds = parseInt(raw, 10);
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 21600) {
      return error(message, message.guild, "Slowmode must be an integer between **0** and **21600** seconds (6 hours).");
    }
    const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]) || message.channel;
    return run(message, message.guild, message.author, seconds, channel);
  },
};

async function run(ctx, guild, user, seconds, channel) {
  const me = guild.members.me;
  if (!me.permissionsIn(channel).has(PermissionFlagsBits.ManageChannels)) {
    return error(ctx, guild, `I lack **Manage Channels** permission in ${channel}.`);
  }

  try {
    await channel.setRateLimitPerUser(seconds, `[L] slowmode set by ${user.tag}`);
  } catch (e) {
    return error(ctx, guild, `Failed to set slowmode on ${channel}: ${e.message}`);
  }

  if (seconds === 0) {
    return success(ctx, guild, `Slowmode **disabled** in ${channel.toString()}.`);
  }
  const human = formatDuration(seconds);
  return success(ctx, guild, `Slowmode for ${channel.toString()} set to **${seconds}s** (${human}).`);
}

function formatDuration(s) {
  if (s < 60) return `${s} second${s === 1 ? "" : "s"}`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}m${rem ? ` ${rem}s` : ""}`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h${m ? ` ${m}m` : ""}`;
}
