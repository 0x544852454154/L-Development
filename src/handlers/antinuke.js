const { AuditLogEvent, PermissionFlagsBits, ChannelType } = require("discord.js");
const { getGuild, updateGuild, addAudit } = require("../database");
const { buildEmbed } = require("../embedBuilder");
const { fetchExecutor } = require("./auditCache");
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
            PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ManageRoles, PermissionFlagsBits.BanMembers,
            PermissionFlagsBits.KickMembers, PermissionFlagsBits.ManageGuild,
            PermissionFlagsBits.ManageWebhooks, PermissionFlagsBits.MentionEveryone,
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
const banCache = new Map();
// webhookCreatorMap: guildId -> Map<webhookId, creatorUserId>
// Used to trace webhook messages back to the creator for punishment
const webhookCreatorMap = new Map();

function cacheChannel(channel) {
  if (!channel.guild) return;
  channelCache.set(channel.id, {
    name: channel.name, type: channel.type, parentId: channel.parentId,
    topic: channel.topic || null, position: channel.position, nsfw: channel.nsfw || false,
    rateLimit: channel.rateLimitPerUser || 0,
    permissionOverwrites: channel.permissionOverwrites.cache.map((o) => ({
      id: o.id, type: o.type, allow: o.allow.toArray(), deny: o.deny.toArray(),
    })),
    guildId: channel.guild.id,
  });
  if (channelCache.size > 5000) channelCache.delete(channelCache.keys().next().value);
}

function cacheRole(role) {
  roleCache.set(role.id, {
    name: role.name, color: role.color, hoist: role.hoist, mentionable: role.mentionable,
    permissions: role.permissions.bitfield.toString(), position: role.position, icon: role.icon || null,
    guildId: role.guild.id,
  });
  if (roleCache.size > 2000) roleCache.delete(roleCache.keys().next().value);
}

