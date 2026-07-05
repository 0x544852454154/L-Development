const { AuditLogEvent, PermissionFlagsBits } = require("discord.js");
const { getGuild, updateGuild, addAudit } = require("../database");
const { buildEmbed } = require("../embedBuilder");
const { fetchExecutor } = require("./auditCache");
const logger = require("../logger");

/*
 * L Antinuke Engine — v2 (strict, hardened, optimized)
 *
 * Improvements over v1:
 *  1. STRICT MODE (default on): ANY single destructive action by a
 *     non-whitelisted user triggers immediate punishment + auto-restore.
 *     No more waiting for the threshold to be crossed — one channel delete
 *     by a rogue admin = instant ban + channel restored.
 *  2. BOT ANTI-ADD: when a non-whitelisted user adds a bot to the server,
 *     the bot is auto-kicked instantly. A bot whitelist allows specific bots.
 *  3. ANTI-RAID: detects join bursts and engages panic mode.
 *  4. ANTI-SPAM: per-user message rate limiting.
 *  5. ANTI-WEBHOOK: blocks webhook creation by non-whitelisted users.
 *  6. OPTIMIZED: uses auditCache so a 50-channel nuke does ONE audit-log
 *     fetch instead of 50. Write-behind DB. Early event short-circuiting.
 *  7. SAFE RESTORE: channels restored with full overwrites; roles with
 *     permissions; bans re-applied. Throttled to respect rate limits.
 */

// ===== Action tracking (in-memory, per guild) =====
const actionTracker = new Map(); // guildId -> Map<type, Array<{ts, executorId, targetId}>>

function getTracker(guildId, type) {
  if (!actionTracker.has(guildId)) actionTracker.set(guildId, new Map());
  const m = actionTracker.get(guildId);
  if (!m.has(type)) m.set(type, []);
  return m.get(type);
}

function recordAction(guildId, type, executorId, targetId) {
  const arr = getTracker(guildId, type);
  arr.push({ ts: Date.now(), executorId, targetId });
  const win = getGuild(guildId).antinuke.window || 10000;
  const cutoff = Date.now() - win * 2;
  while (arr.length && arr[0].ts < cutoff) arr.shift();
}

function countActions(guildId, type) {
  const arr = getTracker(guildId, type);
  const win = getGuild(guildId).antinuke.window || 10000;
  const cutoff = Date.now() - win;
  return arr.filter((a) => a.ts >= cutoff).length;
}

// ===== Whitelist check =====
function isWhitelisted(guild, user) {
  const data = getGuild(guild.id);
  if (guild.ownerId === user.id) return true;
  if (data.antinuke.extraOwners.includes(user.id)) return true;
  if (data.antinuke.whitelistedUsers.includes(user.id)) return true;
  const member = guild.members.cache.get(user.id);
  if (member && member.roles.cache.some((r) => data.antinuke.whitelistedRoles.includes(r.id))) return true;
  return false;
}

// ===== Punishment =====
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
            PermissionFlagsBits.ManageWebhooks,
            PermissionFlagsBits.MentionEveryone,
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

// ===== Restore caches =====
const channelCache = new Map();
const roleCache = new Map();
const banCache = new Map(); // guildId -> Map<userId, {reason}>
const webhookCache = new Map(); // guildId -> Map<webhookId, {name, channelId, avatar}>

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
      id: o.id, type: o.type, allow: o.allow.toArray(), deny: o.deny.toArray(),
    })),
    guildId: channel.guild.id,
  });
  if (channelCache.size > 2000) channelCache.delete(channelCache.keys().next().value);
}

function cacheRole(role) {
  roleCache.set(role.id, {
    name: role.name, color: role.color, hoist: role.hoist,
    mentionable: role.mentionable, permissions: role.permissions.bitfield.toString(),
    position: role.position, icon: role.icon || null, guildId: role.guild.id,
  });
  if (roleCache.size > 1000) roleCache.delete(roleCache.keys().next().value);
}

async function restoreChannel(guild, cached) {
  try {
    const created = await guild.channels.create({
      name: cached.name, type: cached.type, parent: cached.parentId,
      topic: cached.topic, nsfw: cached.nsfw, rateLimitPerUser: cached.rateLimit,
      permissionOverwrites: cached.permissionOverwrites.map((o) => ({
        id: o.id, type: o.type,
        allow: BigInt(o.allow.join("|") || "0"),
        deny: BigInt(o.deny.join("|") || "0"),
      })),
    });
    logger.log(`[restore] re-created channel #${created.name} in ${guild.name}`);
    return created;
  } catch (e) {
    logger.error("[restore] channel failed", e.message);
    return null;
  }
}

