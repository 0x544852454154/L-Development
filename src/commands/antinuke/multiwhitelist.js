const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { getGuild, updateGuild, addAudit } = require("../../database");
const { success, error } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("multiwhitelist")
    .setDescription("Add or remove multiple roles or users from the antinuke whitelist at once")
    .addStringOption((o) =>
      o.setName("type").setDescription("Whitelist type").setRequired(true)
        .addChoices({ name: "roles", value: "roles" }, { name: "users", value: "users" })
    )
    .addStringOption((o) =>
      o.setName("action").setDescription("Add or remove").setRequired(true)
        .addChoices({ name: "add", value: "add" }, { name: "remove", value: "remove" })
    )
    .addStringOption((o) =>
      o.setName("targets").setDescription("Comma-separated role/user IDs, mentions or names").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  name: "multiwhitelist",
  category: "Antinuke",
  permissions: [PermissionFlagsBits.ManageGuild],
  aliases: ["mwl"],

  async executeInteraction(interaction, client) {
    const type = interaction.options.getString("type");
    const action = interaction.options.getString("action");
    const targetsStr = interaction.options.getString("targets");
    const targets = targetsStr.split(",").map((s) => s.trim()).filter(Boolean);
    return runMulti(interaction, interaction.guild, interaction.user, type, action, targets);
  },

  async execute(message, args, client) {
    const data = getGuild(message.guild.id);
    const type = (args[0] || "").toLowerCase();
    const action = (args[1] || "").toLowerCase();
    if (!["roles", "users"].includes(type)) {
      return error(message, message.guild, `Usage: \`${data.prefix}multiwhitelist <roles|users> <add|remove> @target1 @target2...\``);
    }
    if (!["add", "remove"].includes(action)) {
      return error(message, message.guild, `Usage: \`${data.prefix}multiwhitelist ${type} <add|remove> @target1 @target2...\``);
    }
    const rawTargets = args.slice(2);
    const targets = [];
    const seen = new Set();
    const addUnique = (id) => { if (id && !seen.has(id)) { seen.add(id); targets.push(id); } };

    if (type === "users") {
      message.mentions.users.forEach((u) => addUnique(u.id));
    } else {
      message.mentions.roles.forEach((r) => addUnique(r.id));
    }
    for (const a of rawTargets) {
      let m = a.match(/^<@!?(\d+)>$/);
      if (m) { addUnique(m[1]); continue; }
      m = a.match(/^<@&(\d+)>$/);
      if (m) { addUnique(m[1]); continue; }
      if (/^\d+$/.test(a)) { addUnique(a); continue; }
      // Treat as raw name token (slash can also pass names)
      addUnique(a);
    }
    if (!targets.length) {
      return error(message, message.guild, "Please provide at least one valid target (mention, ID, or name).");
    }
    return runMulti(message, message.guild, message.author, type, action, targets);
  },
};

function runMulti(ctx, guild, user, type, action, rawTargets) {
  const data = getGuild(guild.id);

  // Resolve each target to a valid ID where possible (names -> IDs via cache)
  const resolved = [];
  for (const t of rawTargets) {
    let m = t.match(/^<@!?(\d+)>$/);
    if (m) { resolved.push(m[1]); continue; }
    m = t.match(/^<@&(\d+)>$/);
    if (m) { resolved.push(m[1]); continue; }
    if (/^\d+$/.test(t)) { resolved.push(t); continue; }
    if (type === "roles") {
      const role = guild.roles.cache.find((r) => r.name.toLowerCase() === t.toLowerCase());
      if (role) { resolved.push(role.id); continue; }
    } else {
      const member = guild.members.cache.find((mem) => mem.user.username.toLowerCase() === t.toLowerCase());
      if (member) { resolved.push(member.id); continue; }
    }
    // Skip unresolved
  }

  if (!resolved.length) {
    return error(ctx, guild, "No valid targets were found. Use IDs, mentions, or exact names.");
  }

  const key = type === "roles" ? "whitelistedRoles" : "whitelistedUsers";
  const label = type === "roles" ? "roles" : "users";
  const list = data.antinuke[key] || [];
  const existing = new Set(list);
  const added = [];
  const removed = [];
  const skipped = [];

  if (action === "add") {
    for (const id of resolved) {
      if (existing.has(id)) { skipped.push(id); continue; }
      existing.add(id);
      added.push(id);
    }
  } else {
    for (const id of resolved) {
      if (!existing.has(id)) { skipped.push(id); continue; }
      existing.delete(id);
      removed.push(id);
    }
  }

  updateGuild(guild.id, (d) => { d.antinuke[key] = Array.from(existing); });

  const changed = action === "add" ? added.length : removed.length;
  addAudit(
    guild.id,
    `Multi-Whitelist ${action === "add" ? "Add" : "Remove"}`,
    user.tag,
    `${action === "add" ? "Added" : "Removed"} ${changed} ${label}${skipped.length ? ` (skipped ${skipped.length})` : ""}`,
    "info"
  );

  const verb = action === "add" ? "added to" : "removed from";
  const skipNote = skipped.length ? ` Skipped **${skipped.length}** (already ${action === "add" ? "whitelisted" : "not whitelisted"}).` : "";
  return success(
    ctx,
    guild,
    `**${changed}** ${label} ${verb} the antinuke whitelist.${skipNote} Total whitelisted ${label}: **${existing.size}**.`
  );
}
