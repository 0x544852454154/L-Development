const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const config = require("../../config");
const { sendEmbed, buildFromConfig } = require("../../embedBuilder");

const UPGRADE_NOTE =
  "**Want Premium for your server?**\n" +
  "Premium unlocks anti-alt detection, autorole, booster role, mass role/unban, and full server identity control (avatar, banner, bio).\n" +
  `Visit L's official support server or contact the bot owner <@${config.ownerId || "unknown"}> to upgrade.`;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("premium")
    .setDescription("View this server's L Premium status and benefits"),
  name: "premium",
  category: "Premium",
  premium: true,
  aliases: [],

  async executeInteraction(interaction, client) {
    await sendEmbed(interaction, "premium_status", interaction.guild, {
      server: interaction.guild.name,
    });
    const followup = buildFromConfig(
      {
        title: "How to Get Premium",
        description: UPGRADE_NOTE,
        color: "F1C40F",
        footer: "L • Premium",
        footerIcon: "bot",
        showTimestamp: false,
      },
      interaction.guild,
    );
    return interaction.followUp({ embeds: [followup] });
  },

  async execute(message, args, client) {
    await sendEmbed(message, "premium_status", message.guild, {
      server: message.guild.name,
    });
    const followup = buildFromConfig(
      {
        title: "How to Get Premium",
        description: UPGRADE_NOTE,
        color: "F1C40F",
        footer: "L • Premium",
        footerIcon: "bot",
        showTimestamp: false,
      },
      message.guild,
    );
    return message.channel.send({ embeds: [followup] });
  },
};
