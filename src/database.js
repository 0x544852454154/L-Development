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

// Combined astryx + Reo-Bot style embeds (mirrors embedBuilder.DEFAULT_EMBEDS)
const DEFAULT_EMBEDS = {
  success: { title: "Success", description: "{detail}", color: "57F287", footer: "L • System", footerIcon: "bot", showTimestamp: false },
  error: { title: "Error", description: "{detail}", color: "ED4245", footer: "L • System", footerIcon: "bot", showTimestamp: false },
  warn: { title: "Warning", description: "{detail}", color: "F1C40F", footer: "L • System", footerIcon: "bot", showTimestamp: false },
  info: { title: "Information", description: "{detail}", color: "2B2D31", footer: "L • System", footerIcon: "bot", showTimestamp: false },
  no_perms: { title: "Access Denied", description: "You lack permission to use this command.", color: "ED4245", footer: "L • System", footerIcon: "bot", showTimestamp: false },
  generic: { title: "L", description: "{detail}", color: "2B2D31", footer: "L", footerIcon: "bot", showTimestamp: false },
  antinuke_enabled: { title: "Antinuke Enabled", description: "**__Status__**: Online\n**__Mode__**: Strict\nAll protections are now active.", color: "57F287", footer: "L • Antinuke", footerIcon: "bot", showTimestamp: false },
  antinuke_disabled: { title: "Antinuke Disabled", description: "**__Status__**: Offline\nAll protections are now off.", color: "ED4245", footer: "L • Antinuke", footerIcon: "bot", showTimestamp: false },
  antinuke_triggered: { title: "Antinuke Triggered", description: "**__User__**: {executor}\n**__Action__**: {action}\n**__Result__**: Reverted + offender punished", color: "ED4245", thumbnail: "guild", footer: "L • Antinuke", footerIcon: "bot", showTimestamp: true },
  antinuke_blocked: { title: "Action Blocked", description: "**__User__**: {executor}\n**__Action__**: {action}\n**__Result__**: Blocked, no damage", color: "ED4245", footer: "L • Antinuke", footerIcon: "bot", showTimestamp: false },
  bot_blocked: { title: "Bot Blocked", description: "**__Bot__**: {bot}\n**__Added by__**: {executor}\n**__Result__**: Bot kicked, adder punished", color: "ED4245", footer: "L • Bot Protection", footerIcon: "bot", showTimestamp: false },
  raid_detected: { title: "Raid Detected", description: "**__Joins__**: {count} in {window}s\n**__Result__**: Panic mode engaged", color: "ED4245", thumbnail: "guild", footer: "L • Anti-Raid", footerIcon: "bot", showTimestamp: true },
  help_menu: { title: "All Commands", description: "Use /help <category> to browse a category.", color: "2B2D31", footer: "L • Info", footerIcon: "bot", showTimestamp: false },
  ban_success: { title: "Member Banned", description: "**__User__**: {user}\n**__Reason__**: {reason}", color: "ED4245", footer: "L • Moderation", footerIcon: "bot", showTimestamp: false },
  kick_success: { title: "Member Kicked", description: "**__User__**: {user}\n**__Reason__**: {reason}", color: "ED4245", footer: "L • Moderation", footerIcon: "bot", showTimestamp: false },
  timeout_success: { title: "Member Timed Out", description: "**__User__**: {user}\n**__Duration__**: {duration}", color: "F1C40F", footer: "L • Moderation", footerIcon: "bot", showTimestamp: false },
  lock_success: { title: "Channel Locked", description: "**__Channel__**: {channel}", color: "ED4245", footer: "L • Moderation", footerIcon: "bot", showTimestamp: false },
  purge_success: { title: "Messages Purged", description: "**__Count__**: {count}\n**__Channel__**: {channel}", color: "2B2D31", footer: "L • Moderation", footerIcon: "bot", showTimestamp: false },
  lockdown_enabled: { title: "Lockdown Engaged", description: "**__Status__**: All channels locked\nUse /lockdown off to release.", color: "ED4245", footer: "L • Moderation", footerIcon: "bot", showTimestamp: false },
  greet_welcome: { title: "Welcome", description: "**__User__**: {user}\n**__Server__**: {server}\n**__Member #__**: {count}", color: "57F287", footer: "L • Welcome", footerIcon: "bot", showTimestamp: false },
  greet_goodbye: { title: "Goodbye", description: "**__User__**: {user}\n**__Members__**: {count}", color: "2B2D31", footer: "L • Welcome", footerIcon: "bot", showTimestamp: false },
  premium_status: { title: "Premium Active", description: "**__Status__**: Unlocked\nAll premium commands available.", color: "F1C40F", footer: "L • Premium", footerIcon: "bot", showTimestamp: false },
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
    // Server identity lock — snapshot of the protected name/icon/description/vanity.
    // Any unauthorized change to these is reverted to the snapshot.
    serverIdentity: { name: null, iconUrl: null, description: null, vanity: null, locked: false },
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
