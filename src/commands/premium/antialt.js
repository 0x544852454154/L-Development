const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { updateGuild, getGuild, addAudit } = require("../../database");
const { success, error } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("antialt")
    .setDescription("Configure alt-account detection — auto-kick fresh accounts on join")
    .addStringOption((o) =>
      o
        .setName("action")
        .setDescription("Action to perform")
        .setRequired(true)
        .addChoices(
          { name: "on — enable alt detection", value: "on" },
          { name: "off — disable alt detection", value: "off" },
          { name: "threshold — set minimum account age", value: "threshold" },
        )
    )
    .addIntegerOption((o) =>
      o
        .setName("age")
        .setDescription("Minimum account age in days (used with threshold)")
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(365)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  name: "antialt",
  category: "Premium",
  premium: true,
  permissions: [PermissionFlagsBits.ManageGuild],
  aliases: [],

  async executeInteraction(interaction, client) {
    const action = interaction.options.getString("action");
    const age = interaction.options.getInteger("age");
    const data = getGuild(interaction.guild.id);
    const current = data.antialt || { enabled: false, minAgeDays: 7 };

    if (action === "on") {
      updateGuild(interaction.guild.id, (d) => {
        d.antialt = { enabled: true, minAgeDays: current.minAgeDays || 7 };
      });
      addAudit(
        interaction.guild.id,
        "antialt_enable",
        interaction.user.tag,
        `Alt detection enabled (min age: ${current.minAgeDays || 7} days)`,
        "info",
      );
      return success(
        interaction,
        interaction.guild,
        `Alt-account detection is now **ENABLED**.\nAccounts younger than **${current.minAgeDays || 7} days** will be kicked on join.`,
      );
    }

    if (action === "off") {
      updateGuild(interaction.guild.id, (d) => {
        d.antialt = { enabled: false, minAgeDays: current.minAgeDays || 7 };
      });
      addAudit(interaction.guild.id, "antialt_disable", interaction.user.tag, "Alt detection disabled", "info");
      return success(interaction, interaction.guild, "Alt-account detection is now **DISABLED**.");
    }

    if (action === "threshold") {
      if (!age || age < 1) {
        return error(
          interaction,
          interaction.guild,
          "Please provide a valid number of days (1 or more). Example: `/antialt threshold 7`",
        );
      }
      const enabled = (current && current.enabled) || false;
      updateGuild(interaction.guild.id, (d) => {
        d.antialt = { enabled, minAgeDays: age };
      });
      addAudit(
        interaction.guild.id,
        "antialt_threshold",
        interaction.user.tag,
        `Alt detection threshold set to ${age} days`,
        "info",
      );
      return success(
        interaction,
        interaction.guild,
        `Alt detection threshold set to **${age} days**.${enabled ? "" : " Detection is currently **disabled** — enable with `/antialt on`."}`,
      );
    }

    return error(interaction, interaction.guild, "Unknown action. Use `on`, `off`, or `threshold`.");
  },

  async execute(message, args, client) {
    const action = args[0];
    const data = getGuild(message.guild.id);
    const current = data.antialt || { enabled: false, minAgeDays: 7 };

    if (action === "on") {
      updateGuild(message.guild.id, (d) => {
        d.antialt = { enabled: true, minAgeDays: current.minAgeDays || 7 };
      });
      addAudit(
        message.guild.id,
        "antialt_enable",
        message.author.tag,
        `Alt detection enabled (min age: ${current.minAgeDays || 7} days)`,
        "info",
      );
      return success(
        message,
        message.guild,
        `Alt-account detection is now **ENABLED**.\nAccounts younger than **${current.minAgeDays || 7} days** will be kicked on join.`,
      );
    }

    if (action === "off") {
      updateGuild(message.guild.id, (d) => {
        d.antialt = { enabled: false, minAgeDays: current.minAgeDays || 7 };
      });
      addAudit(message.guild.id, "antialt_disable", message.author.tag, "Alt detection disabled", "info");
      return success(message, message.guild, "Alt-account detection is now **DISABLED**.");
    }

    if (action === "threshold") {
      const age = parseInt(args[1], 10);
      if (!age || age < 1) {
        return error(
          message,
          message.guild,
          "Please provide a valid number of days (1 or more). Example: `!antialt threshold 7`",
        );
      }
      const enabled = (current && current.enabled) || false;
      updateGuild(message.guild.id, (d) => {
        d.antialt = { enabled, minAgeDays: age };
      });
      addAudit(
        message.guild.id,
        "antialt_threshold",
        message.author.tag,
        `Alt detection threshold set to ${age} days`,
        "info",
      );
      return success(
        message,
        message.guild,
        `Alt detection threshold set to **${age} days**.${enabled ? "" : " Detection is currently **disabled** — enable with `!antialt on`."}`,
      );
    }

    return error(message, message.guild, "Usage: `!antialt on|off|threshold <days>`");
  },
};
