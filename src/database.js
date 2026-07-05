const fs = require("fs");
const path = require("path");
const config = require("./config");

const DATA_DIR = path.join(__dirname, "..", "serverdata");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DEFAULT_EMBEDS = {
  // Antinuke
  antinuke_enabled: {
    title: "Antinuke Shield Activated",
    titleEmoji: "🛡️",
    description: "The **L** antinuke shield is now **online**.\nNukes will be detected and reverted automatically.",
    footer: "L • Antinuke System",
    footerEmoji: "👑",
    authorName: "L",
    authorEmoji: "👑",
    color: "ED4245",
    showTimestamp: true,
    useServerEmojis: true,
  },
  antinuke_triggered: {
    title: "Nuke Detected — Auto-Restore Engaged",
    titleEmoji: "💥",
    description: "A mass-destruction event was detected and **auto-reverted**.\nThe responsible account has been quarantined.",
    footer: "L • Threat Neutralized",
    footerEmoji: "♻️",
    authorName: "L",
    authorEmoji: "👑",
    color: "ED4245",
    showTimestamp: true,
    useServerEmojis: true,
  },
  antinuke_disabled: {
    title: "Antinuke Shield Deactivated",
    titleEmoji: "⚠️",
    description: "The antinuke shield is now **offline**.\nThis server is no longer protected from nukes.",
    footer: "L • Antinuke System",
    footerEmoji: "👑",
    color: "F1C40F",
    showTimestamp: true,
    useServerEmojis: true,
  },
  // Info
  help_menu: {
    title: "L — Command Center",
    titleEmoji: "👑",
    description: "Browse every category L protects your server with.\nUse the buttons or reactions below to navigate.",
    footer: "L • The Antinuke Authority",
    footerEmoji: "⚡",
    authorName: "L",
    authorEmoji: "👑",
    color: "2B2D31",
    showTimestamp: false,
    useServerEmojis: true,
  },
  // Moderation
  ban_success: {
    title: "Member Banned",
    titleEmoji: "🔨",
    description: "**{user}** has been banned from the server.\n**Reason:** {reason}",
    footer: "L • Moderation",
    footerEmoji: "🛡️",
    authorName: "L",
    authorEmoji: "👑",
    color: "ED4245",
    showTimestamp: true,
    useServerEmojis: true,
  },
  kick_success: {
    title: "Member Kicked",
    titleEmoji: "👢",
    description: "**{user}** has been kicked.\n**Reason:** {reason}",
    footer: "L • Moderation",
    footerEmoji: "🛡️",
    color: "ED4245",
    showTimestamp: true,
    useServerEmojis: true,
  },
  timeout_success: {
    title: "Member Timed Out",
    titleEmoji: "⏱️",
    description: "**{user}** was timed out for **{duration}**.",
    footer: "L • Moderation",
    footerEmoji: "🛡️",
    color: "F1C40F",
    showTimestamp: true,
    useServerEmojis: true,
  },
  lock_success: {
    title: "Channel Locked",
    titleEmoji: "🔒",
    description: "{channel} has been locked.",
    footer: "L • Moderation",
    footerEmoji: "🛡️",
    color: "ED4245",
    showTimestamp: true,
    useServerEmojis: true,
  },
  purge_success: {
    title: "Messages Purged",
    titleEmoji: "🧹",
    description: "**{count}** messages were deleted from {channel}.",
    footer: "L • Moderation",
    footerEmoji: "🛡️",
    color: "57F287",
    showTimestamp: true,
    useServerEmojis: true,
  },
  // Welcome
  greet_welcome: {
    title: "Welcome to the Server",
    titleEmoji: "👋",
    description: "Welcome {user} to **{server}**!\nYou are member #{count}.",
    footer: "L • Greetings",
    footerEmoji: "❤️",
    authorName: "L",
    authorEmoji: "👑",
    color: "57F287",
    showTimestamp: true,
    useServerEmojis: true,
  },
  greet_goodbye: {
    title: "Member Left",
    titleEmoji: "👋",
    description: "**{user}** has left the server.\nWe're down to **{count}** members.",
    footer: "L • Greetings",
    footerEmoji: "❤️",
    color: "949BA4",
    showTimestamp: true,
    useServerEmojis: true,
  },
  // Premium
  premium_status: {
    title: "Premium Active",
    titleEmoji: "💎",
    description: "This server has **L Premium** unlocked.\nAll premium commands are available.",
    footer: "L • Premium",
    footerEmoji: "👑",
    authorName: "L",
    authorEmoji: "💎",
    color: "F1C40F",
    showTimestamp: true,
    useServerEmojis: true,
  },
  // Generic
  success: {
    title: "Success",
    titleEmoji: "✅",
    description: "{detail}",
    footer: "L",
    footerEmoji: "👑",
    color: "57F287",
    showTimestamp: true,
    useServerEmojis: true,
  },
  error: {
    title: "Error",
    titleEmoji: "❌",
    description: "{detail}",
    footer: "L",
    footerEmoji: "👑",
    color: "ED4245",
    showTimestamp: true,
    useServerEmojis: true,
  },
  warn: {
    title: "Warning",
    titleEmoji: "⚠️",
    description: "{detail}",
    footer: "L",
    footerEmoji: "👑",
    color: "F1C40F",
    showTimestamp: true,
    useServerEmojis: true,
  },
  no_perms: {
    title: "Missing Permissions",
    titleEmoji: "🚫",
    description: "You don't have permission to use this command.",
    footer: "L",
    footerEmoji: "👑",
    color: "ED4245",
    showTimestamp: true,
    useServerEmojis: true,
  },
};

