const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { buildFromConfig, error } = require("../../embedBuilder");

async function hideAll(guild) {
  const channels = guild.channels.cache.filter((c) => c.manageable && c.permissionOverwrites);
  let success = 0;
  let failed = 0;
  const results = await Promise.allSettled(
    channels.map((c) =>
      c.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false })
    )
  );
  for (const r of results) {
    if (r.status === "fulfilled") success++;
    else failed++;
  }
  return { total: channels.size, success, failed };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("hideall")
    .setDescription("Hide ALL channels from @everyone. Destructive — use with caution.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  name: "hideall",
  category: "Moderation",
  permissions: [PermissionFlagsBits.ManageChannels],
  aliases: [],

  async executeInteraction(interaction, client) {
    const me = interaction.guild.members.me;
    if (!me.permissions.has(PermissionFlagsBits.ManageChannels))
      return error(interaction, interaction.guild, "I lack the **Manage Channels** permission.");

    await interaction.deferReply();
    const { total, success, failed } = await hideAll(interaction.guild);

    const embed = buildFromConfig(
      {
        title: "All Channels Hidden",
        description:
          `**__Hidden__**: ${success}/${total} channels` +
          (failed ? `\n**__Failed__**: ${failed} (missing permissions)` : ""),
        color: "ED4245",
        footer: "L • Moderation",
        footerIcon: "bot",
        showTimestamp: false,
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

    const status = await message.reply({
      content: "🙈 Hiding all channels... this may take a moment.",
    });
    const { total, success, failed } = await hideAll(message.guild);

    const embed = buildFromConfig(
      {
        title: "All Channels Hidden",
        description:
          `**__Hidden__**: ${success}/${total} channels` +
          (failed ? `\n**__Failed__**: ${failed} (missing permissions)` : ""),
        color: "ED4245",
        footer: "L • Moderation",
        footerIcon: "bot",
        showTimestamp: false,
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
