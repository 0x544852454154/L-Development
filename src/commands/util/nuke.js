const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require("discord.js");
const { addAudit } = require("../../database");
const { buildFromConfig, success, error, warn } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("nuke")
    .setDescription("Clone and delete a channel to wipe its entire message history")
    .addChannelOption((o) =>
      o
        .setName("channel")
        .setDescription("Channel to nuke (defaults to current)")
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  name: "nuke",
  category: "Util",
  permissions: [PermissionFlagsBits.ManageChannels],
  aliases: ["purgechannel"],

  async executeInteraction(interaction, client) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
      return error(interaction, interaction.guild, "You need **Manage Channels** permission.");
    }
    const channel = interaction.options.getChannel("channel") || interaction.channel;
    return doNuke(interaction, interaction.guild, channel, interaction.user);
  },

  async execute(message, args, client) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return error(message, message.guild, "You need **Manage Channels** permission.");
    }
    const channel = message.mentions.channels.first() || message.channel;
    return doNuke(message, message.guild, channel, message.author);
  },
};

async function doNuke(ctx, guild, channel, actor) {
  const botPerms = channel.permissionsFor(guild.members.me);
  if (!botPerms || !botPerms.has(PermissionFlagsBits.ManageChannels)) {
    return error(ctx, guild, "I need **Manage Channels** permission in that channel to nuke it.");
  }

  // Warn first — channel still exists, so the reply lands.
  await warn(ctx, guild, `Nuking ${channel} — recreating now.`).catch(() => {});

  try {
    const clone = await channel.clone({
      name: channel.name,
      topic: channel.topic || null,
      nsfw: channel.nsfw || false,
      rateLimitPerUser: channel.rateLimitPerUser || 0,
      position: channel.position,
      parent: channel.parentId || null,
      permissionOverwrites: channel.permissionOverwrites.cache,
      reason: `Nuke by ${actor.tag}`,
    });
    await channel.delete(`Nuke by ${actor.tag}`);
    addAudit(guild.id, "nuke", actor.tag, `Cloned & deleted #${channel.name} (${channel.id})`, "warning");
    const embed = buildFromConfig(
      {
        title: "Channel Nuked",
        titleEmoji: "💥",
        description: `**#${clone.name}** was wiped and recreated by ${actor}.\nA clean slate — as it should be.`,
        color: "57F287",
        footer: "L • Util",
        footerEmoji: "🔧",
        showTimestamp: true,
      },
      guild
    );
    return clone.send({ content: `${actor}`, embeds: [embed] }).catch(() => {});
  } catch (e) {
    const msg = `Failed to nuke: ${e.message || e}`;
    if (typeof ctx.followUp === "function") {
      return ctx.followUp({ content: msg }).catch(() => {});
    }
    return ctx.channel?.send({ content: msg }).catch(() => {});
  }
}
