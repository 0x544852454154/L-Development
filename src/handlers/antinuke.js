const { AuditLogEvent, PermissionFlagsBits, ChannelType } = require("discord.js");
const { getGuild, updateGuild, addAudit } = require("../database");
const { buildEmbed } = require("../embedBuilder");
const logger = require("../logger");

// Tracks recent destructive actions per guild for threshold detection.
// Map<guildId, Map<eventType, Array<{ ts, executorId, targetId }>>>
const actionTracker = new Map();

function getTracker(guildId, type) {
  if (!actionTracker.has(guildId)) actionTracker.set(guildId, new Map());
  const m = actionTracker.get(guildId);
  if (!m.has(type)) m.set(type, []);
  return m.get(type);
}

function recordAction(guildId, type, executorId, targetId) {
  const arr = getTracker(guildId, type);
  arr.push({ ts: Date.now(), executorId, targetId });
  // prune old entries beyond 2x window
  const data = getGuild(guildId);
  const window = data.antinuke.window || 10000;
  const cutoff = Date.now() - window * 2;
  while (arr.length && arr[0].ts < cutoff) arr.shift();
}

function countActions(guildId, type) {
  const arr = getTracker(guildId, type);
  const data = getGuild(guildId);
  const window = data.antinuke.window || 10000;
  const cutoff = Date.now() - window;
  return arr.filter((a) => a.ts >= cutoff).length;
}

// Check if a user is whitelisted from antinuke
function isWhitelisted(guild, user) {
  const data = getGuild(guild.id);
  if (data.antinuke.extraOwners.includes(user.id)) return true;
  if (data.antinuke.whitelistedUsers.includes(user.id)) return true;
  const member = guild.members.cache.get(user.id);
  if (member && member.roles.cache.some((r) => data.antinuke.whitelistedRoles.includes(r.id))) return true;
  if (guild.ownerId === user.id) return true;
  return false;
}

// Fetch the executor of a destructive action from the audit log
async function fetchExecutor(guild, eventType, targetId) {
  try {
    const logs = await guild.fetchAuditLogs({ limit: 5, type: eventType });
    const entry = logs.entries.find((e) => e.targetId === targetId || e.target?.id === targetId);
    return entry?.executor || null;
  } catch {
    return null;
  }
}

// Punish the user who triggered the antinuke
async function punish(guild, userId, reason) {
  const data = getGuild(guild.id);
  const punishment = data.antinuke.punishment || "ban";
  try {
    if (punishment === "ban") {
      await guild.bans.create(userId, { reason: `[L Antinuke] ${reason}` }).catch(() => {});
    } else if (punishment === "kick") {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (member) await member.kick(`[L Antinuke] ${reason}`).catch(() => {});
    } else if (punishment === "strip") {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (member) {
        const dangerous = member.roles.cache.filter((r) =>
          r.permissions.has([
            PermissionFlagsBits.Administrator,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ManageRoles,
            PermissionFlagsBits.BanMembers,
            PermissionFlagsBits.KickMembers,
            PermissionFlagsBits.ManageGuild,
          ])
        );
        for (const role of dangerous.values()) {
          await member.roles.remove(role, `[L Antinuke] ${reason}`).catch(() => {});
        }
      }
    }
  } catch (e) {
    logger.error("punish failed", e.message);
  }
}

// Send the "nuke detected" embed + log it
async function alertNuke(guild, type, count, executor) {
  const data = getGuild(guild.id);
  const embed = buildEmbed("antinuke_triggered", guild, {
    detail: `${type} detected: ${count} actions by ${executor?.tag || "unknown"}`,
  });
  // Send to auto-restore log channel if configured
  if (data.autoRestore.logChannelId) {
    const ch = guild.channels.cache.get(data.autoRestore.logChannelId);
    if (ch) ch.send({ embeds: [embed] }).catch(() => {});
  }
  addAudit(guild.id, "Auto-Restore Triggered", "L", `Reverted ${count} ${type} by ${executor?.tag || "unknown"}`, "danger");
}