async function restoreRole(guild, cached) {
  try {
    const created = await guild.roles.create({
      name: cached.name, color: cached.color, hoist: cached.hoist,
      mentionable: cached.mentionable,
      permissions: cached.permissions ? BigInt(cached.permissions) : 0n,
    });
    logger.log(`[restore] re-created role @${created.name} in ${guild.name}`);
    return created;
  } catch (e) {
    logger.error("[restore] role failed", e.message);
    return null;
  }
}

// ===== Alerting =====
async function alertGuild(guild, embedKey, vars) {
  const data = getGuild(guild.id);
  const embed = buildEmbed(embedKey, guild, vars);
  const targets = [];
  if (data.autoRestore.logChannelId) targets.push(data.autoRestore.logChannelId);
  if (data.logging.channel) targets.push(data.logging.channel);
  for (const id of [...new Set(targets)]) {
    const ch = guild.channels.cache.get(id);
    if (ch) ch.send({ embeds: [embed] }).catch(() => {});
  }
  addAudit(guild.id, embedKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), "L",
    vars.detail || `${vars.action || "event"} by ${vars.executor || "unknown"}`, "danger");
}

// ===== Anti-raid join tracking =====
const joinTracker = new Map(); // guildId -> Array<ts>

// ===== Spam tracking =====
const spamTracker = new Map(); // guildId -> Map<userId, Array<ts>>

