const fs = require("fs");
const path = require("path");
const config = require("./config");

/*
 * L Database — v2 (optimized)
 *
 * Key optimizations over v1:
 *  - In-memory cache with write-behind: config reads are O(1) map lookups.
 *  - Debounced disk writes: multiple rapid config changes batch into a single
 *    file write (every 1.5s), so a nuke that triggers 50 config updates writes
 *    the file once instead of 50 times.
 *  - Merge-on-load: forward-compatible default merging.
 *  - The default embeds are now emoji-free and category-aware.
 */

const DATA_DIR = path.join(__dirname, "..", "serverdata");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Emoji-free default embeds (mirrors embedBuilder.DEFAULT_EMBEDS)
const DEFAULT_EMBEDS = {
  success: { title: "Success", description: "{detail}", color: "57F287", footer: "L", showTimestamp: true },
  error: { title: "Error", description: "{detail}", color: "ED4245", footer: "L", showTimestamp: true },
  warn: { title: "Warning", description: "{detail}", color: "F1C40F", footer: "L", showTimestamp: true },
  info: { title: "Information", description: "{detail}", color: "2B2D31", footer: "L", showTimestamp: true },
  no_perms: { title: "Access Denied", description: "You do not have permission to use this command.", color: "ED4245", footer: "L", showTimestamp: true },
  generic: { title: "L", description: "{detail}", color: "ED4245", footer: "L", showTimestamp: true },
  antinuke_enabled: { title: "Antinuke Shield Activated", description: "The L antinuke shield is now **online**.\nDestructive actions by unauthorized users will be blocked and reverted automatically.", color: "57F287", footer: "L • Antinuke", showTimestamp: true },
  antinuke_disabled: { title: "Antinuke Shield Deactivated", description: "The antinuke shield is now **offline**.\nThis server is no longer protected from nukes.", color: "F1C40F", footer: "L • Antinuke", showTimestamp: true },
  antinuke_triggered: { title: "Threat Neutralized", description: "A destructive action by **{executor}** was detected and **auto-reverted**.\nThe offender has been punished and the damage restored.", color: "ED4245", footer: "L • Antinuke", showTimestamp: true },
  antinuke_blocked: { title: "Action Blocked", description: "An unauthorized **{action}** by **{executor}** was blocked.\nNo damage was done to the server.", color: "ED4245", footer: "L • Antinuke", showTimestamp: true },
  bot_blocked: { title: "Unauthorized Bot Kicked", description: "A bot (**{bot}**) was added by **{executor}** who is not whitelisted to add bots.\nThe bot has been automatically removed.", color: "ED4245", footer: "L • Bot Protection", showTimestamp: true },
  raid_detected: { title: "Raid Detected", description: "A join burst of **{count}** members in **{window}**s was detected.\nPanic mode has been engaged. New joins are being screened.", color: "ED4245", footer: "L • Anti-Raid", showTimestamp: true },
  help_menu: { title: "L — Command Center", description: "Browse every category L protects your server with.", color: "2B2D31", footer: "L • The Antinuke Authority", showTimestamp: false },
  ban_success: { title: "Member Banned", description: "**{user}** has been banned.\n**Reason:** {reason}", color: "ED4245", footer: "L • Moderation", showTimestamp: true },
  kick_success: { title: "Member Kicked", description: "**{user}** has been kicked.\n**Reason:** {reason}", color: "ED4245", footer: "L • Moderation", showTimestamp: true },
  timeout_success: { title: "Member Timed Out", description: "**{user}** was timed out for **{duration}**.", color: "F1C40F", footer: "L • Moderation", showTimestamp: true },
  lock_success: { title: "Channel Locked", description: "{channel} has been locked.", color: "ED4245", footer: "L • Moderation", showTimestamp: true },
  purge_success: { title: "Messages Purged", description: "**{count}** messages were deleted from {channel}.", color: "57F287", footer: "L • Moderation", showTimestamp: true },
  lockdown_enabled: { title: "Server Lockdown Engaged", description: "All text channels have been locked. Only whitelisted roles can send messages.\nUse `/lockdown off` to release.", color: "ED4245", footer: "L • Moderation", showTimestamp: true },
  greet_welcome: { title: "Welcome", description: "Welcome {user} to **{server}**.\nYou are member #{count}.", color: "57F287", footer: "L • Greetings", showTimestamp: true },
  greet_goodbye: { title: "Member Left", description: "**{user}** has left the server.\nWe are now at **{count}** members.", color: "949BA4", footer: "L • Greetings", showTimestamp: true },
  premium_status: { title: "Premium Active", description: "This server has **L Premium** unlocked.\nAll premium commands are available.", color: "F1C40F", footer: "L • Premium", showTimestamp: true },
};

