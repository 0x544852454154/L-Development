const { AuditLogEvent, PermissionFlagsBits, ChannelType } = require("discord.js");
const { getGuild, updateGuild, addAudit } = require("../database");
const { buildEmbed } = require("../embedBuilder");
const { fetchExecutor } = require("./auditCache");
const config = require("../config");
const logger = require("../logger");

/*
 * L Antinuke Engine — v3 (maximum security)
 *
 * v3 improvements over v2:
 *  1. WEBHOOK BYPASS FIXED: audit-log lookup now matches webhook ID (not channel ID).
 *     v2 passed channel.id as the audit target — webhook creation targets the webhook,
 *     so the executor was NEVER found. Now we fetch the webhook and match by ID.
 *  2. WEBHOOK USAGE DETECTION: tracks webhook→creator mapping. When a webhook sends
 *     a message (messageCreate with webhookId), if the creator is non-whitelisted →
 *     ban creator + delete webhook + delete message.
 *  3. CHANNEL RENAME → BAN: channelUpdate name change by non-whitelisted = ban + revert.
 *  4. SERVER RENAME → BAN: guildUpdate name change by non-whitelisted = ban + revert.
 *  5. INSTANT-NUKE COUNTER: rapid-burst detection (3+ deletions in 2s) triggers
 *     emergency lockdown — bans executor IMMEDIATELY (before any restore), then
 *     batch-restores all cached channels in parallel (groups of 5 for rate limits).
 *  6. PROACTIVE CACHING: channels/roles cached on ready AND on interval (every 60s).
 */

// ===== Action tracking (in-memory, per guild) =====
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

// ===== Rapid-burst detection (instant-nuke counter) =====
const rapidDeleteTracker = new Map(); // guildId -> Array<ts>
function isRapidBurst(guildId) {
  if (!rapidDeleteTracker.has(guildId)) rapidDeleteTracker.set(guildId, []);
  const arr = rapidDeleteTracker.get(guildId);
  arr.push(Date.now());
  const cutoff = Date.now() - 2000; // 2 second window
  while (arr.length && arr[0] < cutoff) arr.shift();
  return arr.length >= 3; // 3+ deletions in 2s = instant nuke
}