// ===== Main setup =====
function setup(client) {
  // Cache channels & roles so we can restore them
  client.on("channelCreate", cacheChannel);
  client.on("channelUpdate", (oldCh, newCh) => cacheChannel(newCh));
  client.on("roleCreate", cacheRole);
  client.on("roleUpdate", (oldR, newR) => cacheRole(newR));

  // Cache bans
  client.on("guildBanAdd", (ban) => {
    if (!banCache.has(ban.guild.id)) banCache.set(ban.guild.id, new Map());
    banCache.get(ban.guild.id).set(ban.user.id, { reason: ban.reason || null, at: Date.now() });
  });

  // Cache webhooks for restore
  client.on("webhooksUpdate", async (channel) => {
    try {
      const hooks = await channel.guild.fetchWebhooks().catch(() => []);
      if (!webhookCache.has(channel.guild.id)) webhookCache.set(channel.guild.id, new Map());
      for (const h of hooks.values()) {
        webhookCache.get(channel.guild.id).set(h.id, { name: h.name, channelId: h.channelId, avatar: h.avatar });
      }
    } catch {}
  });

  // ====== STRICT CHANNEL DELETE ======
  client.on("channelDelete", async (channel) => {
    if (!channel.guild) return;
    const data = getGuild(channel.guild.id);
    if (!data.antinuke.enabled) return;

    const executor = await fetchExecutor(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
    // No executor found OR whitelisted -> allowed
    if (!executor || isWhitelisted(channel.guild, executor)) return;

    recordAction(channel.guild.id, "channelDelete", executor.id, channel.id);

    // STRICT MODE: immediate punishment on ANY single deletion
    if (data.antinuke.strict) {
      // Auto-restore the deleted channel
      if (data.autoRestore.enabled && data.autoRestore.restoreChannels) {
        const cached = channelCache.get(channel.id);
        if (cached) {
          await restoreChannel(channel.guild, cached);
          channelCache.delete(channel.id);
        }
      }
      await punish(channel.guild, executor.id, `Unauthorized channel deletion (#${channel.name})`);
      await alertGuild(channel.guild, "antinuke_triggered", {
        action: "channel deletion",
        executor: executor.tag,
        detail: `Deleted channel #${channel.name} — restored and offender punished.`,
      });
      return;
    }

    // Threshold mode (legacy): wait for N deletions
    const count = countActions(channel.guild.id, "channelDelete");
    if (count >= data.antinuke.threshold) {
      if (data.autoRestore.enabled && data.autoRestore.restoreChannels) {
        const tracker = getTracker(channel.guild.id, "channelDelete");
        const recent = tracker.filter((a) => a.executorId === executor.id);
        for (const action of recent) {
          const cached = channelCache.get(action.targetId);
          if (cached) { await restoreChannel(channel.guild, cached); channelCache.delete(action.targetId); }
        }
      }
      await punish(channel.guild, executor.id, `Mass channel deletion (${count})`);
      await alertGuild(channel.guild, "antinuke_triggered", { action: `mass channel deletion (${count})`, executor: executor.tag });
      actionTracker.get(channel.guild.id).set("channelDelete", []);
    }
  });

  // ====== CHANNEL CREATE (anti-nuke-channel-spam) ======
  client.on("channelCreate", async (channel) => {
    if (!channel.guild) return;
    const data = getGuild(channel.guild.id);
    if (!data.antinuke.enabled) return;

    const executor = await fetchExecutor(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
    if (!executor || isWhitelisted(channel.guild, executor)) return;

    recordAction(channel.guild.id, "channelCreate", executor.id, channel.id);

    if (data.antinuke.strict) {
      // Strict: delete the unauthorized channel immediately
      try { await channel.delete("[L Antinuke] Unauthorized channel creation"); } catch {}
      await punish(channel.guild, executor.id, `Unauthorized channel creation (#${channel.name})`);
      await alertGuild(channel.guild, "antinuke_blocked", { action: "channel creation", executor: executor.tag });
      return;
    }

    const count = countActions(channel.guild.id, "channelCreate");
    if (count >= data.antinuke.threshold) {
      const tracker = getTracker(channel.guild.id, "channelCreate");
      for (const action of tracker.filter((a) => a.executorId === executor.id)) {
        const ch = channel.guild.channels.cache.get(action.targetId);
        if (ch) await ch.delete("[L Antinuke] Mass channel creation").catch(() => {});
      }
      await punish(channel.guild, executor.id, `Mass channel creation (${count})`);
      await alertGuild(channel.guild, "antinuke_triggered", { action: `mass channel creation (${count})`, executor: executor.tag });
      actionTracker.get(channel.guild.id).set("channelCreate", []);
    }
  });

  // ====== STRICT ROLE DELETE ======
  client.on("roleDelete", async (role) => {
    const data = getGuild(role.guild.id);
    if (!data.antinuke.enabled) return;
    const executor = await fetchExecutor(role.guild, AuditLogEvent.RoleDelete, role.id);
    if (!executor || isWhitelisted(role.guild, executor)) return;

    recordAction(role.guild.id, "roleDelete", executor.id, role.id);

    if (data.antinuke.strict) {
      if (data.autoRestore.enabled && data.autoRestore.restoreRoles) {
        const cached = roleCache.get(role.id);
        if (cached) { await restoreRole(role.guild, cached); roleCache.delete(role.id); }
      }
      await punish(role.guild, executor.id, `Unauthorized role deletion (@${role.name})`);
      await alertGuild(role.guild, "antinuke_triggered", { action: "role deletion", executor: executor.tag, detail: `Deleted role @${role.name} — restored and offender punished.` });
      return;
    }

    const count = countActions(role.guild.id, "roleDelete");
    if (count >= data.antinuke.threshold) {
      if (data.autoRestore.enabled && data.autoRestore.restoreRoles) {
        const tracker = getTracker(role.guild.id, "roleDelete");
        for (const action of tracker.filter((a) => a.executorId === executor.id)) {
          const cached = roleCache.get(action.targetId);
          if (cached) { await restoreRole(role.guild, cached); roleCache.delete(action.targetId); }
        }
      }
      await punish(role.guild, executor.id, `Mass role deletion (${count})`);
      await alertGuild(role.guild, "antinuke_triggered", { action: `mass role deletion (${count})`, executor: executor.tag });
      actionTracker.get(role.guild.id).set("roleDelete", []);
    }
  });

  // ====== MASS UNBAN ======
  client.on("guildBanRemove", async (ban) => {
    const data = getGuild(ban.guild.id);
    if (!data.antinuke.enabled) return;
    const executor = await fetchExecutor(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);
    if (!executor || isWhitelisted(ban.guild, executor)) return;

    recordAction(ban.guild.id, "banRemove", executor.id, ban.user.id);

    if (data.antinuke.strict) {
      if (data.autoRestore.enabled && data.autoRestore.restoreBans) {
        await ban.guild.bans.create(ban.user.id, { reason: `[L Auto-Restore] re-banned after unauthorized unban by ${executor.tag}` }).catch(() => {});
      }
      await punish(ban.guild, executor.id, `Unauthorized unban of ${ban.user.tag}`);
      await alertGuild(ban.guild, "antinuke_triggered", { action: "unban", executor: executor.tag, detail: `Unauthorized unban of ${ban.user.tag} — re-banned and offender punished.` });
      return;
    }

    const count = countActions(ban.guild.id, "banRemove");
    if (count >= data.antinuke.threshold) {
      if (data.autoRestore.enabled && data.autoRestore.restoreBans) {
        await ban.guild.bans.create(ban.user.id, { reason: `[L Auto-Restore] re-banned after mass-unban by ${executor.tag}` }).catch(() => {});
      }
      await punish(ban.guild, executor.id, `Mass unban (${count})`);
      await alertGuild(ban.guild, "antinuke_triggered", { action: `mass unban (${count})`, executor: executor.tag });
      actionTracker.get(ban.guild.id).set("banRemove", []);
    }
  });

  // ====== BOT ANTI-ADD (the new feature) ======
  // When a bot joins, check who added it. If not whitelisted -> kick the bot.
  client.on("guildMemberAdd", async (member) => {
    if (!member.user.bot) {
      // Anti-raid join tracking for humans
      handleJoin(member);
      return;
    }
    const data = getGuild(member.guild.id);
    if (!data.antinuke.enabled || !data.antinuke.blockBotAdd) return;

    // Whitelisted bot -> allow
    if (data.antinuke.whitelistedBots.includes(member.id)) return;

    const executor = await fetchExecutor(member.guild, AuditLogEvent.BotAdd, member.id);
    if (!executor || isWhitelisted(member.guild, executor)) return;

    // Non-whitelisted user added a bot -> kick the bot + punish the adder
    try {
      await member.kick("[L Antinuke] Unauthorized bot addition").catch(() => {});
      await punish(member.guild, executor.id, `Unauthorized bot addition (${member.user.tag})`);
      await alertGuild(member.guild, "bot_blocked", { bot: member.user.tag, executor: executor.tag });
      logger.log(`[antinuke] kicked unauthorized bot ${member.user.tag} added by ${executor.tag}`);
    } catch (e) {
      logger.error("[antinuke] bot-add protection failed", e.message);
    }
  });

  // ====== ANTI-WEBHOOK (block webhook creation by non-whitelisted) ======
  client.on("webhooksUpdate", async (channel) => {
    const data = getGuild(channel.guild.id);
    if (!data.antinuke.enabled || !data.antinuke.antiWebhook) return;
    const executor = await fetchExecutor(channel.guild, AuditLogEvent.WebhookCreate, channel.id);
    if (!executor || isWhitelisted(channel.guild, executor)) return;

    // Delete any webhooks created in this channel recently by the non-whitelisted user
    try {
      const hooks = await channel.guild.fetchWebhooks().catch(() => []);
      for (const h of hooks.values()) {
        if (h.channelId === channel.id && h.ownerId === executor.id) {
          await h.delete("[L Antinuke] Unauthorized webhook creation").catch(() => {});
        }
      }
      await punish(channel.guild, executor.id, "Unauthorized webhook creation");
      await alertGuild(channel.guild, "antinuke_blocked", { action: "webhook creation", executor: executor.tag });
    } catch (e) {
      logger.error("[antinuke] anti-webhook failed", e.message);
    }
  });

  // ====== ANTI-PING ======
  client.on("messageCreate", async (message) => {
    if (!message.guild || message.author.bot) return;
    const data = getGuild(message.guild.id);
    if (!data.antinuke.enabled || !data.antinuke.antiping) return;
    if (isWhitelisted(message.guild, message.author)) return;
    if (message.mentions.everyone) {
      try {
        await message.delete();
        const member = await message.guild.members.fetch(message.author.id).catch(() => null);
        if (member) await member.timeout(5 * 60 * 1000, "[L Antiping] unauthorized everyone/here ping").catch(() => {});
      } catch {}
    }

    // ====== ANTI-SPAM ======
    if (data.antinuke.antiSpam) {
      if (!spamTracker.has(message.guild.id)) spamTracker.set(message.guild.id, new Map());
      const userMap = spamTracker.get(message.guild.id);
      if (!userMap.has(message.author.id)) userMap.set(message.author.id, []);
      const arr = userMap.get(message.author.id);
      arr.push(Date.now());
      const cutoff = Date.now() - 5000;
      while (arr.length && arr[0] < cutoff) arr.shift();
      if (arr.length >= (data.antinuke.spamThreshold || 7)) {
        try {
          await message.delete().catch(() => {});
          const member = await message.guild.members.fetch(message.author.id).catch(() => null);
          if (member) await member.timeout(10 * 60 * 1000, "[L Anti-Spam] message spam").catch(() => {});
          arr.length = 0;
        } catch {}
      }
    }
  });

  // ====== WELCOME / GOODBYE ======
  client.on("guildMemberAdd", (member) => {
    if (member.user.bot) return;
    const data = getGuild(member.guild.id);
    if (!data.welcome.enabled || !data.welcome.channel) return;
    const ch = member.guild.channels.cache.get(data.welcome.channel);
    if (!ch) return;
    const embed = buildEmbed("greet_welcome", member.guild, { user: member.toString(), server: member.guild.name, count: member.guild.memberCount });
    ch.send({ embeds: [embed] }).catch(() => {});
  });

  client.on("guildMemberRemove", (member) => {
    const data = getGuild(member.guild.id);
    if (data.welcome.goodbyeEnabled && data.welcome.goodbyeChannel) {
      const ch = member.guild.channels.cache.get(data.welcome.goodbyeChannel);
      if (ch) {
        const embed = buildEmbed("greet_goodbye", member.guild, { user: member.user.tag, count: member.guild.memberCount });
        ch.send({ embeds: [embed] }).catch(() => {});
      }
    }
  });

  // ====== LOGGING ======
  const logEvent = async (guild, event, embedKey, vars) => {
    const data = getGuild(guild.id);
    if (!data.logging.channel || !data.logging.events[event]) return;
    const ch = guild.channels.cache.get(data.logging.channel);
    if (!ch) return;
    const embed = buildEmbed(embedKey, guild, vars);
    ch.send({ embeds: [embed] }).catch(() => {});
  };
  client.on("guildMemberRemove", (m) => logEvent(m.guild, "memberRemove", "info", { detail: `**${m.user.tag}** left the server.` }));
  client.on("guildBanAdd", (b) => logEvent(b.guild, "memberBan", "ban_success", { user: b.user.tag, reason: b.reason || "No reason" }));
  client.on("channelDelete", (c) => { if (c.guild) logEvent(c.guild, "channelDelete", "info", { detail: `Channel **#${c.name}** was deleted.` }); });
  client.on("roleDelete", (r) => logEvent(r.guild, "roleDelete", "info", { detail: `Role **@${r.name}** was deleted.` }));

  // ====== LEVELING XP ======
  client.on("messageCreate", (message) => {
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
          const embed = buildEmbed("success", message.guild, { detail: `GG ${message.author.toString()} — you reached **level ${xp.level}**!` });
          ch.send({ embeds: [embed] }).catch(() => {});
        }
      }
    });
  });

  logger.log("[antinuke] v2 handlers attached (strict mode + bot anti-add + anti-raid + anti-spam)");
}