function defaultGuildData() {
  return {
    prefix: config.defaultPrefix,
    premium: config.defaultPremium,
    // Antinuke — now with strict mode (immediate punish) + bot anti-add + anti-raid
    antinuke: {
      enabled: false,
      strict: true, // NEW: ANY destructive action by non-whitelisted -> immediate punish (no threshold wait)
      threshold: config.antinuke.defaultThreshold,
      window: config.antinuke.defaultWindow,
      punishment: config.antinuke.punishment,
      whitelistedUsers: [],
      whitelistedRoles: [],
      extraOwners: [],
      whitelistedBots: [], // NEW: bot IDs allowed to be added to the server
      blockBotAdd: true, // NEW: auto-kick bots added by non-whitelisted users
      antiping: false,
      nukehooks: false,
      antiWebhook: false, // NEW: block webhook creation by non-whitelisted
      antiSpam: false, // NEW: message spam protection
      spamThreshold: 7, // NEW: messages in 5s = spam
    },
    // Anti-raid
    antiRaid: {
      enabled: false,
      joinThreshold: 10, // joins
      joinWindow: 10000, // in ms
      panicMode: false,
      panicUntil: 0,
      action: "kick", // kick | ban | verify
      minAccountAge: 0, // ms; 0 = off
    },
    // Auto-restore
    autoRestore: {
      enabled: true,
      restoreChannels: true,
      restoreRoles: true,
      restoreBans: true,
      restoreWebhooks: true,
      threshold: 3,
      window: 10000,
      logChannelId: null,
    },
    // Automod
    automod: {
      enabled: false,
      antighostping: false,
      whitelistedChannels: [],
      whitelistedRoles: [],
      filters: { invites: false, links: false, spam: false },
    },
    // Logging
    logging: {
      channel: null,
      events: { memberRemove: false, memberBan: false, channelDelete: false, roleDelete: false, messageDelete: false },
    },
    // Welcome
    welcome: { channel: null, goodbyeChannel: null, enabled: false, goodbyeEnabled: false },
    // Leveling
    leveling: { enabled: false, channel: null, xp: {}, ignoreChannels: [] },
    // Embeds (emoji-free, flat for backward compat)
    embeds: JSON.parse(JSON.stringify(DEFAULT_EMBEDS)),
    // AFK
    afk: {},
    // Audit log
    audit: [],
    createdAt: Date.now(),
  };
}

// ===== In-memory cache =====
const cache = new Map();
const dirty = new Set(); // guilds pending a write
let flushTimer = null;
const FLUSH_INTERVAL = 1500; // batch writes every 1.5s

function filePath(guildId) {
  return path.join(DATA_DIR, `${guildId}.json`);
}

function getGuild(guildId) {
  if (cache.has(guildId)) return cache.get(guildId);
  let data;
  try {
    const raw = fs.readFileSync(filePath(guildId), "utf8");
    data = JSON.parse(raw);
    const def = defaultGuildData();
    data = {
      ...def,
      ...data,
      antinuke: { ...def.antinuke, ...(data.antinuke || {}) },
      antiRaid: { ...def.antiRaid, ...(data.antiRaid || {}) },
      autoRestore: { ...def.autoRestore, ...(data.autoRestore || {}) },
      automod: { ...def.automod, ...(data.automod || {}) },
      logging: { ...def.logging, ...(data.logging || {}) },
      welcome: { ...def.welcome, ...(data.welcome || {}) },
      leveling: { ...def.leveling, ...(data.leveling || {}) },
    };
  } catch {
    data = defaultGuildData();
  }
  cache.set(guildId, data);
  return data;
}

// Schedule a debounced write (write-behind). Multiple updates batch into one write.
function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const toWrite = [...dirty];
    dirty.clear();
    for (const gid of toWrite) {
      const data = cache.get(gid);
      if (!data) continue;
      try {
        fs.writeFileSync(filePath(gid), JSON.stringify(data, null, 2));
      } catch (e) {
        console.error("[db] write error", gid, e.message);
      }
    }
  }, FLUSH_INTERVAL);
}

function saveGuild(guildId) {
  dirty.add(guildId);
  scheduleFlush();
}

// Force immediate write (use sparingly — e.g. on shutdown)
function flushNow() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  for (const gid of cache.keys()) {
    const data = cache.get(gid);
    if (!data) continue;
    try {
      fs.writeFileSync(filePath(gid), JSON.stringify(data, null, 2));
    } catch (e) {
      console.error("[db] flush error", gid, e.message);
    }
  }
  dirty.clear();
}

function updateGuild(guildId, fn) {
  const data = getGuild(guildId);
  fn(data);
  saveGuild(guildId);
  return data;
}

function addAudit(guildId, action, actor, detail, severity = "info") {
  updateGuild(guildId, (d) => {
    d.audit.unshift({ action, actor, detail, severity, at: Date.now() });
    if (d.audit.length > 100) d.audit.length = 100;
  });
}

module.exports = {
  getGuild,
  saveGuild,
  updateGuild,
  addAudit,
  flushNow,
  defaultGuildData,
  DEFAULT_EMBEDS,
  DATA_DIR,
};
