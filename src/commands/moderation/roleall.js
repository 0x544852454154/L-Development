const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { getGuild, addAudit } = require("../../database");
const { success, error, buildFromConfig } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("roleall")
    .setDescription("Add a role to ALL human members of the server (skips bots)")
    .addRoleOption((o) =>
      o.setName("role").setDescription("The role to add to everyone").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  name: "roleall",
  category: "Moderation",
  permissions: [PermissionFlagsBits.ManageRoles],
  aliases: [],

  async executeInteraction(interaction, client) {
    const role = interaction.options.getRole("role");
    return run(interaction, interaction.guild, interaction.user, role);
  },

  async execute(message, args, client) {
    const data = getGuild(message.guild.id);
    const role =
      message.mentions.roles.first() ||
      message.guild.roles.cache.get(args[0]) ||
      message.guild.roles.cache.find((r) => r.name.toLowerCase() === args.join(" ").toLowerCase());
    if (!role) {
      return error(message, message.guild, `Usage: \`${data.prefix}roleall <@role|roleid|role name>\``);
    }
    return run(message, message.guild, message.author, role);
  },
};

async function run(ctx, guild, user, role) {
  const me = guild.members.me;
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return error(ctx, guild, "I lack the **Manage Roles** permission.");
  }
  if (role.id === guild.roles.everyone.id) {
    return error(ctx, guild, "I cannot mass-assign the `@everyone` role.");
  }
  if (role.managed) {
    return error(ctx, guild, "That role is managed by an integration (e.g. bot or booster) and cannot be assigned manually.");
  }
  if (role.position >= me.roles.highest.position) {
    return error(ctx, guild, "That role is equal to or higher than my highest role. I cannot mass-assign it.");
  }
  // Commander hierarchy check (skip for guild owner)
  const commanderHighest = ctx.member ? ctx.member.roles.highest : null;
  if (commanderHighest && guild.ownerId !== user.id && role.position >= commanderHighest.position) {
    return error(ctx, guild, "You cannot mass-assign a role equal to or higher than your highest role.");
  }

  // Defer + initial progress
  if (typeof ctx.deferReply === "function") {
    await ctx.deferReply().catch(() => {});
  } else {
    ctx._progressMsg = await ctx.reply({ content: `Mass-assigning **${role.name}** to all humans... This may take a while in large servers.` }).catch(() => null);
  }

  let members;
  try {
    members = await guild.members.fetch({ withPresences: false });
  } catch (e) {
    return error(ctx, guild, `Failed to fetch the member list: ${e.message}`);
  }

  const humans = members.filter((m) => !m.user.bot);
  const target = humans.filter((m) => !m.roles.cache.has(role.id));
  const skippedAlready = humans.size - target.size;
  const skippedBots = members.size - humans.size;

  let assigned = 0;
  let failed = 0;
  let i = 0;
  const total = target.size;
  const PROGRESS_EVERY = 10;

  for (const member of target.values()) {
    try {
      await member.roles.add(role, `[L roleall] by ${user.tag}`);
      assigned++;
    } catch {
      failed++;
    }
    i++;
    if (i % PROGRESS_EVERY === 0 && i < total) {
      const pct = Math.round((i / total) * 100);
      const text = `Mass-assigning **${role.name}** — ${i}/${total} (${pct}%) | added: ${assigned} | failed: ${failed}`;
      try {
        if (typeof ctx.editReply === "function") await ctx.editReply({ content: text });
        else if (ctx._progressMsg) await ctx._progressMsg.edit({ content: text });
      } catch {}
    }
  }

  addAudit(guild.id, "Roleall", user.tag, `Added @${role.name} to ${assigned}/${total} humans (${failed} failed, ${skippedBots} bots skipped, ${skippedAlready} already had it)`, "warning");

  const cfg = {
    title: "Mass Role Assignment Complete",
    description:
      `Added **${role.name}** to **${assigned}** human member${assigned === 1 ? "" : "s"}.\n\n` +
      `**Target humans:** ${total}\n` +
      `**Assigned:** ${assigned}\n` +
      `**Failed:** ${failed}\n` +
      `**Skipped (already had role):** ${skippedAlready}\n` +
      `**Skipped (bots):** ${skippedBots}`,
    color: failed > 0 ? "F1C40F" : "57F287",
    footer: "L • Moderation",
    showTimestamp: true,
  };
  const embed = buildFromConfig(cfg, guild);

  if (typeof ctx.editReply === "function") {
    return ctx.editReply({ content: null, embeds: [embed] });
  }
  if (ctx._progressMsg) {
    try { return await ctx._progressMsg.edit({ content: null, embeds: [embed] }); } catch {}
  }
  return ctx.channel.send({ embeds: [embed] });
}
