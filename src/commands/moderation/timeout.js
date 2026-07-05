const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { addAudit } = require("../../database");
const { sendEmbed, error } = require("../../embedBuilder");

function parseDuration(str) {
  const m = str.match(/^(\d+)(s|m|h|d)$/i);
  if (!m) return null;
  const n = parseInt(m[1]);
  const u = m[2].toLowerCase();
  return n * ({ s: 1000, m: 60000, h: 3600000, d: 86400000 }[u]);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout a member for a duration (e.g. 10m, 2h, 1d)")
    .addUserOption((o) =>
      o.setName("user").setDescription("The member to timeout").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("duration").setDescription("Duration: e.g. 30s, 10m, 2h, 1d").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("reason").setDescription("Reason for the timeout").setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  name: "timeout",
  category: "Moderation",
  permissions: [PermissionFlagsBits.ModerateMembers],
  aliases: ["mute"],

  async executeInteraction(interaction, client) {
    const target = interaction.options.getMember("user");
    const durationStr = interaction.options.getString("duration");
    const reason = interaction.options.getString("reason") || "No reason provided";

    if (!target) return error(interaction, interaction.guild, "That member was not found in this server.");
    if (target.id === interaction.guild.ownerId) return error(interaction, interaction.guild, "I cannot timeout the server owner.");
    if (target.id === client.user.id) return error(interaction, interaction.guild, "I cannot timeout myself.");

    const ms = parseDuration(durationStr);
    if (!ms) return error(interaction, interaction.guild, `Invalid duration \`${durationStr}\`. Use formats like \`30s\`, \`10m\`, \`2h\`, \`1d\`.`);

    if (ms > 2419200000) return error(interaction, interaction.guild, "Duration cannot exceed **28 days**.");

    const me = interaction.guild.members.me;
    if (!me.permissions.has(PermissionFlagsBits.ModerateMembers))
      return error(interaction, interaction.guild, "I lack the **Moderate Members** permission (Timeout).");

    if (
      target.roles.highest.position >= interaction.member.roles.highest.position &&
      interaction.guild.ownerId !== interaction.user.id
    )
      return error(interaction, interaction.guild, "You cannot timeout a member with an equal or higher role than you.");

    if (target.roles.highest.position >= me.roles.highest.position)
      return error(interaction, interaction.guild, "That member has an equal or higher role than me. I cannot timeout them.");

    try {
      await target.timeout(ms, `${interaction.user.tag}: ${reason}`);
    } catch (e) {
      return error(interaction, interaction.guild, `Failed to timeout: ${e.message}`);
    }

    addAudit(interaction.guild.id, "timeout", interaction.user.tag, `Timed out ${target.user.tag} for ${durationStr} — ${reason}`, "warning");
    return sendEmbed(interaction, "timeout_success", interaction.guild, { user: target.user.tag, duration: durationStr, reason });
  },

  async execute(message, args, client) {
    const target = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
    const durationStr = args[1];
    const reason = args.slice(2).join(" ") || "No reason provided";

    if (!target) return error(message, message.guild, "Please mention a user or provide a valid user ID.");
    if (!durationStr) return error(message, message.guild, "Please provide a duration (e.g. `10m`, `2h`, `1d`).");
    if (target.id === message.guild.ownerId) return error(message, message.guild, "I cannot timeout the server owner.");
    if (target.id === client.user.id) return error(message, message.guild, "I cannot timeout myself.");

    const ms = parseDuration(durationStr);
    if (!ms) return error(message, message.guild, `Invalid duration \`${durationStr}\`. Use formats like \`30s\`, \`10m\`, \`2h\`, \`1d\`.`);

    if (ms > 2419200000) return error(message, message.guild, "Duration cannot exceed **28 days**.");

    const me = message.guild.members.me;
    if (!me.permissions.has(PermissionFlagsBits.ModerateMembers))
      return error(message, message.guild, "I lack the **Moderate Members** permission (Timeout).");

    if (
      target.roles.highest.position >= message.member.roles.highest.position &&
      message.guild.ownerId !== message.author.id
    )
      return error(message, message.guild, "You cannot timeout a member with an equal or higher role than you.");

    if (target.roles.highest.position >= me.roles.highest.position)
      return error(message, message.guild, "That member has an equal or higher role than me. I cannot timeout them.");

    try {
      await target.timeout(ms, `${message.author.tag}: ${reason}`);
    } catch (e) {
      return error(message, message.guild, `Failed to timeout: ${e.message}`);
    }

    addAudit(message.guild.id, "timeout", message.author.tag, `Timed out ${target.user.tag} for ${durationStr} — ${reason}`, "warning");
    return sendEmbed(message, "timeout_success", message.guild, { user: target.user.tag, duration: durationStr, reason });
  },
};
