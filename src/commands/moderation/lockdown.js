const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const { getGuild, updateGuild, addAudit } = require("../../database");
const { sendEmbed, success, error, buildFromConfig } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("lockdown")
    .setDescription("Lock or unlock ALL text channels at once (deny SendMessages for @everyone)")
    .addStringOption((o) =>
      o.setName("action").setDescription("What to do").setRequired(true)
        .addChoices(
          { name: "on", value: "on" },
          { name: "off", value: "off" },
          { name: "status", value: "status" },
        )
    )
    .addRoleOption((o) =>
      o.setName("exempt_role").setDescription("Role to exempt from lockdown (allowed to send messages)").setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels | PermissionFlagsBits.Administrator),
  name: "lockdown",
  category: "Moderation",
  permissions: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.Administrator],
  aliases: ["ld"],

  async executeInteraction(interaction, client) {
    const action = interaction.options.getString("action");
    const exemptRole = interaction.options.getRole("exempt_role");
    return run(interaction, interaction.guild, interaction.user, action, exemptRole ? exemptRole.id : null);
  },

  async execute(message, args, client) {
    const data = getGuild(message.guild.id);
    const action = (args[0] || "").toLowerCase();
    if (!action) {
      return error(message, message.guild, `Usage: \`${data.prefix}lockdown <on|off|status> [exempt_role]\``);
    }
    if (!["on", "off", "status"].includes(action)) {
      return error(message, message.guild, "Action must be `on`, `off`, or `status`.");
    }
    let exemptRoleId = null;
    if (action === "on") {
      const mention = message.mentions.roles.first();
      if (mention) exemptRoleId = mention.id;
      else if (args[1] && /^\d{17,20}$/.test(args[1])) exemptRoleId = args[1];
    }
    return run(message, message.guild, message.author, action, exemptRoleId);
  },
};

async function run(ctx, guild, user, action, exemptRoleId) {
  const me = guild.members.me;
  if (!me.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return error(ctx, guild, "I lack the **Manage Channels** permission required for lockdown.");
  }

  const data = getGuild(guild.id);
  const lockdownState = data.lockdown || { enabled: false, exemptRoleId: null };

  if (action === "status") {
    const cfg = {
      title: "Lockdown Status",
      description:
        `**__Lockdown__**: ${lockdownState.enabled ? "ENGAGED" : "clear"}\n` +
        (lockdownState.enabled && lockdownState.exemptRoleId
          ? `**__Exempt Role__**: <@&${lockdownState.exemptRoleId}>\n`
          : "") +
        `**__Affected Channels__**: all text channels (SendMessages denied for @everyone)`,
      color: lockdownState.enabled ? "ED4245" : "57F287",
      footer: "L • Moderation",
      footerIcon: "bot",
      showTimestamp: false,
    };
    const embed = buildFromConfig(cfg, guild);
    return ctx.reply({ embeds: [embed] });
  }

  // Defer for the bulk channel overwrite work
  if (typeof ctx.deferReply === "function") {
    await ctx.deferReply().catch(() => {});
  } else {
    ctx._progressMsg = await ctx.reply({ content: "Updating channel permissions..." }).catch(() => null);
  }

  const textChannels = guild.channels.cache.filter(
    (c) =>
      c.type === ChannelType.GuildText &&
      c.permissionOverwrites &&
      c.manageable
  );

  let successCount = 0;
  let failedCount = 0;

  if (action === "on") {
    const results = await Promise.allSettled(
      textChannels.map(async (c) => {
        await c.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }, { reason: `[L Lockdown] engaged by ${user.tag}` });
        if (exemptRoleId) {
          await c.permissionOverwrites.edit(exemptRoleId, { SendMessages: true }, { reason: `[L Lockdown] exempt role` });
        }
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled") successCount++;
      else failedCount++;
    }
    updateGuild(guild.id, (d) => { d.lockdown = { enabled: true, exemptRoleId: exemptRoleId || null }; });
    addAudit(guild.id, "Lockdown Engaged", user.tag, `Locked ${successCount}/${textChannels.size} text channels${exemptRoleId ? ` (exempt role: ${exemptRoleId})` : ""}`, "danger");

    const embed = buildFromConfig(
      {
        title: "Server Lockdown Engaged",
        description:
          `**__Channels Locked__**: ${successCount}/${textChannels.size}` +
          (failedCount ? `\n**__Failed__**: ${failedCount}` : "") +
          (exemptRoleId ? `\n**__Exempt Role__**: <@&${exemptRoleId}>` : "") +
          `\n\nUse \`/lockdown off\` to release.`,
        color: "ED4245",
        footer: "L • Moderation",
        footerIcon: "bot",
        showTimestamp: false,
      },
      guild
    );
    if (typeof ctx.editReply === "function") return ctx.editReply({ content: null, embeds: [embed] });
    if (ctx._progressMsg) { try { return await ctx._progressMsg.edit({ content: null, embeds: [embed] }); } catch {} }
    return ctx.channel.send({ embeds: [embed] });
  }

  if (action === "off") {
    const results = await Promise.allSettled(
      textChannels.map((c) =>
        c.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null }, { reason: `[L Lockdown] released by ${user.tag}` })
      )
    );
    for (const r of results) {
      if (r.status === "fulfilled") successCount++;
      else failedCount++;
    }
    // Also clear the exempt role overwrite we added during lockdown
    const prevExempt = lockdownState.exemptRoleId;
    if (prevExempt) {
      await Promise.allSettled(
        textChannels.map((c) =>
          c.permissionOverwrites.edit(prevExempt, { SendMessages: null }, { reason: `[L Lockdown] clearing exempt role overwrite` }).catch(() => {})
        )
      );
    }
    updateGuild(guild.id, (d) => { d.lockdown = { enabled: false, exemptRoleId: null }; });
    addAudit(guild.id, "Lockdown Released", user.tag, `Unlocked ${successCount}/${textChannels.size} text channels`, "info");

    const embed = buildFromConfig(
      {
        title: "Server Lockdown Released",
        description:
          `**__Channels Unlocked__**: ${successCount}/${textChannels.size}` +
          (failedCount ? `\n**__Failed__**: ${failedCount}` : ""),
        color: "57F287",
        footer: "L • Moderation",
        footerIcon: "bot",
        showTimestamp: false,
      },
      guild
    );
    if (typeof ctx.editReply === "function") return ctx.editReply({ content: null, embeds: [embed] });
    if (ctx._progressMsg) { try { return await ctx._progressMsg.edit({ content: null, embeds: [embed] }); } catch {} }
    return ctx.channel.send({ embeds: [embed] });
  }

  return error(ctx, guild, "Unknown action. Use `on`, `off`, or `status`.");
}