// ====== Auto-restore handlers ======

// Cache of recently seen channels/roles so we can restore them after deletion.
const channelCache = new Map(); // channelId -> { name, type, parentId, topic, permissionOverwrites, position }
const roleCache = new Map(); // roleId -> { name, color, hoist, permissions, mentionable, position }
const banCache = new Map(); // guildId -> Map<userId, { reason }>

function cacheChannel(channel) {
  if (!channel.guild) return;
  channelCache.set(channel.id, {
    name: channel.name,
    type: channel.type,
    parentId: channel.parentId,
    topic: channel.topic || null,
    position: channel.position,
    nsfw: channel.nsfw || false,
    rateLimit: channel.rateLimitPerUser || 0,
    permissionOverwrites: channel.permissionOverwrites.cache.map((o) => ({
      id: o.id,
      type: o.type,
      allow: o.allow.toArray(),
      deny: o.deny.toArray(),
    })),
    guildId: channel.guild.id,
  });
  // prune old entries
  if (channelCache.size > 500) {
    const oldest = channelCache.keys().next().value;
    channelCache.delete(oldest);
  }
}

function cacheRole(role) {
  roleCache.set(role.id, {
    name: role.name,
    color: role.color,
    hoist: role.hoist,
    mentionable: role.mentionable,
    permissions: role.permissions.bitfield.toString(),
    position: role.position,
    icon: role.icon || null,
    guildId: role.guild.id,
  });
  if (roleCache.size > 500) {
    const oldest = roleCache.keys().next().value;
    roleCache.delete(oldest);
  }
}

async function restoreChannel(guild, cached) {
  try {
    const created = await guild.channels.create({
      name: cached.name,
      type: cached.type,
      parent: cached.parentId,
      topic: cached.topic,
      nsfw: cached.nsfw,
      rateLimitPerUser: cached.rateLimit,
      permissionOverwrites: cached.permissionOverwrites.map((o) => ({
        id: o.id,
        type: o.type,
        allow: BigInt(o.allow.join("|") || "0"),
        deny: BigInt(o.deny.join("|") || "0"),
      })),
    });
    logger.log(`[auto-restore] re-created channel #${created.name} in ${guild.name}`);
    return created;
  } catch (e) {
    logger.error("[auto-restore] channel restore failed", e.message);
    return null;
  }
}

async function restoreRole(guild, cached) {
  try {
    const created = await guild.roles.create({
      name: cached.name,
      color: cached.color,
      hoist: cached.hoist,
      mentionable: cached.mentionable,
      permissions: BigInt(cached.permissions || "0"),
    });
    logger.log(`[auto-restore] re-created role @${created.name} in ${guild.name}`);
    return created;
  } catch (e) {
    logger.error("[auto-restore] role restore failed", e.message);
    return null;
  }
}

// ====== Main event wiring ======

