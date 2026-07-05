const { EmbedBuilder } = require("discord.js");
const { getGuild } = require("./database");
const { resolveEmojis } = require("./emojiUtils");

/*
 * L Embed Builder — v4 (combined astryx + Reo-Bot style)
 *
 * Combined aesthetic:
 *  - Dark 0x2B2D31 accent (astryx), red 0xED4245 for danger (Reo-Bot)
 *  - "**__Field__**" underscore-bold rows (Reo-Bot signature)
 *  - Emoji prefixes in titles (astryx + Reo-Bot) — :name: tokens resolve to guild emojis
 *  - Guild icon thumbnail on event/log embeds (Reo-Bot pattern)
 *  - Bot avatar as footer icon (Reo-Bot pattern)
 *  - <t:unix:R> relative timestamps for events (Reo-Bot pattern)
 *  - "-# subtext" small-print footers (astryx pattern)
 *
 * Server emojis: ":name:" tokens resolve to guild custom emojis via resolveEmojis().
 * Controlled by cfg.useServerEmojis (default true).
 *
 * Auto-styling: set cfg.thumbnail="guild" to auto-use the guild icon,
 * cfg.footerIcon="bot" to auto-use the bot avatar. The buildEmbed function
 * accepts a `client` ref so it can access client.user.displayAvatarURL().
 */

let _client = null;
function setClient(client) { _client = client; }

// Replace {placeholders} in a string with values from `vars`
function fill(text, vars = {}) {
  if (!text) return text;
  return text.replace(/\{(\w+)\}/g, (_, key) =>
    vars[key] !== undefined ? String(vars[key]) : `{${key}}`
  );
}

// Relative timestamp tag: <t:unix:R>
function relTimestamp(ts = Date.now()) {
  return `<t:${Math.floor(ts / 1000)}:R>`;
}
// Full timestamp tag: <t:unix:F>
function fullTimestamp(ts = Date.now()) {
  return `<t:${Math.floor(ts / 1000)}:F>`;
}

// Resolve a config object for a given embed key, walking the hierarchy:
// guild.embeds[category][key] -> guild.embeds[key] (flat, legacy) -> built-in default
function resolveConfig(embedKey, guild) {
  const data = getGuild(guild?.id || "0");
  const embeds = data.embeds || {};

  // 1. Category-hierarchical lookup
  for (const cat of Object.keys(CATEGORY_INDEX)) {
    if (CATEGORY_INDEX[cat][embedKey]) {
      const catEmbeds = embeds[cat];
      if (catEmbeds && catEmbeds[embedKey]) return catEmbeds[embedKey];
    }
  }
  // 2. Flat lookup (legacy)
  if (embeds[embedKey]) return embeds[embedKey];
  // 3. Built-in default
  return DEFAULT_EMBEDS[embedKey] || DEFAULT_EMBEDS.generic;
}

// Build a Discord EmbedBuilder from a stored embed config + runtime variables.
function buildEmbed(embedKey, guild, vars = {}) {
  const cfg = resolveConfig(embedKey, guild);
  return buildFromConfig(cfg, guild, vars);
}

