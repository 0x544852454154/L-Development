const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { getGuild, updateGuild, addAudit } = require("../../database");
const { success, error, buildFromConfig } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("botwhitelist")
    .setDescription("Manage the bot whitelist (bots allowed to be added without being auto-kicked)")
    .addStringOption((o) =>
      o.setName("action").setDescription("What to do").setRequired(true)
        .addChoices(
          { name: "add", value: "add" },
          { name: "remove", value: "remove" },
          { name: "list", value: "list" },
        )
    )
    .addUserOption((o) =>
      o.setName("bot").setDescription("The bot to add or remove").setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  name: "botwhitelist",
  category: "Antinuke",
  permissions: [PermissionFlagsBits.ManageGuild],
  aliases: ["bw", "botwl"],

  async executeInteraction(interaction, client) {
    const action = interaction.options.getString("action");
    const botUser = interaction.options.getUser("bot");
    let botId = null;
    if (botUser) botId = botUser.id;
    return run(interaction, interaction.guild, interaction.user, action, botId);
  },

  async execute(message, args, client) {
    const data = getGuild(message.guild.id);
    const action = (args[0] || "").toLowerCase();
    if (!action) {
      return error(message, message.guild, `Usage: \`${data.prefix}botwhitelist <add|remove|list> [botid|@bot]\``);
    }
    if (!["add", "remove", "list"].includes(action)) {
      return error(message, message.guild, "Action must be `add`, `remove`, or `list`.");
    }
    let botId = null;
    if (action === "add" || action === "remove") {
      const mention = message.mentions.users.first();
      if (mention) botId = mention.id;
      else if (args[1] && /^\d{17,20}$/.test(args[1])) botId = args[1];
      else return error(message, message.guild, "Please mention a bot or provide a valid bot ID.");
    }
    return run(message, message.guild, message.author, action, botId);
  },
};

function run(ctx, guild, user, action, botId) {
  const data = getGuild(guild.id);
  const list = data.antinuke.whitelistedBots || [];

  if (action === "add") {
    if (!botId) return error(ctx, guild, "Please specify a bot to add.");
    if (list.includes(botId)) return error(ctx, guild, "That bot is already on the whitelist.");
    updateGuild(guild.id, (d) => {
      if (!Array.isArray(d.antinuke.whitelistedBots)) d.antinuke.whitelistedBots = [];
      d.antinuke.whitelistedBots.push(botId);
    });
    addAudit(guild.id, "Bot Whitelisted", user.tag, `Bot <@${botId}> (\`${botId}\`) added to the bot whitelist`, "info");
    return success(ctx, guild, `Bot <@${botId}> (\`${botId}\`) has been **added** to the bot whitelist.\nIt will no longer be auto-kicked when added to the server.`);
  }

  if (action === "remove") {
    if (!botId) return error(ctx, guild, "Please specify a bot to remove.");
    if (!list.includes(botId)) return error(ctx, guild, "That bot is not on the whitelist.");
    updateGuild(guild.id, (d) => {
      d.antinuke.whitelistedBots = (d.antinuke.whitelistedBots || []).filter((id) => id !== botId);
    });
    addAudit(guild.id, " Bot Unwhitelisted", user.tag, `Bot <@${botId}> (\`${botId}\`) removed from the bot whitelist`, "info");
    return success(ctx, guild, `Bot <@${botId}> (\`${botId}\`) has been **removed** from the bot whitelist.\nIt will be auto-kicked if added by a non-whitelisted user.`);
  }

  // list
  const cfg = {
    title: "Bot Whitelist",
    description: list.length
      ? list.map((id) => `• <@${id}> — \`${id}\``).join("\n")
      : "No bots are currently whitelisted.",
    color: "2B2D31",
    footer: `L • Antinuke • ${list.length} bot${list.length === 1 ? "" : "s"}`,
    showTimestamp: true,
  };
  const embed = buildFromConfig(cfg, guild);
  return ctx.reply({ embeds: [embed] });
}
