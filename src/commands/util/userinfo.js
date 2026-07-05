const { SlashCommandBuilder } = require("discord.js");
const { buildFromConfig } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Show information about a user (or yourself)")
    .addUserOption((o) =>
      o.setName("user").setDescription("User to inspect (defaults to you)").setRequired(false)
    ),
  name: "userinfo",
  category: "Util",
  aliases: ["ui", "whois", "user"],

  async executeInteraction(interaction, client) {
    const user = interaction.options.getUser("user") || interaction.user;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    return sendInfo(interaction, interaction.guild, user, member);
  },

  async execute(message, args, client) {
    const user = message.mentions.users.first() || message.author;
    const member = await message.guild.members.fetch(user.id).catch(() => null);
    return sendInfo(message, message.guild, user, member);
  },
};

function sendInfo(ctx, guild, user, member) {
  const createdTs = Math.floor((user.createdTimestamp || 0) / 1000);
  const created = `<t:${createdTs}:F> (<t:${createdTs}:R>)`;
  const joinedTs = member && member.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null;
  const joined = joinedTs ? `<t:${joinedTs}:F> (<t:${joinedTs}:R>)` : "Unknown";
  const roles = member
    ? member.roles.cache.filter((r) => r.id !== guild.id).sort((a, b) => b.position - a.position)
    : [];
  const rolesCount = roles.length;
  const topRole = roles.length > 0 ? roles[0].toString() : "None";
  const bot = user.bot ? "Yes" : "No";

  const description =
    `**__Username__**: ${user.tag}\n` +
    `**__ID__**: ${user.id}\n` +
    `**__Bot__**: ${bot}\n` +
    `**__Account Created__**: ${created}\n` +
    `**__Joined Server__**: ${joined}\n` +
    `**__Roles [${rolesCount}]__**: ${rolesCount > 0 ? roles.slice(0, 10).join(", ") + (rolesCount > 10 ? ` … +${rolesCount - 10}` : "") : "None"}\n` +
    `**__Top Role__**: ${topRole}`;

  const embed = buildFromConfig(
    {
      title: user.tag,
      description,
      color: "2B2D31",
      footer: "L • Util",
      footerIcon: "bot",
      showTimestamp: false,
      thumbnailUrl: user.displayAvatarURL(),
    },
    guild
  );
  return ctx.reply({ embeds: [embed] });
}
