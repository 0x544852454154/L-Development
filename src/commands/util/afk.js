const { SlashCommandBuilder } = require("discord.js");
const { updateGuild } = require("../../database");
const { buildFromConfig } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("afk")
    .setDescription("Mark yourself as Away-From-Keyboard with an optional message")
    .addStringOption((o) =>
      o.setName("message").setDescription("Optional AFK message").setRequired(false)
    ),
  name: "afk",
  category: "Util",
  aliases: ["away"],

  async executeInteraction(interaction, client) {
    const msg = interaction.options.getString("message") || "AFK";
    return setAfk(interaction, interaction.guild, interaction.user, msg);
  },

  async execute(message, args, client) {
    const msg = args.join(" ").trim() || "AFK";
    return setAfk(message, message.guild, message.author, msg);
  },
};

function setAfk(ctx, guild, user, msg) {
  updateGuild(guild.id, (d) => {
    if (!d.afk) d.afk = {};
    d.afk[user.id] = { message: msg, since: Date.now() };
  });
  const embed = buildFromConfig(
    {
      title: "You are now AFK",
      description: `**__Status__**: AFK\n**__Message__**: ${msg}\n\nYou'll be marked back automatically the next time you speak.`,
      color: "2B2D31",
      footer: "L • Util",
      footerIcon: "bot",
      showTimestamp: false,
      thumbnailUrl: user.displayAvatarURL(),
    },
    guild
  );
  return ctx.reply({ embeds: [embed] });
}
