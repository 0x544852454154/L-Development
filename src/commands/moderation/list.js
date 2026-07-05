const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { buildFromConfig, error } = require("../../embedBuilder");

async function listBans(guild) {
  let bans;
  try {
    bans = await guild.bans.fetch();
  } catch (e) {
    return { error: e.message, bans: null };
  }
  return { bans, error: null };
}

function formatBanList(bans) {
  if (!bans || bans.size === 0) return "No banned users.";
  const lines = [];
  for (const ban of bans.values()) {
    const reason = ban.reason ? ban.reason.slice(0, 80) : "No reason";
    lines.push(`• **${ban.user.tag}** (\`${ban.user.id}\`) — ${reason}`);
  }
  if (lines.length > 30) {
    return lines.slice(0, 30).join("\n") + `\n\n*...and ${lines.length - 30} more.*`;
  }
  return lines.join("\n");
}

function formatTimeoutList(members) {
  const timedOut = members.filter((m) => m.isCommunicationDisabled && m.isCommunicationDisabled());
  if (timedOut.size === 0) return "No members are currently timed out.";
  const lines = [];
  for (const m of timedOut.values()) {
    const until = m.communicationDisabledUntil;
    const untilStr = until ? `<t:${Math.floor(until.getTime() / 1000)}:R>` : "unknown";
    lines.push(`• **${m.user.tag}** (\`${m.id}\`) — until ${untilStr}`);
  }
  return lines.join("\n");
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("list")
    .setDescription("List banned users or currently timed-out members")
    .addStringOption((o) =>
      o
        .setName("type")
        .setDescription("What to list")
        .setRequired(true)
        .addChoices(
          { name: "bans", value: "bans" },
          { name: "timeouts", value: "timeouts" }
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers | PermissionFlagsBits.ModerateMembers),
  name: "list",
  category: "Moderation",
  permissions: [PermissionFlagsBits.BanMembers, PermissionFlagsBits.ModerateMembers],
  aliases: [],

  async executeInteraction(interaction, client) {
    const type = interaction.options.getString("type");
    return this._list(interaction, type);
  },

  async execute(message, args, client) {
    const type = (args[0] || "").toLowerCase();
    if (type !== "bans" && type !== "timeouts")
      return error(message, message.guild, "Usage: `list bans` or `list timeouts`.");
    return this._list(message, type);
  },

  async _list(ctx, type) {
    const guild = ctx.guild;
    if (type === "bans") {
      const { bans, error: err } = await listBans(guild);
      if (err) return error(ctx, guild, `Failed to fetch bans: ${err}`);
      const embed = buildFromConfig(
        {
          title: `Banned Members (${bans.size})`,
          titleEmoji: "🔨",
          description: formatBanList(bans),
          color: "2B2D31",
          footer: "L • Moderation",
          footerEmoji: "🛡️",
          showTimestamp: true,
        },
        guild,
        { count: bans.size }
      );
      return ctx.reply({ embeds: [embed] });
    }

    // timeouts
    await guild.members.fetch();
    const timedOut = guild.members.cache.filter(
      (m) => m.isCommunicationDisabled && m.isCommunicationDisabled()
    );
    const embed = buildFromConfig(
      {
        title: `Timed-Out Members (${timedOut.size})`,
        titleEmoji: "⏱️",
        description: formatTimeoutList(guild.members.cache),
        color: "2B2D31",
        footer: "L • Moderation",
        footerEmoji: "🛡️",
        showTimestamp: true,
      },
      guild,
      { count: timedOut.size }
    );
    return ctx.reply({ embeds: [embed] });
  },
};
