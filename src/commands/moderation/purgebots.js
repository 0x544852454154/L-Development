const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { buildFromConfig, error } = require("../../embedBuilder");

async function purgeBots(channel, requested) {
  // Fetch up to 100 recent messages, filter those authored by bots.
  let collected;
  try {
    collected = await channel.messages.fetch({ limit: 100 });
  } catch (e) {
    return { error: e.message, deleted: 0 };
  }
  const botMsgs = collected.filter((m) => m.author && m.author.bot).first(requested);
  if (!botMsgs || botMsgs.length === 0) return { deleted: 0, error: null };
  try {
    // bulkDelete allows up to 100 messages within 14 days.
    const deleted = await channel.bulkDelete(botMsgs, true);
    return { deleted: deleted.size, error: null };
  } catch (e) {
    return { deleted: 0, error: e.message };
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("purgebots")
    .setDescription("Purge messages sent by bot accounts (up to 100)")
    .addIntegerOption((o) =>
      o
        .setName("amount")
        .setDescription("Max bot messages to delete (1-100, default 50)")
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(100)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  name: "purgebots",
  category: "Moderation",
  permissions: [PermissionFlagsBits.ManageMessages],
  aliases: ["clearbots"],

  async executeInteraction(interaction, client) {
    const amount = interaction.options.getInteger("amount") || 50;
    const channel = interaction.channel;

    const me = interaction.guild.members.me;
    if (!me.permissionsIn(channel).has(PermissionFlagsBits.ManageMessages))
      return error(interaction, interaction.guild, `I lack **Manage Messages** permission in ${channel}.`);

    await interaction.deferReply({ ephemeral: true });
    const { deleted, error: err } = await purgeBots(channel, amount);
    if (err) return interaction.editReply({ content: `Failed to purge bots: ${err}` });

    const embed = buildFromConfig(
      {
        title: "Bot Messages Purged",
        titleEmoji: "🤖",
        description: `Deleted **${deleted}** bot message(s) from ${channel}.`,
        color: "57F287",
        footer: "L • Moderation",
        footerEmoji: "🛡️",
        showTimestamp: true,
      },
      interaction.guild,
      { count: deleted, channel: channel.toString() }
    );
    return interaction.editReply({ embeds: [embed] });
  },

  async execute(message, args, client) {
    const amount = Math.min(Math.max(parseInt(args[0]) || 50, 1), 100);
    const channel = message.channel;

    const me = message.guild.members.me;
    if (!me.permissionsIn(channel).has(PermissionFlagsBits.ManageMessages))
      return error(message, message.guild, `I lack **Manage Messages** permission in ${channel}.`);

    const { deleted, error: err } = await purgeBots(channel, amount);
    if (err) return error(message, message.guild, `Failed to purge bots: ${err}`);

    const reply = await buildFromConfig(
      {
        title: "Bot Messages Purged",
        titleEmoji: "🤖",
        description: `Deleted **${deleted}** bot message(s) from ${channel}.`,
        color: "57F287",
        footer: "L • Moderation",
        footerEmoji: "🛡️",
        showTimestamp: true,
      },
      message.guild,
      { count: deleted, channel: channel.toString() }
    );
    const sent = await message.reply({ embeds: [reply] });
    setTimeout(() => {
      if (sent && sent.deletable) sent.delete().catch(() => {});
    }, 3000);
  },
};