function setup(client) {
  // Cache channels & roles on join / on ready so we can restore them
  client.on("channelCreate", cacheChannel);
  client.on("channelUpdate", (oldCh, newCh) => cacheChannel(newCh));
  client.on("roleCreate", cacheRole);
  client.on("roleUpdate", (oldR, newR) => cacheRole(newR));

  // Cache bans so we can re-ban after a mass-unban
  client.on("guildBanAdd", (ban) => {
    if (!banCache.has(ban.guild.id)) banCache.set(ban.guild.id, new Map());
    banCache.get(ban.guild.id).set(ban.user.id, { reason: ban.reason || null, at: Date.now() });
  });

  client.on("guildMemberAdd", async (member) => {
    // anti-alt check (premium) — handled in commands/premium/antialt.js listener registration
  });

  // ===== Channel deletion =====
  client.on("channelDelete", async (channel) => {
    if (!channel.guild) return;
    const data = getGuild(channel.guild.id);
    if (!data.antinuke.enabled) return;
    const executor = await fetchExecutor(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
    if (!executor || isWhitelisted(channel.guild, executor)) return;

    recordAction(channel.guild.id, "channelDelete", executor.id, channel.id);
    const count = countActions(channel.guild.id, "channelDelete");

    if (count >= data.antinuke.threshold) {
      // Auto-restore
      if (data.autoRestore.enabled && data.autoRestore.restoreChannels) {
        const cached = channelCache.get(channel.id);
        if (cached) {
          await restoreChannel(channel.guild, cached);
          channelCache.delete(channel.id);
        }
      }
      await punish(channel.guild, executor.id, `Mass channel deletion (${count} channels)`);
      await alertNuke(channel.guild, "channel deletions", count, executor);
      // Clear the tracker
      actionTracker.get(channel.guild.id).set("channelDelete", []);
    }
  });

  // ===== Role deletion =====
  client.on("roleDelete", async (role) => {
    const data = getGuild(role.guild.id);
    if (!data.antinuke.enabled) return;
    const executor = await fetchExecutor(role.guild, AuditLogEvent.RoleDelete, role.id);
    if (!executor || isWhitelisted(role.guild, executor)) return;

    recordAction(role.guild.id, "roleDelete", executor.id, role.id);
    const count = countActions(role.guild.id, "roleDelete");

    if (count >= data.antinuke.threshold) {
      if (data.autoRestore.enabled && data.autoRestore.restoreRoles) {
        const cached = roleCache.get(role.id);
        if (cached) {
          await restoreRole(role.guild, cached);
          roleCache.delete(role.id);
        }
      }
      await punish(role.guild, executor.id, `Mass role deletion (${count} roles)`);
      await alertNuke(role.guild, "role deletions", count, executor);
      actionTracker.get(role.guild.id).set("roleDelete", []);
    }
  });

  // ===== Mass unban =====
  client.on("guildBanRemove", async (ban) => {
    const data = getGuild(ban.guild.id);
    if (!data.antinuke.enabled) return;
    const executor = await fetchExecutor(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);
    if (!executor || isWhitelisted(ban.guild, executor)) return;

    recordAction(ban.guild.id, "banRemove", executor.id, ban.user.id);
    const count = countActions(ban.guild.id, "banRemove");

    if (count >= data.antinuke.threshold) {
      if (data.autoRestore.enabled && data.autoRestore.restoreBans) {
        const cached = banCache.get(ban.guild.id)?.get(ban.user.id);
        await ban.guild.bans
          .create(ban.user.id, { reason: `[L Auto-Restore] re-banned after mass-unban by ${executor.tag}` })
          .catch(() => {});
        if (cached) banCache.get(ban.guild.id).delete(ban.user.id);
      }
      await punish(ban.guild, executor.id, `Mass unban (${count} bans removed)`);
      await alertNuke(ban.guild, "mass unbans", count, executor);
      actionTracker.get(ban.guild.id).set("banRemove", []);
    }
  });

  // ===== Webhook deletion (nukehooks) =====
  client.on("webhooksUpdate", async (channel) => {
    const data = getGuild(channel.guild.id);
    if (!data.antinuke.enabled || !data.antinuke.nukehooks) return;
    const executor = await fetchExecutor(channel.guild, AuditLogEvent.WebhookDelete, channel.id);
    if (!executor || isWhitelisted(channel.guild, executor)) return;
    recordAction(channel.guild.id, "webhookDelete", executor.id, channel.id);
    const count = countActions(channel.guild.id, "webhookDelete");
    if (count >= data.antinuke.threshold) {
      await punish(channel.guild, executor.id, `Mass webhook deletion (${count})`);
      await alertNuke(channel.guild, "webhook deletions", count, executor);
      actionTracker.get(channel.guild.id).set("webhookDelete", []);
    }
  });

  // ===== Anti-ping (everyone/here pings from non-whitelisted) =====
  client.on("messageCreate", async (message) => {
    if (!message.guild || message.author.bot) return;
    const data = getGuild(message.guild.id);
    if (!data.antinuke.enabled || !data.antinuke.antiping) return;
    if (isWhitelisted(message.guild, message.author)) return;
    if (message.mentions.everyone) {
      try {
        await message.delete();
        const member = await message.guild.members.fetch(message.author.id).catch(() => null);
        if (member) await member.timeout(5 * 60 * 1000, "[L Antiping] unauthorised everyone/here ping").catch(() => {});
      } catch {}
    }
  });

  // ===== Welcome / goodbye =====
  client.on("guildMemberAdd", async (member) => {
    const data = getGuild(member.guild.id);
    if (!data.welcome.enabled || !data.welcome.channel) return;
    const ch = member.guild.channels.cache.get(data.welcome.channel);
    if (!ch) return;
    const embed = buildEmbed("greet_welcome", member.guild, {
      user: member.toString(),
      server: member.guild.name,
      count: member.guild.memberCount,
    });
    ch.send({ embeds: [embed] }).catch(() => {});
  });

  client.on("guildMemberRemove", async (member) => {
    const data = getGuild(member.guild.id);
    if (!data.welcome.goodbyeEnabled || !data.welcome.goodbyeChannel) return;
    const ch = member.guild.channels.cache.get(data.welcome.goodbyeChannel);
    if (!ch) return;
    const embed = buildEmbed("greet_goodbye", member.guild, {
      user: member.user.tag,
      count: member.guild.memberCount,
    });
    ch.send({ embeds: [embed] }).catch(() => {});
  });

  // ===== Logging =====
  const logEvent = async (guild, event, embedKey, vars) => {
    const data = getGuild(guild.id);
    if (!data.logging.channel || !data.logging.events[event]) return;
    const ch = guild.channels.cache.get(data.logging.channel);
    if (!ch) return;
    const embed = buildEmbed(embedKey, guild, vars);
    ch.send({ embeds: [embed] }).catch(() => {});
  };

  client.on("guildMemberRemove", (member) => logEvent(member.guild, "memberRemove", "success", { detail: `**${member.user.tag}** left the server.` }));
  client.on("guildBanAdd", (ban) => logEvent(ban.guild, "memberBan", "ban_success", { user: ban.user.tag, reason: ban.reason || "No reason" }));
  client.on("channelDelete", (ch) => logEvent(ch.guild, "channelDelete", "success", { detail: `Channel **#${ch.name}** was deleted.` }));
  client.on("roleDelete", (r) => logEvent(r.guild, "roleDelete", "success", { detail: `Role **@${r.name}** was deleted.` }));

  // ===== Leveling XP =====
  client.on("messageCreate", async (message) => {
    if (!message.guild || message.author.bot) return;
    const data = getGuild(message.guild.id);
    if (!data.leveling.enabled) return;
    if (data.leveling.ignoreChannels.includes(message.channel.id)) return;
    updateGuild(message.guild.id, (d) => {
      const xp = d.leveling.xp[message.author.id] || { xp: 0, level: 0 };
      const gain = Math.floor(Math.random() * 15) + 10;
      const oldLevel = xp.level;
      xp.xp += gain;
      xp.level = Math.floor(Math.sqrt(xp.xp / 100));
      d.leveling.xp[message.author.id] = xp;
      if (xp.level > oldLevel && d.leveling.channel) {
        const ch = message.guild.channels.cache.get(d.leveling.channel);
        if (ch) {
          const embed = buildEmbed("success", message.guild, {
            detail: `GG ${message.author.toString()} — you reached **level ${xp.level}**!`,
          });
          ch.send({ embeds: [embed] }).catch(() => {});
        }
      }
    });
  });

  logger.log("[antinuke] handlers attached");
}

module.exports = { setup, isWhitelisted, cacheChannel, cacheRole, recordAction, countActions };
