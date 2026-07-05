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

// Minimal, clean, emoji-free default embeds (mirrors embedBuilder.DEFAULT_EMBEDS)
const DEFAULT_EMBEDS = {
  success: { title: "Success", description: "{detail}", color: "57F287", footer: "L", showTimestamp: false },
  error: { title: "Error", description: "{detail}", color: "ED4245", footer: "L", showTimestamp: false },
  warn: { title: "Warning", description: "{detail}", color: "F1C40F", footer: "L", showTimestamp: false },
  info: { title: "Information", description: "{detail}", color: "2B2D31", footer: "L", showTimestamp: false },
  no_perms: { title: "Access Denied", description: "You lack permission to use this command.", color: "ED4245", footer: "L", showTimestamp: false },
  generic: { title: "L", description: "{detail}", color: "2B2D31", footer: "L", showTimestamp: false },
  antinuke_enabled: { title: "Antinuke Enabled", description: "All protections are now active.", color: "57F287", footer: "L", showTimestamp: false },
  antinuke_disabled: { title: "Antinuke Disabled", description: "All protections are now off.", color: "ED4245", footer: "L", showTimestamp: false },
  antinuke_triggered: { title: "Threat Neutralized", description: "{action} by {executor} was reverted.", color: "ED4245", footer: "L", showTimestamp: true },
  antinuke_blocked: { title: "Action Blocked", description: "{action} by {executor} was blocked.", color: "ED4245", footer: "L", showTimestamp: false },
  bot_blocked: { title: "Bot Blocked", description: "{bot} added by {executor} was kicked.", color: "ED4245", footer: "L", showTimestamp: false },
  raid_detected: { title: "Raid Detected", description: "{count} joins in {window}s. Panic mode engaged.", color: "ED4245", footer: "L", showTimestamp: true },
  help_menu: { title: "All Commands", description: "Use /help <category> to browse a category.", color: "2B2D31", footer: "L", showTimestamp: false },
  ban_success: { title: "Member Banned", description: "{user} — {reason}", color: "ED4245", footer: "L", showTimestamp: false },
  kick_success: { title: "Member Kicked", description: "{user} — {reason}", color: "ED4245", footer: "L", showTimestamp: false },
  timeout_success: { title: "Member Timed Out", description: "{user} for {duration}", color: "F1C40F", footer: "L", showTimestamp: false },
  lock_success: { title: "Channel Locked", description: "{channel}", color: "ED4245", footer: "L", showTimestamp: false },
  purge_success: { title: "Messages Purged", description: "{count} messages in {channel}", color: "57F287", footer: "L", showTimestamp: false },
  lockdown_enabled: { title: "Lockdown Engaged", description: "All channels locked. Use /lockdown off to release.", color: "ED4245", footer: "L", showTimestamp: false },
  greet_welcome: { title: "Welcome", description: "{user} joined {server}.\nMember #{count}", color: "57F287", footer: "L", showTimestamp: false },
  greet_goodbye: { title: "Goodbye", description: "{user} left.\n{count} members", color: "949BA4", footer: "L", showTimestamp: false },
  premium_status: { title: "Premium Active", description: "All premium commands unlocked.", color: "F1C40F", footer: "L", showTimestamp: false },
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
    // Server identity lock — snapshot of the protected name/icon/description.
    // Any unauthorized change to these is reverted to the snapshot.
    serverIdentity: { name: null, iconUrl: null, description: null, locked: false },
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
      serverIdentity: { ...def.serverIdentity, ...(data.serverIdentity || {}) },
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
