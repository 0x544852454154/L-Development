const { SlashCommandBuilder } = require("discord.js");
const { buildFromConfig } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("invite")
    .setDescription("Get the bot invite link with recommended scopes and permissions"),
  name: "invite",
  category: "Info",
  aliases: ["inv", "invitebot", "addbot"],

  async executeInteraction(interaction, client) {
    return this._run(interaction, client);
  },
  async execute(message, args, client) {
    return this._run(message, client);
  },
  async _run(ctx, client) {
    const clientId = client.user.id;
    const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=8&scope=bot%20applications.commands`;
    const embed = buildFromConfig(
      {
        title: "Invite L to Your Server",
        description: `**__Invite L__**: [Add L to your server](${inviteUrl})\n\n**__Scopes__**: \`bot\`, \`applications.commands\`\n**__Permissions__**: Administrator (for full antinuke + auto-restore)`,
        color: "ED4245",
        footer: "L • Info",
        footerIcon: "bot",
        showTimestamp: false,
      },
      ctx.guild
    );
    const isInteraction = !!ctx.commandName;
    if (isInteraction) return ctx.reply({ embeds: [embed] });
    return ctx.reply({ embeds: [embed] });
  },
};