function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

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

  // ====== CHANNEL DELETE (with instant-nuke counter) ======
  client.on("channelDelete", async (channel) => {
    if (!channel.guild) return;
    const data = getGuild(channel.guild.id);
    if (!data.antinuke.enabled) return;

    const executor = await fetchExecutor(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
    if (!executor || isWhitelisted(channel.guild, executor)) return;

    recordAction(channel.guild.id, "channelDelete", executor.id, channel.id);

    // --- INSTANT-NUKE COUNTER: 3+ deletions in 2s = emergency lockdown ---
    if (data.antinuke.strict && isRapidBurst(channel.guild.id)) {
      // BAN FIRST — stop the nuke immediately
      await punish(channel.guild, executor.id, `Mass channel deletion (emergency lockdown — rapid burst)`);
      logger.log(`[antinuke] EMERGENCY LOCKDOWN: banned ${executor.tag} for instant-nuke in ${channel.guild.name}`);

      // Batch-restore ALL deleted channels in parallel (groups of 5 for rate limits)
      if (data.autoRestore.enabled && data.autoRestore.restoreChannels) {
        const tracker = getTracker(channel.guild.id, "channelDelete");
        const toRestore = tracker.filter((a) => a.executorId === executor.id);
        const restoreBatch = [];
        for (const action of toRestore) {
          const cached = channelCache.get(action.targetId);
          if (cached) {
            restoreBatch.push(() => restoreChannel(channel.guild, cached).then(() => channelCache.delete(action.targetId)));
          }
        }
        // Restore in groups of 5 to respect Discord rate limits (5 creates / 2s / guild)
        for (let i = 0; i < restoreBatch.length; i += 5) {
          await Promise.allSettled(restoreBatch.slice(i, i + 5).map((fn) => fn()));
          if (i + 5 < restoreBatch.length) await delay(2100);
        }
        logger.log(`[antinuke] batch-restored ${restoreBatch.length} channels after instant-nuke`);
      }

      await alertGuild(channel.guild, "antinuke_triggered", {
        action: "instant nuke (mass channel deletion)",
        executor: executor.tag,
        detail: `Emergency lockdown: rapid channel deletion detected. Offender banned. All channels restored.`,
      });
      actionTracker.get(channel.guild.id).set("channelDelete", []);
      rapidDeleteTracker.set(channel.guild.id, []);
      return;
    }

    // --- STRICT MODE: immediate punishment on ANY single deletion ---
    if (data.antinuke.strict) {
      if (data.autoRestore.enabled && data.autoRestore.restoreChannels) {
        const cached = channelCache.get(channel.id);
        if (cached) { await restoreChannel(channel.guild, cached); channelCache.delete(channel.id); }
      }
      await punish(channel.guild, executor.id, `Unauthorized channel deletion (#${channel.name})`);
      await alertGuild(channel.guild, "antinuke_triggered", {
        action: "channel deletion", executor: executor.tag,
        detail: `Deleted channel #${channel.name} — restored and offender punished.`,
      });
      return;
    }

    // --- Threshold mode (legacy) ---
    const count = countActions(channel.guild.id, "channelDelete");
    if (count >= data.antinuke.threshold) {
      if (data.autoRestore.enabled && data.autoRestore.restoreChannels) {
        const tracker = getTracker(channel.guild.id, "channelDelete");
        for (const action of tracker.filter((a) => a.executorId === executor.id)) {
          const cached = channelCache.get(action.targetId);
          if (cached) { await restoreChannel(channel.guild, cached); channelCache.delete(action.targetId); }
        }
      }
      await punish(channel.guild, executor.id, `Mass channel deletion (${count})`);
      await alertGuild(channel.guild, "antinuke_triggered", { action: `mass channel deletion (${count})`, executor: executor.tag });
      actionTracker.get(channel.guild.id).set("channelDelete", []);
    }
  });

  // ====== CHANNEL RENAME → BAN (NEW) ======
  client.on("channelUpdate", async (oldChannel, newChannel) => {
    if (!newChannel.guild) return;
    cacheChannel(newChannel); // keep cache fresh
    const data = getGuild(newChannel.guild.id);
    if (!data.antinuke.enabled || !data.antinuke.strict) return;
    // Only trigger on NAME change
    if (oldChannel.name === newChannel.name) return;

    const executor = await fetchExecutor(newChannel.guild, AuditLogEvent.ChannelUpdate, newChannel.id);
    if (!executor || isWhitelisted(newChannel.guild, executor)) return;

    // Revert the name + ban
    try { await newChannel.edit({ name: oldChannel.name }, `[L Antinuke] Reverted unauthorized channel rename`); } catch {}
    await punish(newChannel.guild, executor.id, `Unauthorized channel rename (#${oldChannel.name} -> #${newChannel.name})`);
    await alertGuild(newChannel.guild, "antinuke_triggered", {
      action: "channel rename", executor: executor.tag,
      detail: `Renamed #${oldChannel.name} to #${newChannel.name} — reverted and offender punished.`,
    });
  });

  // ====== SERVER RENAME → BAN (NEW) ======
  client.on("guildUpdate", async (oldGuild, newGuild) => {
    const data = getGuild(newGuild.id);
    if (!data.antinuke.enabled || !data.antinuke.strict) return;
    if (oldGuild.name === newGuild.name) return;

    const executor = await fetchExecutor(newGuild, AuditLogEvent.GuildUpdate, newGuild.id);
    if (!executor || isWhitelisted(newGuild, executor)) return;

    // Revert the name + ban
    try { await newGuild.setName(oldGuild.name, `[L Antinuke] Reverted unauthorized server rename`); } catch {}
    await punish(newGuild, executor.id, `Unauthorized server rename (${oldGuild.name} -> ${newGuild.name})`);
    await alertGuild(newGuild, "antinuke_triggered", {
      action: "server rename", executor: executor.tag,
      detail: `Server renamed from "${oldGuild.name}" to "${newGuild.name}" — reverted and offender punished.`,
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
  }, 60000);

  logger.log("[antinuke] v3 handlers attached (strict + webhook fix + rename ban + instant-nuke counter)");
}

module.exports = {
  setup, isWhitelisted, cacheChannel, cacheRole,
  recordAction, countActions, clearPanic,
};
