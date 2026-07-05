const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { getGuild, updateGuild, addAudit } = require("../../database");
const { buildFromConfig, success, error } = require("../../embedBuilder");
const config = require("../../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("lockidentity")
    .setDescription("Lock the server identity (name, icon, description) — any unauthorized change is reverted + banned")
    .addStringOption((o) =>
      o.setName("action").setDescription("What to do").setRequired(false)
        .addChoices(
          { name: "snapshot — capture current identity as the protected state", value: "snapshot" },
          { name: "seticon — set the protected L icon as the server icon", value: "seticon" },
          { name: "off — disable identity lock", value: "off" },
          { name: "status — show current identity lock state", value: "status" },
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  name: "lockidentity",
  category: "Antinuke",
  permissions: [PermissionFlagsBits.ManageGuild],
  aliases: ["identity", "lockid"],

  async executeInteraction(interaction, client) {
    const action = interaction.options.getString("action") || "status";
    return runIdentity(interaction, interaction.guild, interaction.user, action);
  },

  async execute(message, args, client) {
    const action = (args[0] || "status").toLowerCase();
    return runIdentity(message, message.guild, message.author, action);
  },
};

async function runIdentity(ctx, guild, user, action) {
  const data = getGuild(guild.id);
  const id = data.serverIdentity || {};

  if (action === "snapshot") {
    updateGuild(guild.id, (d) => {
      d.serverIdentity = {
        name: guild.name,
        iconUrl: guild.iconURL(),
        description: guild.description,
        vanity: guild.vanityURLCode,
        locked: true,
      };
    });
    addAudit(guild.id, "Identity Locked", user.tag, `Snapshot: name="${guild.name}", icon=${guild.iconURL() ? "set" : "none"}, desc=${guild.description ? "set" : "none"}`, "info");
    const embed = buildFromConfig({
      title: "Server Identity Locked",
      description:
        `**__Name__**: ${guild.name}\n` +
        `**__Icon__**: ${guild.iconURL() ? "Set (protected)" : "None"}\n` +
        `**__Description__**: ${guild.description ? "Set (protected)" : "None"}\n\n` +
        `Any unauthorized change will be instantly reverted and the offender banned.`,
      color: "57F287",
      footer: "L • Identity Lock",
      footerIcon: "bot",
      showTimestamp: false,
    }, guild);
    return ctx.reply({ embeds: [embed] });
  }

  if (action === "seticon") {
    if (!config.protectedServerIcon) {
      return error(ctx, guild, "No protected server icon is configured in config.js.");
    }
    try {
      await guild.setIcon(config.protectedServerIcon, `[L Identity Lock] Set protected L icon by ${user.tag}`);
      updateGuild(guild.id, (d) => {
        d.serverIdentity = d.serverIdentity || { name: null, iconUrl: null, description: null, locked: false };
        d.serverIdentity.iconUrl = guild.iconURL();
        d.serverIdentity.locked = true;
      });
      addAudit(guild.id, "Identity Icon Set", user.tag, "Set protected L server icon", "info");
      return success(ctx, guild, `Server icon set to the protected L icon and locked. Any unauthorized icon change will be reverted to this icon.`);
    } catch (e) {
      return error(ctx, guild, `Failed to set icon: ${e.message}`);
    }
  }

  if (action === "off") {
    updateGuild(guild.id, (d) => {
      if (d.serverIdentity) d.serverIdentity.locked = false;
    });
    addAudit(guild.id, "Identity Lock Disabled", user.tag, "Server identity lock turned off", "warning");
    return success(ctx, guild, "Server identity lock is now **disabled**. Name, icon, and description changes will no longer be reverted.");
  }

  // status
  const embed = buildFromConfig({
    title: "Server Identity Lock",
    description:
      `**__Status__**: ${id.locked ? "LOCKED (protected)" : "Unlocked"}\n` +
      `**__Protected Name__**: ${id.name || "(not snapshotted — will use previous name on revert)"}\n` +
      `**__Protected Icon__**: ${id.iconUrl ? "Set" : "(not snapshotted — will use protected L icon on revert)"}\n` +
      `**__Protected Description__**: ${id.description !== null && id.description !== undefined ? "Set" : "(not snapshotted)"}\n\n` +
      `Use \`/lockidentity snapshot\` to capture the current identity.\n` +
      `Use \`/lockidentity seticon\` to set the L icon and lock it.`,
    color: id.locked ? "57F287" : "F1C40F",
    footer: "L • Identity Lock",
    footerIcon: "bot",
    showTimestamp: false,
  }, guild);
  return ctx.reply({ embeds: [embed] });
}
