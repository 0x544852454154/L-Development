const { AuditLogEvent, PermissionFlagsBits, ChannelType } = require("discord.js");
const { getGuild, updateGuild, addAudit } = require("../database");
const { buildEmbed } = require("../embedBuilder");
const logger = require("../logger");

// Tracks recent destructive actions per guild for threshold detection.
// Map<guildId, Map<eventType, Array<{ ts, executorId, targetId }>>>
const actionTracker = new Map();

// Tracks bot spam/activity per guild
// Map<guildId, Map<botId, Array<{ ts, type, details }>>>
const botActivityTracker = new Map();

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

// Bot spam tracking functions
function getBotTracker(guildId, botId) {
  if (!botActivityTracker.has(guildId)) botActivityTracker.set(guildId, new Map());
  const guildMap = botActivityTracker.get(guildId);
  if (!guildMap.has(botId)) guildMap.set(botId, []);
  return guildMap.get(botId);
}

function recordBotActivity(guildId, botId, type, details = "") {
  const arr = getBotTracker(guildId, botId);
  arr.push({ ts: Date.now(), type, details });
  // Keep only last 60 seconds of activity
  const cutoff = Date.now() - 60000;
  while (arr.length && arr[0].ts < cutoff) arr.shift();
}

function countBotActions(guildId, botId, type = null, window = 10000) {
  const arr = getBotTracker(guildId, botId);
  const cutoff = Date.now() - window;
  if (type) {
    return arr.filter((a) => a.ts >= cutoff && a.type === type).length;
  }
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

// Delay helper for throttling
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function restoreRole(guild, cached) {
  try {
    const created = await guild.roles.create({
      name: cached.name,
      color: cached.color,
      hoist: cached.hoist,
      mentionable: cached.mentionable,
      permissions: cached.permissions ? BigInt(cached.permissions) : 0n,
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
  // Note: We don't cache on channelCreate anymore to avoid caching nuke channels
  client.on("channelUpdate", (oldCh, newCh) => cacheChannel(newCh));
  client.on("roleUpdate", (oldR, newR) => cacheRole(newR));

  // Role creation - track for bot spam detection
  client.on("roleCreate", async (role) => {
    const data = getGuild(role.guild.id);
    if (!data.antinuke.enabled) {
      cacheRole(role);
      return;
    }

    const executor = await fetchExecutor(role.guild, AuditLogEvent.RoleCreate, role.id);
    if (!executor || isWhitelisted(role.guild, executor)) {
      cacheRole(role);
      return;
    }

    // Track bot role creation
    if (executor.bot) {
      recordBotActivity(role.guild.id, executor.id, "roleCreate", role.name);
      const roleThreshold = data.antinuke.botRoleSpamThreshold || 5;
      const botRoleCount = countBotActions(role.guild.id, executor.id, "roleCreate", 10000);
      if (botRoleCount >= roleThreshold) {
        // Bot is spamming roles - kick it immediately
        try {
          const bot = role.guild.members.cache.get(executor.id);
          if (bot) {
            await bot.kick("[L Antinuke] Bot spamming roles").catch(() => {});
            logger.log(`[antinuke] kicked role-spamming bot ${executor.tag} (${botRoleCount} roles in 10s)`);
            addAudit(role.guild.id, "Bot Spam Kick", "L", `Kicked bot ${executor.tag} for role spam (${botRoleCount} roles)`, "danger");
            // Delete all roles created by this bot
            const tracker = getBotTracker(role.guild.id, executor.id);
            const recentRoles = tracker.filter((a) => a.type === "roleCreate");
            for (const action of recentRoles) {
              try {
                const r = role.guild.roles.cache.find((r) => r.name === action.details);
                if (r) {
                  await r.delete("[L Antinuke] Bot spam cleanup").catch(() => {});
                }
              } catch (e) {
                logger.error("[antinuke] failed to delete bot spam role", e.message);
              }
            }
            return;
          }
        } catch (e) {
          logger.error("[antinuke] failed to kick role-spamming bot", e.message);
        }
      }
    }

    cacheRole(role);
  });

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
      // Auto-restore with throttling
      if (data.autoRestore.enabled && data.autoRestore.restoreChannels) {
        const tracker = getTracker(channel.guild.id, "channelDelete");
        const recentDeletions = tracker.filter((a) => a.executorId === executor.id);
        
        let restoredCount = 0;
        for (const action of recentDeletions) {
          const cached = channelCache.get(action.targetId);
          if (cached) {
            await restoreChannel(channel.guild, cached);
            channelCache.delete(action.targetId);
            restoredCount++;
            // Add delay between restores to avoid rate limits
            if (restoredCount < recentDeletions.length) {
              await delay(500); // 500ms delay between each restore
            }
          }
        }
      }
      await punish(channel.guild, executor.id, `Mass channel deletion (${count} channels)`);
      await alertNuke(channel.guild, "channel deletions", count, executor);
      // Clear the tracker
      actionTracker.get(channel.guild.id).set("channelDelete", []);
    }
  });

  // ===== Channel creation (nukers adding channels) =====
  client.on("channelCreate", async (channel) => {
    if (!channel.guild) return;
    const data = getGuild(channel.guild.id);
    
    // Always cache legitimate channels for potential restore
    if (!data.antinuke.enabled) {
      cacheChannel(channel);
      return;
    }

    const executor = await fetchExecutor(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
    if (!executor || isWhitelisted(channel.guild, executor)) {
      cacheChannel(channel); // Cache whitelisted user's channels
      return;
    }

    // Track bot channel creation
    if (executor.bot) {
      recordBotActivity(channel.guild.id, executor.id, "channelCreate", channel.name);
      const channelThreshold = data.antinuke.botChannelSpamThreshold || 5;
      const botChannelCount = countBotActions(channel.guild.id, executor.id, "channelCreate", 10000);
      if (botChannelCount >= channelThreshold) {
        // Bot is spamming channels - kick it immediately
        try {
          const bot = channel.guild.members.cache.get(executor.id);
          if (bot) {
            await bot.kick("[L Antinuke] Bot spamming channels").catch(() => {});
            logger.log(`[antinuke] kicked channel-spamming bot ${executor.tag} (${botChannelCount} channels in 10s)`);
            addAudit(channel.guild.id, "Bot Spam Kick", "L", `Kicked bot ${executor.tag} for channel spam (${botChannelCount} channels)`, "danger");
            // Delete all channels created by this bot
            const tracker = getBotTracker(channel.guild.id, executor.id);
            const recentChannels = tracker.filter((a) => a.type === "channelCreate");
            for (const action of recentChannels) {
              try {
                const ch = channel.guild.channels.cache.find((c) => c.name === action.details);
                if (ch) {
                  await ch.delete("[L Antinuke] Bot spam cleanup").catch(() => {});
                }
              } catch (e) {
                logger.error("[antinuke] failed to delete bot spam channel", e.message);
              }
            }
            return;
          }
        } catch (e) {
          logger.error("[antinuke] failed to kick channel-spamming bot", e.message);
        }
      }
    }

    recordAction(channel.guild.id, "channelCreate", executor.id, channel.id);
    const count = countActions(channel.guild.id, "channelCreate");

    if (count >= data.antinuke.threshold) {
      // Instant delete all recently created channels by this user
      const tracker = getTracker(channel.guild.id, "channelCreate");
      const recentChannels = tracker.filter((a) => a.executorId === executor.id);
      
      for (const action of recentChannels) {
        try {
          const ch = channel.guild.channels.cache.get(action.targetId);
          if (ch) {
            await ch.delete("[L Antinuke] Mass channel creation detected").catch(() => {});
            logger.log(`[antinuke] deleted channel ${ch.name} created by nuker ${executor.tag}`);
          }
        } catch (e) {
          logger.error("[antinuke] failed to delete nuke channel", e.message);
        }
      }

      await punish(channel.guild, executor.id, `Mass channel creation (${count} channels)`);
      await alertNuke(channel.guild, "channel creations", count, executor);
      // Clear the tracker
      actionTracker.get(channel.guild.id).set("channelCreate", []);
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
        const tracker = getTracker(role.guild.id, "roleDelete");
        const recentDeletions = tracker.filter((a) => a.executorId === executor.id);
        
        let restoredCount = 0;
        for (const action of recentDeletions) {
          const cached = roleCache.get(action.targetId);
          if (cached) {
            await restoreRole(role.guild, cached);
            roleCache.delete(action.targetId);
            restoredCount++;
            // Add delay between restores to avoid rate limits
            if (restoredCount < recentDeletions.length) {
              await delay(500); // 500ms delay between each restore
            }
          }
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

  // ===== Bot spam detection =====
  client.on("messageCreate", async (message) => {
    if (!message.guild || !message.author.bot) return;
    const data = getGuild(message.guild.id);
    if (!data.antinuke.enabled || !data.antinuke.botSpamDetection) return;

    // Track bot message activity
    recordBotActivity(message.guild.id, message.author.id, "message", message.content);

    // Check for message spam using configurable threshold
    const msgThreshold = data.antinuke.botSpamThreshold || 20;
    const msgCount = countBotActions(message.guild.id, message.author.id, "message", 10000);
    if (msgCount >= msgThreshold) {
      try {
        const bot = message.guild.members.cache.get(message.author.id);
        if (bot) {
          await bot.kick("[L Antinuke] Bot spamming messages").catch(() => {});
          logger.log(`[antinuke] kicked spamming bot ${message.author.tag} (${msgCount} messages in 10s)`);
          addAudit(message.guild.id, "Bot Spam Kick", "L", `Kicked bot ${message.author.tag} for message spam (${msgCount} messages)`, "danger");
        }
      } catch (e) {
        logger.error("[antinuke] failed to kick spamming bot", e.message);
      }
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
