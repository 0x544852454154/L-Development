const { SlashCommandBuilder } = require("discord.js");
const { buildFromConfig, error } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("banner")
    .setDescription("Display a user's profile banner")
    .addUserOption((o) =>
      o.setName("user").setDescription("User to fetch the banner of (defaults to you)").setRequired(false)
    ),
  name: "banner",
  category: "Util",
  aliases: ["bnr"],

  async executeInteraction(interaction, client) {
    const user = interaction.options.getUser("user") || interaction.user;
    return sendBanner(interaction, interaction.guild, user, client);
  },

  async execute(message, args, client) {
    const user = message.mentions.users.first() || message.author;
    return sendBanner(message, message.guild, user, client);
  },
};

async function sendBanner(ctx, guild, user, client) {
  // Force-fetch to get banner data which isn't included in the basic user object
  const fetched = await client.users.fetch(user.id, { force: true }).catch(() => user);
  const banner = fetched.bannerURL ? fetched.bannerURL({ size: 1024 }) : null;
  if (!banner) {
    return error(ctx, guild, `**${user.tag}** does not have a profile banner set.`);
  }
  const embed = buildFromConfig(
    {
      title: `${user.tag}'s Banner`,
      titleEmoji: "🎌",
      description: `[Open in browser](${banner})`,
      color: "2B2D31",
      footer: "L • Util",
      footerEmoji: "🔧",
      showTimestamp: true,
      imageUrl: banner,
    },
    guild
  );
  return ctx.reply({ embeds: [embed] });
}
