const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { addAudit } = require("../../database");
const { buildEmbed } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("massunban")
    .setDescription("Unban every banned user in this server")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  name: "massunban",
  category: "Premium",
  premium: true,
  permissions: [PermissionFlagsBits.BanMembers],
  aliases: [],

  async executeInteraction(interaction, client) {
    await interaction.deferReply();
    await interaction.editReply({ content: "⏳ Fetching bans and removing them..." });

    let bans;
    try {
      bans = await interaction.guild.bans.fetch();
    } catch (e) {
      const errEmbed = buildEmbed("error", interaction.guild, {
        detail: `Failed to fetch bans: \`${e.message}\``,
      });
      return interaction.editReply({ content: "", embeds: [errEmbed] });
    }

    if (!bans.size) {
      const embed = buildEmbed("success", interaction.guild, {
        detail: "There are no banned users in this server.",
      });
      return interaction.editReply({ content: "", embeds: [embed] });
    }

    let unbanned = 0;
    let failed = 0;
    for (const ban of bans.values()) {
      try {
        await interaction.guild.members.unban(ban.user.id, `Massunban by ${interaction.user.tag}`);
        unbanned++;
      } catch {
        failed++;
      }
    }

    addAudit(
      interaction.guild.id,
      "massunban",
      interaction.user.tag,
      `Unbanned ${unbanned} users${failed ? `, ${failed} failed` : ""}`,
      "danger",
    );
    const embed = buildEmbed("success", interaction.guild, {
      detail: `Mass-unbanned **${unbanned}** user(s)${failed ? ` (**${failed}** failed)` : ""}.`,
    });
    return interaction.editReply({ content: "", embeds: [embed] });
  },

  async execute(message, args, client) {
    const progress = await message.channel.send("⏳ Fetching bans and removing them...");

    let bans;
    try {
      bans = await message.guild.bans.fetch();
    } catch (e) {
      const errEmbed = buildEmbed("error", message.guild, {
        detail: `Failed to fetch bans: \`${e.message}\``,
      });
      return progress.edit({ content: "", embeds: [errEmbed] });
    }

    if (!bans.size) {
      const embed = buildEmbed("success", message.guild, {
        detail: "There are no banned users in this server.",
      });
      return progress.edit({ content: "", embeds: [embed] });
    }

    let unbanned = 0;
    let failed = 0;
    for (const ban of bans.values()) {
      try {
        await message.guild.members.unban(ban.user.id, `Massunban by ${message.author.tag}`);
        unbanned++;
      } catch {
        failed++;
      }
    }

    addAudit(
      message.guild.id,
      "massunban",
      message.author.tag,
      `Unbanned ${unbanned} users${failed ? `, ${failed} failed` : ""}`,
      "danger",
    );
    const embed = buildEmbed("success", message.guild, {
      detail: `Mass-unbanned **${unbanned}** user(s)${failed ? ` (**${failed}** failed)` : ""}.`,
    });
    return progress.edit({ content: "", embeds: [embed] });
  },
};
