const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { buildFromConfig, error } = require("../../embedBuilder");

async function unhideAll(guild) {
  const channels = guild.channels.cache.filter((c) => c.manageable && c.permissionOverwrites);
  const results = await Promise.allSettled(
    channels.map((c) =>
      c.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: null })
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
    .setName("unhideall")
    .setDescription("Unhide ALL channels — clear the ViewChannel deny on @everyone")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  name: "unhideall",
  category: "Moderation",
  permissions: [PermissionFlagsBits.ManageChannels],
  aliases: [],

  async executeInteraction(interaction, client) {
    const me = interaction.guild.members.me;
    if (!me.permissions.has(PermissionFlagsBits.ManageChannels))
      return error(interaction, interaction.guild, "I lack the **Manage Channels** permission.");

    await interaction.deferReply();
    const { total, success, failed } = await unhideAll(interaction.guild);

    const embed = buildFromConfig(
      {
        title: "All Channels Unhidden",
        description:
          `**__Unhidden__**: ${success}/${total} channels` +
          (failed ? `\n**__Failed__**: ${failed} (missing permissions)` : ""),
        color: "57F287",
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

    const status = await message.reply({ content: "👁️ Unhiding all channels..." });
    const { total, success, failed } = await unhideAll(message.guild);

    const embed = buildFromConfig(
      {
        title: "All Channels Unhidden",
        description:
          `**__Unhidden__**: ${success}/${total} channels` +
          (failed ? `\n**__Failed__**: ${failed} (missing permissions)` : ""),
        color: "57F287",
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