// ===== Dedup sets — prevent double-restore and double-punish =====
// restoreInProgress: guildId -> Set<entityId> — channels/roles being restored
// punishedThisBurst: guildId -> Set<userId> — users already punished in the current burst
// These prevent the race condition where concurrent delete events double-restore
// the same channel (the #1 cause of duplicate channels).
const restoreInProgress = new Map();
const punishedThisBurst = new Map();
function getRestoreSet(guildId) {
  if (!restoreInProgress.has(guildId)) restoreInProgress.set(guildId, new Set());
  return restoreInProgress.get(guildId);
}
function getPunishedSet(guildId) {
  if (!punishedThisBurst.has(guildId)) punishedThisBurst.set(guildId, new Set());
  return punishedThisBurst.get(guildId);
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
  // GUARD: never punish the bot itself or the guild owner
  if (userId === guild.client?.user?.id) {
    logger.warn(`[punish] refused to punish bot itself in ${guild.name}`);
    return;
  }
  if (userId === guild.ownerId) {
    logger.warn(`[punish] refused to punish guild owner in ${guild.name} — use /extraowner remove instead`);
    return;
  }
  const data = getGuild(guild.id);
  const punishment = data.antinuke.punishment || "ban";
  try {
    // Check role hierarchy — can the bot actually ban/kick this user?
    const target = await guild.members.fetch(userId).catch(() => null);
    const me = guild.members.me;
    if (target && me && target.roles.highest.position >= me.roles.highest.position) {
      logger.warn(`[punish] cannot punish ${target.user.tag} — role hierarchy (target is higher or equal to bot)`);
      // Fall back to stripping dangerous roles if possible, otherwise just log
      return;
    }
    if (punishment === "ban") {
      await guild.bans.create(userId, { reason: `[L Antinuke] ${reason}` }).catch(() => {});
    } else if (punishment === "kick") {
      if (target) await target.kick(`[L Antinuke] ${reason}`).catch(() => {});
    } else if (punishment === "strip") {
      if (target) {
        const dangerous = target.roles.cache.filter((r) =>
          r.permissions.has([
            PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ManageRoles, PermissionFlagsBits.BanMembers,
            PermissionFlagsBits.KickMembers, PermissionFlagsBits.ManageGuild,
            PermissionFlagsBits.ManageWebhooks, PermissionFlagsBits.MentionEveryone,
          ])
        );
        for (const role of dangerous.values()) {
          await target.roles.remove(role, `[L Antinuke] ${reason}`).catch(() => {});
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
const banCache = new Map();
// webhookCreatorMap: guildId -> Map<webhookId, creatorUserId>
// Used to trace webhook messages back to the creator for punishment
const webhookCreatorMap = new Map();

function cacheChannel(channel) {
  if (!channel || !channel.guild) return;
  try {
    // permissionOverwrites can be undefined for some channel types (partial,
    // voice, stage, forum) or during cache hydration — guard against it.
    const overwrites = channel.permissionOverwrites?.cache;
    channelCache.set(channel.id, {
      name: channel.name,
      type: channel.type,
      parentId: channel.parentId,
      topic: channel.topic || null,
      position: channel.position,
      nsfw: channel.nsfw || false,
      rateLimit: channel.rateLimitPerUser || 0,
      permissionOverwrites: overwrites
        ? overwrites.map((o) => ({
            id: o.id, type: o.type, allow: o.allow.toArray(), deny: o.deny.toArray(),
          }))
        : [],
      guildId: channel.guild.id,
    });
    if (channelCache.size > 5000) channelCache.delete(channelCache.keys().next().value);
  } catch (e) {
    // Don't let one bad channel crash the bot — skip it
    logger.warn(`[cache] failed to cache channel ${channel.id}: ${e.message}`);
  }
}

function cacheRole(role) {
  if (!role || !role.guild) return;
  try {
    roleCache.set(role.id, {
      name: role.name, color: role.color, hoist: role.hoist, mentionable: role.mentionable,
      permissions: role.permissions?.bitfield?.toString() || "0",
      position: role.position, icon: role.icon || null,
      guildId: role.guild.id,
    });
    if (roleCache.size > 2000) roleCache.delete(roleCache.keys().next().value);
  } catch (e) {
    logger.warn(`[cache] failed to cache role ${role.id}: ${e.message}`);
  }
}

function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function restoreChannel(guild, cached) {
  try {
    // Safely convert permission overwrites — skip any that fail to parse
    const overwrites = (cached.permissionOverwrites || [])
      .map((o) => {
        try {
          return {
            id: o.id, type: o.type,
            allow: BigInt(o.allow.join("|") || "0"),
            deny: BigInt(o.deny.join("|") || "0"),
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    // If the parent category was deleted, don't pass a stale parentId
    const parent = cached.parentId ? guild.channels.cache.get(cached.parentId) : null;

    const created = await guild.channels.create({
      name: cached.name,
      type: cached.type,
      parent: parent ? parent.id : undefined,
      topic: cached.topic || undefined,
      nsfw: cached.nsfw || false,
      rateLimitPerUser: cached.rateLimit || 0,
      permissionOverwrites: overwrites,
    });
    return created;
  } catch (e) {
    logger.error("[restore] channel failed", e.message);
    return null;
  }
}

async function restoreRole(guild, cached) {
  try {
    return await guild.roles.create({
      name: cached.name, color: cached.color, hoist: cached.hoist, mentionable: cached.mentionable,
      permissions: cached.permissions ? BigInt(cached.permissions) : 0n,
    });
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

// ===== Anti-raid =====
const joinTracker = new Map();
const spamTracker = new Map();

function handleJoin(member) {
  const data = getGuild(member.guild.id);
  if (!data.antiRaid.enabled) return;
  if (!joinTracker.has(member.guild.id)) joinTracker.set(member.guild.id, []);
  const arr = joinTracker.get(member.guild.id);
  arr.push(Date.now());
  const cutoff = Date.now() - (data.antiRaid.joinWindow || 10000);
  while (arr.length && arr[0] < cutoff) arr.shift();
  if (arr.length >= (data.antiRaid.joinThreshold || 10)) {
    if (!data.antiRaid.panicMode) {
      updateGuild(member.guild.id, (d) => {
        d.antiRaid.panicMode = true;
        d.antiRaid.panicUntil = Date.now() + 300000;
      });
      const embed = buildEmbed("raid_detected", member.guild, { count: arr.length, window: Math.round((data.antiRaid.joinWindow || 10000) / 1000) });
      const ch = member.guild.channels.cache.get(data.logging.channel || data.autoRestore.logChannelId);
      if (ch) ch.send({ embeds: [embed] }).catch(() => {});
      addAudit(member.guild.id, "Raid Detected", "L", `${arr.length} joins in ${data.antiRaid.joinWindow / 1000}s — panic mode engaged`, "danger");
      logger.log(`[antiraid] panic mode engaged in ${member.guild.name} (${arr.length} joins)`);
    }
  }
  if (data.antiRaid.panicMode && Date.now() < data.antiRaid.panicUntil) {
    const action = data.antiRaid.action || "kick";
    if (action === "kick") member.kick("[L Anti-Raid] panic mode").catch(() => {});
    else if (action === "ban") member.ban({ reason: "[L Anti-Raid] panic mode" }).catch(() => {});
    return;
  }
  if (data.antiRaid.minAccountAge > 0) {
    const age = Date.now() - member.user.createdTimestamp;
    if (age < data.antiRaid.minAccountAge) member.kick("[L Anti-Raid] account too young").catch(() => {});
  }
}

function clearPanic(guildId) {
  updateGuild(guildId, (d) => { d.antiRaid.panicMode = false; d.antiRaid.panicUntil = 0; });
}

// ===== Proactive cache refresh (every 60s) =====
let cacheInterval = null;

// ===== Main setup =====
function setup(client) {
  // --- Cache channels & roles on events ---
  client.on("channelCreate", cacheChannel);
  client.on("channelUpdate", (oldCh, newCh) => cacheChannel(newCh));
  client.on("roleCreate", cacheRole);
  client.on("roleUpdate", (oldR, newR) => cacheRole(newR));

  // --- Cache bans ---
  client.on("guildBanAdd", (ban) => {
    if (!banCache.has(ban.guild.id)) banCache.set(ban.guild.id, new Map());
    banCache.get(ban.guild.id).set(ban.user.id, { reason: ban.reason || null, at: Date.now() });
  });

  // ====== CHANNEL DELETE (deduped — NO duplicate channels) ======
  client.on("channelDelete", async (channel) => {
    if (!channel.guild) return;
    const data = getGuild(channel.guild.id);
    if (!data.antinuke.enabled) return;

    const executor = await fetchExecutor(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
    if (!executor || isWhitelisted(channel.guild, executor)) return;

    recordAction(channel.guild.id, "channelDelete", executor.id, channel.id);

    // DEDUP: never restore the same channel twice (prevents duplicate channels)
    const restoreSet = getRestoreSet(channel.guild.id);
    if (restoreSet.has(channel.id)) return;
    restoreSet.add(channel.id);

    // --- STRICT MODE: restore THIS channel + punish (deduped) ---
    if (data.antinuke.strict) {
      // 1. Restore the single deleted channel (one create = one delete, no duplicates)
      if (data.autoRestore.enabled && data.autoRestore.restoreChannels) {
        const cached = channelCache.get(channel.id);
        if (cached) {
          await restoreChannel(channel.guild, cached).catch(() => {});
          channelCache.delete(channel.id);
        }
      }

      // 2. Punish (deduped — don't ban the same user 50 times in a burst)
      const punishedSet = getPunishedSet(channel.guild.id);
      if (!punishedSet.has(executor.id)) {
        punishedSet.add(executor.id);
        await punish(channel.guild, executor.id, `Unauthorized channel deletion (#${channel.name})`);
      }

      // 3. Alert (check for rapid burst for a stronger alert message)
      const burst = isRapidBurst(channel.guild.id);
      if (burst) {
        // Clear burst trackers so the alert doesn't repeat for every channel in the burst
        rapidDeleteTracker.set(channel.guild.id, []);
        actionTracker.get(channel.guild.id).set("channelDelete", []);
        // Clear the punished set after the burst settles
        setTimeout(() => punishedSet.delete(executor.id), 15000);
      }
      await alertGuild(channel.guild, "antinuke_triggered", {
        action: burst ? "mass channel deletion (emergency)" : "channel deletion",
        executor: executor.tag,
        detail: burst
          ? `Rapid channel deletion burst detected. Offender banned. Channel #${channel.name} restored.`
          : `Deleted channel #${channel.name} — restored and offender punished.`,
      });

      // Clean up the dedup entry after the restore is definitely complete
      setTimeout(() => restoreSet.delete(channel.id), 30000);
      return;
    }

    // --- Threshold mode (legacy) — also deduped ---
    const count = countActions(channel.guild.id, "channelDelete");
    if (count >= data.antinuke.threshold) {
      if (data.autoRestore.enabled && data.autoRestore.restoreChannels) {
        const tracker = getTracker(channel.guild.id, "channelDelete");
        for (const action of tracker.filter((a) => a.executorId === executor.id)) {
          if (restoreSet.has(action.targetId)) continue; // skip already-restored
          restoreSet.add(action.targetId);
          const cached = channelCache.get(action.targetId);
          if (cached) {
            await restoreChannel(channel.guild, cached).catch(() => {});
            channelCache.delete(action.targetId);
          }
          setTimeout(() => restoreSet.delete(action.targetId), 30000);
        }
      }
      const punishedSet = getPunishedSet(channel.guild.id);
      if (!punishedSet.has(executor.id)) {
        punishedSet.add(executor.id);
        await punish(channel.guild, executor.id, `Mass channel deletion (${count})`);
      }
      await alertGuild(channel.guild, "antinuke_triggered", { action: `mass channel deletion (${count})`, executor: executor.tag });
      actionTracker.get(channel.guild.id).set("channelDelete", []);
    }
  });

  // ====== CHANNEL UPDATE (rename protection + cache integrity) ======
  client.on("channelUpdate", async (oldChannel, newChannel) => {
    if (!newChannel.guild) return;
    const data = getGuild(newChannel.guild.id);
    if (!data.antinuke.enabled || !data.antinuke.strict) {
      cacheChannel(newChannel); // shield off — just keep cache fresh
      return;
    }
    // Only act on NAME change (other updates like topic/position are non-destructive)
    if (oldChannel.name === newChannel.name) {
      cacheChannel(newChannel); // non-name update — safe to refresh cache
      return;
    }

    // Name changed — check who did it
    const executor = await fetchExecutor(newChannel.guild, AuditLogEvent.ChannelUpdate, newChannel.id);
    if (!executor || isWhitelisted(newChannel.guild, executor)) {
      cacheChannel(newChannel); // legitimate rename — update cache to new name
      return;
    }

    // Unauthorized rename — revert to the ORIGINAL cached name (not oldChannel.name,
    // which could itself be a previous unauthorized rename the bot missed).
    // The cache holds the last known-good name.
    const cached = channelCache.get(newChannel.id);
    const originalName = cached?.name || oldChannel.name;
    try {
      await newChannel.edit({ name: originalName }, `[L Antinuke] Reverted unauthorized channel rename`);
    } catch {}
    // Do NOT update the cache — keep the original name so future renames also revert to it
    await punish(newChannel.guild, executor.id, `Unauthorized channel rename (#${oldChannel.name} -> #${newChannel.name})`);
    await alertGuild(newChannel.guild, "antinuke_triggered", {
      action: "channel rename", executor: executor.tag,
      detail: `Renamed #${oldChannel.name} to #${newChannel.name} — reverted to #${originalName} and offender punished.`,
    });
  });

  // ====== SERVER UPDATE (name + icon + description protection) ======
  client.on("guildUpdate", async (oldGuild, newGuild) => {
    const data = getGuild(newGuild.id);
    if (!data.antinuke.enabled || !data.antinuke.strict) return;
    // Only act if the identity lock is active
    const identity = data.serverIdentity || {};
    if (identity.locked === false) return;

    // Detect changes to name, icon (hash), and description
    const nameChanged = oldGuild.name !== newGuild.name;
    const iconChanged = oldGuild.icon !== newGuild.icon; // icon hash comparison
    const descChanged = oldGuild.description !== newGuild.description;
    if (!nameChanged && !iconChanged && !descChanged) return;

    const executor = await fetchExecutor(newGuild, AuditLogEvent.GuildUpdate, newGuild.id);
    if (!executor || isWhitelisted(newGuild, executor)) {
      // Legitimate change by a whitelisted user — update the identity snapshot
      // so future unauthorized changes revert to THIS new state
      updateGuild(newGuild.id, (d) => {
        d.serverIdentity = {
          name: newGuild.name,
          iconUrl: newGuild.iconURL(),
          description: newGuild.description,
          locked: d.serverIdentity?.locked || true,
        };
      });
      return;
    }

    // Unauthorized server modification — revert ALL changes + ban
    const revertPromises = [];

    if (nameChanged) {
      const targetName = identity.name || oldGuild.name;
      revertPromises.push(
        newGuild.setName(targetName, "[L Antinuke] Reverted unauthorized server rename").catch(() => {})
      );
    }
    if (iconChanged) {
      // Revert to the locked identity icon, or the old icon, or the protected L icon
      const targetIcon = identity.iconUrl || oldGuild.iconURL() || config.protectedServerIcon;
      if (targetIcon) {
        revertPromises.push(
          newGuild.setIcon(targetIcon, "[L Antinuke] Reverted unauthorized server icon change").catch(() => {})
        );
      } else if (!newGuild.icon) {
        // icon was removed and there's no target — try the protected L icon
        revertPromises.push(
          newGuild.setIcon(config.protectedServerIcon, "[L Antinuke] Restored protected server icon").catch(() => {})
        );
      }
    }
    if (descChanged) {
      const targetDesc = identity.description !== null && identity.description !== undefined ? identity.description : oldGuild.description;
      revertPromises.push(
        newGuild.setDescription(targetDesc || null, "[L Antinuke] Reverted unauthorized server description change").catch(() => {})
      );
    }

    await Promise.allSettled(revertPromises);
    await punish(newGuild, executor.id, `Unauthorized server modification (name/icon/description)`);

    const changes = [nameChanged && "name", iconChanged && "icon", descChanged && "description"].filter(Boolean);
    await alertGuild(newGuild, "antinuke_triggered", {
      action: `server ${changes.join("/") || "modification"}`, executor: executor.tag,
      detail: `Server ${changes.join(", ")} changed by ${executor.tag} — reverted and offender punished.`,
    });
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

  // ====== STRICT ROLE DELETE (deduped — NO duplicate roles) ======
  client.on("roleDelete", async (role) => {
    const data = getGuild(role.guild.id);
    if (!data.antinuke.enabled) return;
    const executor = await fetchExecutor(role.guild, AuditLogEvent.RoleDelete, role.id);
    if (!executor || isWhitelisted(role.guild, executor)) return;

    recordAction(role.guild.id, "roleDelete", executor.id, role.id);

    // DEDUP: never restore the same role twice (prevents duplicate roles)
    const restoreSet = getRestoreSet(role.guild.id);
    if (restoreSet.has(role.id)) return;
    restoreSet.add(role.id);

    if (data.antinuke.strict) {
      if (data.autoRestore.enabled && data.autoRestore.restoreRoles) {
        const cached = roleCache.get(role.id);
        if (cached) {
          await restoreRole(role.guild, cached).catch(() => {});
          roleCache.delete(role.id);
        }
      }
      // Deduped punish
      const punishedSet = getPunishedSet(role.guild.id);
      if (!punishedSet.has(executor.id)) {
        punishedSet.add(executor.id);
        await punish(role.guild, executor.id, `Unauthorized role deletion (@${role.name})`);
      }
      await alertGuild(role.guild, "antinuke_triggered", { action: "role deletion", executor: executor.tag, detail: `Deleted role @${role.name} — restored and offender punished.` });
      setTimeout(() => restoreSet.delete(role.id), 30000);
      return;
    }

    const count = countActions(role.guild.id, "roleDelete");
    if (count >= data.antinuke.threshold) {
      if (data.autoRestore.enabled && data.autoRestore.restoreRoles) {
        const tracker = getTracker(role.guild.id, "roleDelete");
        for (const action of tracker.filter((a) => a.executorId === executor.id)) {
          if (restoreSet.has(action.targetId)) continue; // skip already-restored
          restoreSet.add(action.targetId);
          const cached = roleCache.get(action.targetId);
          if (cached) {
            await restoreRole(role.guild, cached).catch(() => {});
            roleCache.delete(action.targetId);
          }
          setTimeout(() => restoreSet.delete(action.targetId), 30000);
        }
      }
      const punishedSet = getPunishedSet(role.guild.id);
      if (!punishedSet.has(executor.id)) {
        punishedSet.add(executor.id);
        await punish(role.guild, executor.id, `Mass role deletion (${count})`);
      }
      await alertGuild(role.guild, "antinuke_triggered", { action: `mass role deletion (${count})`, executor: executor.tag });
      actionTracker.get(role.guild.id).set("roleDelete", []);
    }
  });

  // ====== ROLE CREATE (block unauthorized role creation) ======
  client.on("roleCreate", async (role) => {
    const data = getGuild(role.guild.id);
    if (!data.antinuke.enabled || !data.antinuke.strict) return;
    const executor = await fetchExecutor(role.guild, AuditLogEvent.RoleCreate, role.id);
    if (!executor || isWhitelisted(role.guild, executor)) return;

    recordAction(role.guild.id, "roleCreate", executor.id, role.id);
    // Strict: delete the unauthorized role immediately + punish
    try { await role.delete("[L Antinuke] Unauthorized role creation").catch(() => {}); } catch {}
    const punishedSet = getPunishedSet(role.guild.id);
    if (!punishedSet.has(executor.id)) {
      punishedSet.add(executor.id);
      await punish(role.guild, executor.id, `Unauthorized role creation (@${role.name})`);
      setTimeout(() => punishedSet.delete(executor.id), 15000);
    }
    await alertGuild(role.guild, "antinuke_blocked", { action: "role creation", executor: executor.tag });
  });

  // ====== ROLE UPDATE (block dangerous permission gain) ======
  // Ported from Melon: only triggers when a role GAINS dangerous permissions
  // (Admin, Ban, Kick, ManageGuild, ManageChannels, ManageRoles, ManageWebhooks,
  // MentionEveryone). Prevents privilege escalation via role edits.
  client.on("roleUpdate", async (oldRole, newRole) => {
    const data = getGuild(newRole.guild.id);
    if (!data.antinuke.enabled || !data.antinuke.strict) return;
    cacheRole(newRole); // keep cache fresh on legitimate updates

    const DANGEROUS = [
      PermissionFlagsBits.Administrator, PermissionFlagsBits.BanMembers,
      PermissionFlagsBits.KickMembers, PermissionFlagsBits.ManageGuild,
      PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles,
      PermissionFlagsBits.ManageWebhooks, PermissionFlagsBits.MentionEveryone,
    ];
    // Did the role GAIN any dangerous permission it didn't have before?
    const gainedDangerous = DANGEROUS.some((p) =>
      !oldRole.permissions.has(p) && newRole.permissions.has(p)
    );
    if (!gainedDangerous) return;

    const executor = await fetchExecutor(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);
    if (!executor || isWhitelisted(newRole.guild, executor)) return;

    // Revert the role permissions to the old state + punish
    try {
      await newRole.setPermissions(oldRole.permissions, "[L Antinuke] Reverted dangerous permission gain");
    } catch {}
    const punishedSet = getPunishedSet(newRole.guild.id);
    if (!punishedSet.has(executor.id)) {
      punishedSet.add(executor.id);
      await punish(newRole.guild, executor.id, `Dangerous permission gain on role @${newRole.name}`);
      setTimeout(() => punishedSet.delete(executor.id), 15000);
    }
    await alertGuild(newRole.guild, "antinuke_triggered", {
      action: "dangerous permission gain", executor: executor.tag,
      detail: `Role @${newRole.name} gained dangerous permissions — reverted and offender punished.`,
    });
  });

  // ====== EMOJI PROTECTION (block unauthorized emoji create/delete/update) ======
  const handleEmoji = async (emoji, auditEvent, actionLabel) => {
    const data = getGuild(emoji.guild.id);
    if (!data.antinuke.enabled || !data.antinuke.strict) return;
    const executor = await fetchExecutor(emoji.guild, auditEvent, emoji.id);
    if (!executor || isWhitelisted(emoji.guild, executor)) return;
    // Punish the unauthorized emoji action
    const punishedSet = getPunishedSet(emoji.guild.id);
    if (!punishedSet.has(executor.id)) {
      punishedSet.add(executor.id);
      await punish(emoji.guild, executor.id, `Unauthorized emoji ${actionLabel} (${emoji.name})`);
      setTimeout(() => punishedSet.delete(executor.id), 15000);
    }
    await alertGuild(emoji.guild, "antinuke_blocked", { action: `emoji ${actionLabel}`, executor: executor.tag });
  };
  client.on("emojiCreate", (emoji) => handleEmoji(emoji, AuditLogEvent.EmojiCreate, "creation"));
  client.on("emojiDelete", (emoji) => handleEmoji(emoji, AuditLogEvent.EmojiDelete, "deletion"));
  client.on("emojiUpdate", (oldEmoji, newEmoji) => handleEmoji(newEmoji, AuditLogEvent.EmojiUpdate, "update"));

  // ====== STICKER PROTECTION (block unauthorized sticker create/delete) ======
  const handleSticker = async (sticker, auditEvent, actionLabel) => {
    const data = getGuild(sticker.guild.id);
    if (!data.antinuke.enabled || !data.antinuke.strict) return;
    const executor = await fetchExecutor(sticker.guild, auditEvent, sticker.id);
    if (!executor || isWhitelisted(sticker.guild, executor)) return;
    const punishedSet = getPunishedSet(sticker.guild.id);
    if (!punishedSet.has(executor.id)) {
      punishedSet.add(executor.id);
      await punish(sticker.guild, executor.id, `Unauthorized sticker ${actionLabel} (${sticker.name})`);
      setTimeout(() => punishedSet.delete(executor.id), 15000);
    }
    await alertGuild(sticker.guild, "antinuke_blocked", { action: `sticker ${actionLabel}`, executor: executor.tag });
  };
  client.on("stickerCreate", (sticker) => handleSticker(sticker, AuditLogEvent.GuildStickerCreate, "creation"));
  client.on("stickerDelete", (sticker) => handleSticker(sticker, AuditLogEvent.GuildStickerDelete, "deletion"));

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

  // ====== BOT ANTI-ADD ======
  client.on("guildMemberAdd", async (member) => {
    if (!member.user.bot) { handleJoin(member); return; }
    const data = getGuild(member.guild.id);
    if (!data.antinuke.enabled || !data.antinuke.blockBotAdd) return;
    if (data.antinuke.whitelistedBots.includes(member.id)) return;

    const executor = await fetchExecutor(member.guild, AuditLogEvent.BotAdd, member.id);
    if (!executor || isWhitelisted(member.guild, executor)) return;

    try {
      await member.kick("[L Antinuke] Unauthorized bot addition").catch(() => {});
      await punish(member.guild, executor.id, `Unauthorized bot addition (${member.user.tag})`);
      await alertGuild(member.guild, "bot_blocked", { bot: member.user.tag, executor: executor.tag });
    } catch (e) {
      logger.error("[antinuke] bot-add protection failed", e.message);
    }
  });

  // ====== ANTI-WEBHOOK (FIXED: correct audit-log target + usage detection) ======
  client.on("webhooksUpdate", async (channel) => {
    const data = getGuild(channel.guild.id);
    if (!data.antinuke.enabled || !data.antinuke.antiWebhook) return;

    try {
      // Fetch the guild's webhooks to find ones in this channel
      const hooks = await channel.guild.fetchWebhooks().catch(() => []);
      const channelHooks = [...hooks.values()].filter((h) => h.channelId === channel.id);

      // Fetch audit log for WebhookCreate — the target is the WEBHOOK, not the channel
      // (this was the v2 bug: it matched channel.id which never equals a webhook ID)
      const logs = await channel.guild.fetchAuditLogs({ limit: 10, type: AuditLogEvent.WebhookCreate }).catch(() => null);
      const recentEntry = logs?.entries?.find((e) => Date.now() - e.createdTimestamp < 15000); // within 15s

      if (recentEntry) {
        const executor = recentEntry.executor;
        const webhook = recentEntry.target; // the Webhook object

        if (executor && !isWhitelisted(channel.guild, executor)) {
          // Track webhook → creator mapping (for usage detection)
          if (!webhookCreatorMap.has(channel.guild.id)) webhookCreatorMap.set(channel.guild.id, new Map());
          if (webhook) webhookCreatorMap.get(channel.guild.id).set(webhook.id, executor.id);

          // Delete the webhook immediately
          if (webhook && webhook.delete) {
            await webhook.delete("[L Antinuke] Unauthorized webhook creation").catch(() => {});
          } else {
            // Fallback: delete any webhook in this channel owned by the executor
            for (const h of channelHooks) {
              if (h.ownerId === executor.id) await h.delete("[L Antinuke] Unauthorized webhook").catch(() => {});
            }
          }

          // Ban the creator
          await punish(channel.guild, executor.id, "Unauthorized webhook creation");
          await alertGuild(channel.guild, "antinuke_triggered", {
            action: "webhook creation", executor: executor.tag,
            detail: `Created a webhook in #${channel.name} — webhook deleted and creator punished.`,
          });
          return;
        }
      }

      // Fallback: if no audit log found but there are webhooks in this channel,
      // and the bot has antiWebhook on, delete any webhook whose owner is non-whitelisted
      for (const h of channelHooks) {
        if (h.ownerId) {
          const owner = await channel.guild.members.fetch(h.ownerId).catch(() => null);
          if (owner && !isWhitelisted(channel.guild, owner.user)) {
            await h.delete("[L Antinuke] Unauthorized webhook").catch(() => {});
            if (!webhookCreatorMap.has(channel.guild.id)) webhookCreatorMap.set(channel.guild.id, new Map());
            webhookCreatorMap.get(channel.guild.id).set(h.id, h.ownerId);
            await punish(channel.guild, h.ownerId, "Unauthorized webhook creation");
            await alertGuild(channel.guild, "antinuke_triggered", {
              action: "webhook creation", executor: owner.user.tag,
              detail: `Created a webhook in #${channel.name} — webhook deleted and creator punished.`,
            });
          }
        }
      }
    } catch (e) {
      logger.error("[antinuke] anti-webhook failed", e.message);
    }
  });

  // ====== WELCOME / GOODBYE + WEBHOOK MESSAGE DETECTION ======
  client.on("messageCreate", async (message) => {
    if (!message.guild) return;

    // --- WEBHOOK MESSAGE DETECTION (NEW) ---
    // If this message is from a webhook, check if the webhook was created by a non-whitelisted user
    if (message.webhookId && message.guild) {
      const data = getGuild(message.guild.id);
      if (data.antinuke.enabled && data.antinuke.antiWebhook) {
        try {
          // Delete the webhook message
          await message.delete().catch(() => {});

          // Look up the creator from our tracking map
          const creatorMap = webhookCreatorMap.get(message.guild.id);
          let creatorId = creatorMap?.get(message.webhookId);

          // Fetch the webhook to get the owner if we don't have it tracked
          const webhook = await message.guild.fetchWebhook(message.webhookId).catch(() => null);
          if (webhook) {
            if (!creatorId) creatorId = webhook.ownerId;
            // Delete the webhook
            await webhook.delete("[L Antinuke] Unauthorized webhook usage").catch(() => {});
          }

          // Ban the creator if known and not whitelisted
          if (creatorId) {
            const creator = await message.guild.members.fetch(creatorId).catch(() => null);
            if (creator && !isWhitelisted(message.guild, creator.user)) {
              await punish(message.guild, creatorId, "Unauthorized webhook creation and usage");
              await alertGuild(message.guild, "antinuke_triggered", {
                action: "webhook usage", executor: creator.user.tag,
                detail: `Unauthorized webhook used to send messages — webhook deleted and creator punished.`,
              });
            }
          }
        } catch (e) {
          logger.error("[antinuke] webhook-usage detection failed", e.message);
        }
      }
      return; // webhook messages don't need further processing
    }

    if (message.author.bot) return;
    const data = getGuild(message.guild.id);
    if (!data.antinuke.enabled) return;

    // --- ANTI-PING ---
    if (data.antinuke.antiping && !isWhitelisted(message.guild, message.author) && message.mentions.everyone) {
      try {
        await message.delete();
        const member = await message.guild.members.fetch(message.author.id).catch(() => null);
        if (member) await member.timeout(5 * 60 * 1000, "[L Antiping] unauthorized everyone/here ping").catch(() => {});
      } catch {}
    }

    // --- ANTI-SPAM ---
    if (data.antinuke.antiSpam && !isWhitelisted(message.guild, message.author)) {
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
    if (!message.guild || message.author.bot || message.webhookId) return;
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

  // ====== PROACTIVE CACHE REFRESH (every 60s) ======
  if (cacheInterval) clearInterval(cacheInterval);
  cacheInterval = setInterval(() => {
    for (const guild of client.guilds.cache.values()) {
      guild.channels.cache.forEach((ch) => cacheChannel(ch));
      guild.roles.cache.forEach((r) => cacheRole(r));
    }
    // Memory cleanup: prune stale entries from spam/join trackers and dedup sets
    // to prevent unbounded growth on long-running bots.
    const now = Date.now();
    for (const [gid, userMap] of spamTracker.entries()) {
      for (const [uid, arr] of userMap.entries()) {
        if (!arr.length || now - arr[arr.length - 1] > 300000) userMap.delete(uid); // 5 min idle
      }
      if (!userMap.size) spamTracker.delete(gid);
    }
    for (const [gid, arr] of joinTracker.entries()) {
      if (!arr.length || now - arr[arr.length - 1] > 300000) joinTracker.delete(gid);
    }
    for (const [gid, set] of restoreInProgress.entries()) {
      if (!set.size) restoreInProgress.delete(gid);
    }
    for (const [gid, set] of punishedThisBurst.entries()) {
      if (!set.size) punishedThisBurst.delete(gid);
    }
    for (const [gid, arr] of rapidDeleteTracker.entries()) {
      if (!arr.length || now - arr[arr.length - 1] > 10000) rapidDeleteTracker.delete(gid);
    }
  }, 60000);

  logger.log("[antinuke] v3 handlers attached (strict + webhook fix + rename ban + dedup + memory cleanup)");
}

module.exports = {
  setup, isWhitelisted, cacheChannel, cacheRole,
  recordAction, countActions, clearPanic,
};