function defaultGuildData() {
  return {
    prefix: config.defaultPrefix,
    premium: config.defaultPremium,
    // Antinuke
    antinuke: {
      enabled: false,
      threshold: config.antinuke.defaultThreshold,
      window: config.antinuke.defaultWindow,
      punishment: config.antinuke.punishment,
      whitelistedUsers: [],
      whitelistedRoles: [],
      extraOwners: [],
      antiping: false,
      nukehooks: false,
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
    welcome: {
      channel: null,
      goodbyeChannel: null,
      enabled: false,
      goodbyeEnabled: false,
    },
    // Leveling
    leveling: {
      enabled: false,
      channel: null,
      xp: {}, // userId -> { xp, level }
      ignoreChannels: [],
    },
    // Embeds (customizable)
    embeds: JSON.parse(JSON.stringify(DEFAULT_EMBEDS)),
    // AFK
    afk: {}, // userId -> { message, since }
    // Audit log
    audit: [],
    createdAt: Date.now(),
  };
}

const cache = new Map();

function filePath(guildId) {
  return path.join(DATA_DIR, `${guildId}.json`);
}

function getGuild(guildId) {
  if (cache.has(guildId)) return cache.get(guildId);
  let data;
  try {
    const raw = fs.readFileSync(filePath(guildId), "utf8");
    data = JSON.parse(raw);
    // Merge missing defaults (for forward-compat)
    const def = defaultGuildData();
    data = { ...def, ...data, antinuke: { ...def.antinuke, ...(data.antinuke || {}) }, autoRestore: { ...def.autoRestore, ...(data.autoRestore || {}) }, automod: { ...def.automod, ...(data.automod || {}) }, logging: { ...def.logging, ...(data.logging || {}) }, welcome: { ...def.welcome, ...(data.welcome || {}) }, leveling: { ...def.leveling, ...(data.leveling || {}) } };
  } catch {
    data = defaultGuildData();
  }
  cache.set(guildId, data);
  return data;
}

function saveGuild(guildId) {
  const data = cache.get(guildId);
  if (!data) return;
  try {
    fs.writeFileSync(filePath(guildId), JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("[db] save error", e);
  }
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

module.exports = { getGuild, saveGuild, updateGuild, addAudit, defaultGuildData, DEFAULT_EMBEDS, DATA_DIR };