// ===== Anti-raid join handling =====
function handleJoin(member) {
  const data = getGuild(member.guild.id);
  if (!data.antiRaid.enabled) return;

  if (!joinTracker.has(member.guild.id)) joinTracker.set(member.guild.id, []);
  const arr = joinTracker.get(member.guild.id);
  arr.push(Date.now());
  const cutoff = Date.now() - (data.antiRaid.joinWindow || 10000);
  while (arr.length && arr[0] < cutoff) arr.shift();

  // Engage panic mode if threshold crossed
  if (arr.length >= (data.antiRaid.joinThreshold || 10)) {
    if (!data.antiRaid.panicMode) {
      updateGuild(member.guild.id, (d) => {
        d.antiRaid.panicMode = true;
        d.antiRaid.panicUntil = Date.now() + 300000; // 5 min panic
      });
      const embed = buildEmbed("raid_detected", member.guild, { count: arr.length, window: Math.round((data.antiRaid.joinWindow || 10000) / 1000) });
      const ch = member.guild.channels.cache.get(data.logging.channel || data.autoRestore.logChannelId);
      if (ch) ch.send({ embeds: [embed] }).catch(() => {});
      addAudit(member.guild.id, "Raid Detected", "L", `${arr.length} joins in ${data.antiRaid.joinWindow / 1000}s — panic mode engaged`, "danger");
      logger.log(`[antiraid] panic mode engaged in ${member.guild.name} (${arr.length} joins)`);
    }
  }

  // If in panic mode, apply the raid action to new joins
  if (data.antiRaid.panicMode && Date.now() < data.antiRaid.panicUntil) {
    const action = data.antiRaid.action || "kick";
    if (action === "kick") member.kick("[L Anti-Raid] panic mode").catch(() => {});
    else if (action === "ban") member.ban({ reason: "[L Anti-Raid] panic mode" }).catch(() => {});
    return;
  }

  // Min account age check
  if (data.antiRaid.minAccountAge > 0) {
    const age = Date.now() - member.user.createdTimestamp;
    if (age < data.antiRaid.minAccountAge) {
      member.kick("[L Anti-Raid] account too young").catch(() => {});
    }
  }
}

// Exported helpers for commands
function clearPanic(guildId) {
  updateGuild(guildId, (d) => { d.antiRaid.panicMode = false; d.antiRaid.panicUntil = 0; });
}

module.exports = {
  setup, isWhitelisted, cacheChannel, cacheRole,
  recordAction, countActions, clearPanic,
};