// Lower-level: build from an explicit config object.
// Server emojis: ":name:" tokens resolve to guild custom emojis when useServerEmojis !== false.
function buildFromConfig(cfg, guild, vars = {}) {
  const useServerEmojis = cfg.useServerEmojis !== false;
  const resolve = (t) => {
    if (t == null) return null;
    let out = fill(String(t), vars);
    if (useServerEmojis) out = resolveEmojis(out, guild);
    return out;
  };

  const color = parseInt((cfg.color || "ED4245").replace("#", ""), 16);
  const embed = new EmbedBuilder().setColor(color);

  // Author
  if (cfg.authorName) {
    const name = resolve(cfg.authorName);
    if (name) embed.setAuthor({ name });
  }

  // Title (titleEmoji tokens resolve too if present)
  if (cfg.title) {
    let title = resolve(cfg.title);
    if (cfg.titleEmoji) {
      const emoji = resolve(String(cfg.titleEmoji));
      if (emoji) title = `${emoji} ${title}`;
    }
    if (title) embed.setTitle(title);
  }

  // Description
  if (cfg.description) {
    embed.setDescription(resolve(cfg.description));
  }

  // Fields (optional array support)
  if (Array.isArray(cfg.fields)) {
    for (const f of cfg.fields) {
      embed.addFields({
        name: resolve(f.name) || "\u200b",
        value: resolve(f.value) || "\u200b",
        inline: !!f.inline,
      });
    }
  }

  // Thumbnail — supports explicit URL or "guild" (auto guild icon)
  const thumbUrl = cfg.thumbnail === "guild"
    ? (guild?.iconURL ? guild.iconURL({ size: 256 }) : null)
    : (cfg.thumbnailUrl || null);
  if (thumbUrl) {
    try { embed.setThumbnail(thumbUrl); } catch {}
  }

  // Image
  if (cfg.imageUrl) {
    try { embed.setImage(cfg.imageUrl); } catch {}
  }

  // Footer (footerEmoji tokens resolve too if present)
  // footerIcon="bot" auto-uses the bot avatar (Reo-Bot pattern)
  if (cfg.footer || cfg.footerEmoji || cfg.showTimestamp) {
    const emoji = cfg.footerEmoji ? resolve(String(cfg.footerEmoji)) : null;
    const text = cfg.footer ? resolve(cfg.footer) : "";
    const footerText = [emoji, text].filter(Boolean).join(" ");
    const footerObj = {};
    if (footerText) footerObj.text = footerText;
    if (cfg.footerIcon === "bot" && _client?.user) {
      footerObj.iconURL = _client.user.displayAvatarURL();
    }
    if (Object.keys(footerObj).length) embed.setFooter(footerObj);
  }

  if (cfg.showTimestamp) embed.setTimestamp();

  return embed;
}

// Send an embed to a message-based or interaction-based context.
async function sendEmbed(ctx, embedKey, guild, vars = {}, options = {}) {
  const embed = buildEmbed(embedKey, guild, vars);
  const payload = { embeds: [embed], ...options };
  if (typeof ctx.reply === "function") {
    // For Message replies, set failIfNotExists:false so we never crash when
    // the referenced message was deleted (e.g. after a purge).
    // Interactions ignore this option.
    if (ctx.guild !== undefined && ctx.channel) {
      return ctx.reply({ ...payload, failIfNotExists: false });
    }
    return ctx.reply(payload);
  }
  return ctx.channel.send(payload);
}

// Shorthand helpers
const success = (ctx, guild, detail, vars = {}) => sendEmbed(ctx, "success", guild, { detail, ...vars });
const error = (ctx, guild, detail, vars = {}) => sendEmbed(ctx, "error", guild, { detail, ...vars });
const warn = (ctx, guild, detail, vars = {}) => sendEmbed(ctx, "warn", guild, { detail, ...vars });

