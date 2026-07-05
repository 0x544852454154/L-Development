const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const { getGuild } = require("../../database");
const { error, buildFromConfig } = require("../../embedBuilder");
const { clearPanic, cacheChannel, cacheRole } = require("../../handlers/antinuke");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("recover")
    .setDescription("Emergency recovery: clear panic, re-cache channels/roles, report server status")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator),
  name: "recover",
  category: "Antinuke",
  permissions: [PermissionFlagsBits.ManageGuild, PermissionFlagsBits.Administrator],
  aliases: [],

  async executeInteraction(interaction, client) {
    return run(interaction, interaction.guild, interaction.user, client);
  },

  async execute(message, args, client) {
    return run(message, message.guild, message.author, client);
  },
};

async function run(ctx, guild, user, client) {
  const me = guild.members.me;
  if (!me.permissions.has(PermissionFlagsBits.Administrator)) {
    return error(ctx, guild, "Recovery requires the **Administrator** permission so I can re-cache every channel and role.");
  }

  // Defer for the long-running recache
  if (typeof ctx.deferReply === "function") {
    await ctx.deferReply().catch(() => {});
  } else {
    // prefix fallback — send a progress message we can edit later
    ctx._progressMsg = await ctx.reply({ content: "Running emergency recovery..." }).catch(() => null);
  }

  // 1. Clear panic mode immediately
  clearPanic(guild.id);

  // 2. Re-cache every channel so restore can bring deleted ones back
  let channelsCached = 0;
  for (const channel of guild.channels.cache.values()) {
    if (channel && channel.guild) {
      try { cacheChannel(channel); channelsCached++; } catch {}
    }
  }

  // 3. Re-cache every role so restore can bring deleted ones back
  let rolesCached = 0;
  for (const role of guild.roles.cache.values()) {
    if (role && role.guild) {
      try { cacheRole(role); rolesCached++; } catch {}
    }
  }

  // 4. Refresh member cache for an accurate count
  let memberCount = guild.memberCount;
  try {
    const fetched = await guild.members.fetch({ withPresences: false });
    memberCount = fetched.size || guild.memberCount;
  } catch {}

  // 5. Tally report
  const data = getGuild(guild.id);
  const textChannels = guild.channels.cache.filter((c) => c.type === ChannelType.GuildText).size;
  const voiceChannels = guild.channels.cache.filter((c) => c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice).size;
  const totalChannels = guild.channels.cache.size;
  const totalRoles = guild.roles.cache.size;

  const cfg = {
    title: "Emergency Recovery Complete",
    description:
      `Panic cleared, caches refreshed.\n` +
      `**__Triggered by__**: ${user.tag}\n` +
      `**__Antinuke Shield__**: ${data.antinuke.enabled ? "ONLINE" : "OFFLINE"}\n` +
      `**__Strict Mode__**: ${data.antinuke.strict ? "ON" : "OFF"}\n` +
      `**__Auto-Restore__**: ${data.autoRestore.enabled ? "ARMED" : "DISARMED"}`,
    color: "57F287",
    fields: [
      { name: "**__Members__**", value: `\`${memberCount}\``, inline: true },
      { name: "**__Channels__**", value: `\`${totalChannels}\` (text: ${textChannels}, voice: ${voiceChannels})`, inline: true },
      { name: "**__Roles__**", value: `\`${totalRoles}\``, inline: true },
      { name: "**__Channels Re-cached__**", value: `\`${channelsCached}\``, inline: true },
      { name: "**__Roles Re-cached__**", value: `\`${rolesCached}\``, inline: true },
      { name: "**__Panic Mode__**", value: "CLEAR", inline: true },
    ],
    footer: "L • Antinuke",
    footerIcon: "bot",
    showTimestamp: false,
  };
  const embed = buildFromConfig(cfg, guild);

  // Reply on the deferred interaction, or edit the prefix progress message
  if (typeof ctx.editReply === "function") {
    return ctx.editReply({ content: null, embeds: [embed] });
  }
  if (ctx._progressMsg) {
    try { return await ctx._progressMsg.edit({ content: null, embeds: [embed] }); } catch {}
  }
  return ctx.channel.send({ embeds: [embed] });
}
