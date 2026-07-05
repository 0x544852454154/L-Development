const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { buildFromConfig, error } = require("../../embedBuilder");

async function lockAll(guild) {
  const channels = guild.channels.cache.filter((c) => c.manageable && c.permissionOverwrites);
  const results = await Promise.allSettled(
    channels.map((c) =>
      c.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false })
    )
  );
  let success = 0;
  let failed = 0;
  for (const r of results) {
    if (r.status === "fulfilled") success++;
    else failed++;
  }
  return { total: channels.size, success, failed };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("lockall")
    .setDescription("Lock ALL channels by denying SendMessages for @everyone")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  name: "lockall",
  category: "Moderation",
  permissions: [PermissionFlagsBits.ManageChannels],
  aliases: [],

  async executeInteraction(interaction, client) {
    const me = interaction.guild.members.me;
    if (!me.permissions.has(PermissionFlagsBits.ManageChannels))
      return error(interaction, interaction.guild, "I lack the **Manage Channels** permission.");

    await interaction.deferReply();
    const { total, success, failed } = await lockAll(interaction.guild);

    const embed = buildFromConfig(
      {
        title: "All Channels Locked",
        titleEmoji: "🔒",
        description: `🔒 Locked **${success}/${total}** channels.${failed ? `\nFailed: **${failed}** (missing permissions).` : ""}`,
        color: "ED4245",
        footer: "L • Moderation",
        footerEmoji: "🛡️",
        showTimestamp: true,
      },
      interaction.guild,
      { success, total, failed }
    );
    return interaction.editReply({ embeds: [embed] });
  },

  async execute(message, args, client) {
    const me = message.guild.members.me;
    if (!me.permissions.has(PermissionFlagsBits.ManageChannels))
      return error(message, message.guild, "I lack the **Manage Channels** permission.");

    const status = await message.reply({ content: "🔒 Locking all channels..." });
    const { total, success, failed } = await lockAll(message.guild);

    const embed = buildFromConfig(
      {
        title: "All Channels Locked",
        titleEmoji: "🔒",
        description: `🔒 Locked **${success}/${total}** channels.${failed ? `\nFailed: **${failed}** (missing permissions).` : ""}`,
        color: "ED4245",
        footer: "L • Moderation",
        footerEmoji: "🛡️",
        showTimestamp: true,
      },
      message.guild,
      { success, total, failed }
    );
    try {
      return await status.edit({ content: null, embeds: [embed] });
    } catch {
      return message.channel.send({ embeds: [embed] });
    }
  },
};
