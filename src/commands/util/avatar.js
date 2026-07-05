const { SlashCommandBuilder } = require("discord.js");
const { buildFromConfig } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Display a user's avatar in full resolution")
    .addUserOption((o) =>
      o.setName("user").setDescription("User to fetch the avatar of (defaults to you)").setRequired(false)
    ),
  name: "avatar",
  category: "Util",
  aliases: ["av", "pfp", "icon"],

  async executeInteraction(interaction, client) {
    const user = interaction.options.getUser("user") || interaction.user;
    return sendAvatar(interaction, interaction.guild, user);
  },

  async execute(message, args, client) {
    const user = message.mentions.users.first() || message.author;
    return sendAvatar(message, message.guild, user);
  },
};

function sendAvatar(ctx, guild, user) {
  const png = user.displayAvatarURL({ size: 1024, extension: "png" });
  const webp = user.displayAvatarURL({ size: 1024, extension: "webp" });
  const jpg = user.displayAvatarURL({ size: 1024, extension: "jpg" });
  const embed = buildFromConfig(
    {
      title: `${user.tag}'s Avatar`,
      description: `[PNG](${png}) • [WebP](${webp}) • [JPG](${jpg})`,
      color: "2B2D31",
      footer: "L • Util",
      footerIcon: "bot",
      showTimestamp: false,
      imageUrl: png,
    },
    guild
  );
  return ctx.reply({ embeds: [embed] });
}
