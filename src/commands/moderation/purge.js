const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { sendEmbed, error } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Delete a batch of messages (1-100)")
    .addIntegerOption((o) =>
      o
        .setName("amount")
        .setDescription("Number of messages to delete (1-100)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  name: "purge",
  category: "Moderation",
  permissions: [PermissionFlagsBits.ManageMessages],
  aliases: ["clear", "clean"],

  async executeInteraction(interaction, client) {
    const amount = interaction.options.getInteger("amount");
    const channel = interaction.channel;

    const me = interaction.guild.members.me;
    if (!me.permissionsIn(channel).has(PermissionFlagsBits.ManageMessages))
      return error(interaction, interaction.guild, `I lack **Manage Messages** permission in ${channel}.`);

    let deleted;
    try {
      deleted = await channel.bulkDelete(amount, true);
    } catch (e) {
      return error(interaction, interaction.guild, `Failed to purge: ${e.message}`);
    }

    await sendEmbed(interaction, "purge_success", interaction.guild, {
      count: deleted.size,
      channel: channel.toString(),
    });
    try {
      const reply = await interaction.fetchReply();
      setTimeout(() => reply.delete().catch(() => {}), 3000);
    } catch {}
  },

  async execute(message, args, client) {
    const amount = parseInt(args[0]);
    const channel = message.channel;

    if (!amount || isNaN(amount) || amount < 1 || amount > 100)
      return error(message, message.guild, "Please provide a number between **1 and 100**.");

    const me = message.guild.members.me;
    if (!me.permissionsIn(channel).has(PermissionFlagsBits.ManageMessages))
      return error(message, message.guild, `I lack **Manage Messages** permission in ${channel}.`);

    // Include the invoking message itself in the deletion batch.
    let deleted;
    try {
      // Add 1 so the user's command message is also cleared, capped at 100.
      const toDelete = Math.min(amount + 1, 100);
      deleted = await channel.bulkDelete(toDelete, true);
    } catch (e) {
      return error(message, message.guild, `Failed to purge: ${e.message}`);
    }

    const reply = await sendEmbed(message, "purge_success", message.guild, {
      count: deleted.size,
      channel: channel.toString(),
    });
    setTimeout(() => {
      if (reply && reply.deletable) reply.delete().catch(() => {});
    }, 3000);
  },
};
