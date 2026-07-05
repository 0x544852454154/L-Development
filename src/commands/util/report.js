const { SlashCommandBuilder } = require("discord.js");
const { getGuild } = require("../../database");
const { buildFromConfig, sendEmbed, error } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("report")
    .setDescription("Report a user to the moderation team")
    .addUserOption((o) =>
      o.setName("user").setDescription("User to report").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("reason").setDescription("Reason for the report").setRequired(true)
    ),
  name: "report",
  category: "Util",
  aliases: [],

  async executeInteraction(interaction, client) {
    const target = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason").trim();
    return doReport(interaction, interaction.guild, interaction.user, target, reason, true);
  },

  async execute(message, args, client) {
    const target = message.mentions.users.first();
    if (!target) return error(message, message.guild, "Mention the user you want to report.");
    const reason = args.slice(1).join(" ").trim();
    if (!reason) return error(message, message.guild, "Provide a reason for the report.");
    return doReport(message, message.guild, message.author, target, reason, false);
  },
};

async function doReport(ctx, guild, reporter, target, reason, ephemeral) {
  const data = getGuild(guild.id);
  const logChannelId = data.logging && data.logging.channel;
  const logChannel = logChannelId ? guild.channels.cache.get(logChannelId) : null;

  const reportEmbed = buildFromConfig(
    {
      title: "New Member Report",
      description: `**__Reported__**: ${target} (\`${target.id}\`)\n**__By__**: ${reporter} (\`${reporter.id}\`)\n**__Reason__**: ${reason}`,
      color: "ED4245",
      footer: "L • Util",
      footerIcon: "bot",
      showTimestamp: true,
      thumbnailUrl: target.displayAvatarURL(),
    },
    guild
  );

  if (logChannel) {
    const sent = await logChannel.send({ embeds: [reportEmbed] }).catch(() => null);
    if (!sent) {
      return error(ctx, guild, "Couldn't reach the configured log channel. Report not delivered.");
    }
    return sendEmbed(
      ctx,
      "success",
      guild,
      { detail: `Your report against **${target.tag}** was sent to the moderation team.` },
      ephemeral ? { ephemeral: true } : {}
    );
  }

  // No log channel — surface the report inline so it's not silently lost.
  return ctx.reply({ embeds: [reportEmbed] });
}