// ===== Built-in default embeds (combined astryx + Reo-Bot style) =====
// Aesthetic: dark 0x2B2D31 accent, "**__Field__**" underscore-bold rows (Reo-Bot),
// emoji prefixes in titles (astryx/Reo-Bot), guild icon thumbnails on events,
// bot avatar footer icons, <t:unix:R> timestamps.
const DEFAULT_EMBEDS = {
  // --- System / generic ---
  success: { title: "Success", description: "{detail}", color: "57F287", footer: "L • System", footerIcon: "bot", showTimestamp: false },
  error: { title: "Error", description: "{detail}", color: "ED4245", footer: "L • System", footerIcon: "bot", showTimestamp: false },
  warn: { title: "Warning", description: "{detail}", color: "F1C40F", footer: "L • System", footerIcon: "bot", showTimestamp: false },
  info: { title: "Information", description: "{detail}", color: "2B2D31", footer: "L • System", footerIcon: "bot", showTimestamp: false },
  no_perms: { title: "Access Denied", description: "You lack permission to use this command.", color: "ED4245", footer: "L • System", footerIcon: "bot", showTimestamp: false },
  generic: { title: "L", description: "{detail}", color: "2B2D31", footer: "L", footerIcon: "bot", showTimestamp: false },

  // --- Antinuke ---
  antinuke_enabled: { title: "Antinuke Enabled", description: "**__Status__**: Online\n**__Mode__**: Strict\nAll protections are now active.", color: "57F287", footer: "L • Antinuke", footerIcon: "bot", showTimestamp: false },
  antinuke_disabled: { title: "Antinuke Disabled", description: "**__Status__**: Offline\nAll protections are now off.", color: "ED4245", footer: "L • Antinuke", footerIcon: "bot", showTimestamp: false },
  antinuke_triggered: { title: "Antinuke Triggered", description: "**__User__**: {executor}\n**__Action__**: {action}\n**__Result__**: Reverted + offender punished", color: "ED4245", thumbnail: "guild", footer: "L • Antinuke", footerIcon: "bot", showTimestamp: true },
  antinuke_blocked: { title: "Action Blocked", description: "**__User__**: {executor}\n**__Action__**: {action}\n**__Result__**: Blocked, no damage", color: "ED4245", footer: "L • Antinuke", footerIcon: "bot", showTimestamp: false },
  bot_blocked: { title: "Bot Blocked", description: "**__Bot__**: {bot}\n**__Added by__**: {executor}\n**__Result__**: Bot kicked, adder punished", color: "ED4245", footer: "L • Bot Protection", footerIcon: "bot", showTimestamp: false },
  raid_detected: { title: "Raid Detected", description: "**__Joins__**: {count} in {window}s\n**__Result__**: Panic mode engaged", color: "ED4245", thumbnail: "guild", footer: "L • Anti-Raid", footerIcon: "bot", showTimestamp: true },

  // --- Info ---
  help_menu: { title: "All Commands", description: "Use /help <category> to browse a category.", color: "2B2D31", footer: "L • Info", footerIcon: "bot", showTimestamp: false },

  // --- Moderation ---
  ban_success: { title: "Member Banned", description: "**__User__**: {user}\n**__Reason__**: {reason}", color: "ED4245", footer: "L • Moderation", footerIcon: "bot", showTimestamp: false },
  kick_success: { title: "Member Kicked", description: "**__User__**: {user}\n**__Reason__**: {reason}", color: "ED4245", footer: "L • Moderation", footerIcon: "bot", showTimestamp: false },
  timeout_success: { title: "Member Timed Out", description: "**__User__**: {user}\n**__Duration__**: {duration}", color: "F1C40F", footer: "L • Moderation", footerIcon: "bot", showTimestamp: false },
  lock_success: { title: "Channel Locked", description: "**__Channel__**: {channel}", color: "ED4245", footer: "L • Moderation", footerIcon: "bot", showTimestamp: false },
  purge_success: { title: "Messages Purged", description: "**__Count__**: {count}\n**__Channel__**: {channel}", color: "2B2D31", footer: "L • Moderation", footerIcon: "bot", showTimestamp: false },
  lockdown_enabled: { title: "Lockdown Engaged", description: "**__Status__**: All channels locked\nUse /lockdown off to release.", color: "ED4245", footer: "L • Moderation", footerIcon: "bot", showTimestamp: false },

  // --- Welcome ---
  greet_welcome: { title: "Welcome", description: "**__User__**: {user}\n**__Server__**: {server}\n**__Member #__**: {count}", color: "57F287", footer: "L • Welcome", footerIcon: "bot", showTimestamp: false },
  greet_goodbye: { title: "Goodbye", description: "**__User__**: {user}\n**__Members__**: {count}", color: "2B2D31", footer: "L • Welcome", footerIcon: "bot", showTimestamp: false },

  // --- Premium ---
  premium_status: { title: "Premium Active", description: "**__Status__**: Unlocked\nAll premium commands available.", color: "F1C40F", footer: "L • Premium", footerIcon: "bot", showTimestamp: false },
};

// Category index: maps category name -> { embedKey: true } for hierarchical lookup
const CATEGORY_INDEX = {
  System: { success: true, error: true, warn: true, info: true, no_perms: true, generic: true },
  Antinuke: { antinuke_enabled: true, antinuke_disabled: true, antinuke_triggered: true, antinuke_blocked: true, bot_blocked: true, raid_detected: true },
  Info: { help_menu: true },
  Moderation: { ban_success: true, kick_success: true, timeout_success: true, lock_success: true, purge_success: true, lockdown_enabled: true },
  Welcome: { greet_welcome: true, greet_goodbye: true },
  Premium: { premium_status: true },
};

module.exports = {
  buildEmbed,
  buildFromConfig,
  sendEmbed,
  fill,
  success,
  error,
  warn,
  setClient,
  relTimestamp,
  fullTimestamp,
  DEFAULT_EMBEDS,
  CATEGORY_INDEX,
};
