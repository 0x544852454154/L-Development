const { EmbedBuilder } = require("discord.js");
const { getGuild } = require("./database");
const { resolveEmojis } = require("./emojiUtils");

/*
 * L Embed Builder — v3 (Melon-inspired + server emoji support)
 *
 * Aesthetic: dark 0x2B2D31 accent, "**Label:** value" sectioned rows, minimal.
 * Server emojis: ":name:" tokens in any text field are resolved to the guild's
 * custom emojis via resolveEmojis(). Controlled by cfg.useServerEmojis (default true).
 * Set useServerEmojis:false on a config to render emoji tokens literally.
 */

// Replace {placeholders} in a string with values from `vars`
function fill(text, vars = {}) {
  if (!text) return text;
  return text.replace(/\{(\w+)\}/g, (_, key) =>
    vars[key] !== undefined ? String(vars[key]) : `{${key}}`
  );
}

// Minimal markdown: **bold** and *italic* and `code` are passed through to Discord
// natively, so we only do placeholder substitution here.

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

  // Thumbnail
  if (cfg.thumbnailUrl) {
    try { embed.setThumbnail(cfg.thumbnailUrl); } catch {}
  }

  // Image
  if (cfg.imageUrl) {
    try { embed.setImage(cfg.imageUrl); } catch {}
  }

  // Footer (footerEmoji tokens resolve too if present)
  if (cfg.footer || cfg.footerEmoji || cfg.showTimestamp) {
    const emoji = cfg.footerEmoji ? resolve(String(cfg.footerEmoji)) : null;
    const text = cfg.footer ? resolve(cfg.footer) : "";
    const footerText = [emoji, text].filter(Boolean).join(" ");
    if (footerText) embed.setFooter({ text: footerText });
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

// ===== Built-in default embeds (Melon-inspired: dark, sectioned, minimal) =====
// Aesthetic: 0x2B2D31 dark accent, "### Title" headers, "**Label:** value" rows,
// <t:UNIX:F> timestamps, "-# subtext" footers. No emojis. Monochrome.
const DEFAULT_EMBEDS = {
  // --- System / generic ---
  success: { title: "Success", description: "{detail}", color: "2B2D31", footer: "L", showTimestamp: false },
  error: { title: "Error", description: "{detail}", color: "ED4245", footer: "L", showTimestamp: false },
  warn: { title: "Warning", description: "{detail}", color: "F1C40F", footer: "L", showTimestamp: false },
  info: { title: "Information", description: "{detail}", color: "2B2D31", footer: "L", showTimestamp: false },
  no_perms: { title: "Access Denied", description: "You lack permission to use this command.", color: "ED4245", footer: "L", showTimestamp: false },
  generic: { title: "L", description: "{detail}", color: "2B2D31", footer: "L", showTimestamp: false },

  // --- Antinuke ---
  antinuke_enabled: { title: "Antinuke Enabled", description: "**Status:** Online\n**Mode:** Strict\nAll protections are now active.", color: "2B2D31", footer: "L", showTimestamp: false },
  antinuke_disabled: { title: "Antinuke Disabled", description: "**Status:** Offline\nAll protections are now off.", color: "ED4245", footer: "L", showTimestamp: false },
  antinuke_triggered: { title: "Antinuke Triggered", description: "**User:** {executor}\n**Action:** {action}\n**Result:** Reverted + offender punished", color: "ED4245", footer: "L", showTimestamp: true },
  antinuke_blocked: { title: "Action Blocked", description: "**User:** {executor}\n**Action:** {action}\n**Result:** Blocked, no damage", color: "ED4245", footer: "L", showTimestamp: false },
  bot_blocked: { title: "Bot Blocked", description: "**Bot:** {bot}\n**Added by:** {executor}\n**Result:** Bot kicked, adder punished", color: "ED4245", footer: "L", showTimestamp: false },
  raid_detected: { title: "Raid Detected", description: "**Joins:** {count} in {window}s\n**Result:** Panic mode engaged", color: "ED4245", footer: "L", showTimestamp: true },

  // --- Info ---
  help_menu: { title: "All Commands", description: "Use /help <category> to browse a category.", color: "2B2D31", footer: "L", showTimestamp: false },

  // --- Moderation ---
  ban_success: { title: "Member Banned", description: "**User:** {user}\n**Reason:** {reason}", color: "ED4245", footer: "L", showTimestamp: false },
  kick_success: { title: "Member Kicked", description: "**User:** {user}\n**Reason:** {reason}", color: "ED4245", footer: "L", showTimestamp: false },
  timeout_success: { title: "Member Timed Out", description: "**User:** {user}\n**Duration:** {duration}", color: "F1C40F", footer: "L", showTimestamp: false },
  lock_success: { title: "Channel Locked", description: "**Channel:** {channel}", color: "ED4245", footer: "L", showTimestamp: false },
  purge_success: { title: "Messages Purged", description: "**Count:** {count}\n**Channel:** {channel}", color: "2B2D31", footer: "L", showTimestamp: false },
  lockdown_enabled: { title: "Lockdown Engaged", description: "**Status:** All channels locked\nUse /lockdown off to release.", color: "ED4245", footer: "L", showTimestamp: false },

  // --- Welcome ---
  greet_welcome: { title: "Welcome", description: "**User:** {user}\n**Server:** {server}\n**Member #:** {count}", color: "2B2D31", footer: "L", showTimestamp: false },
  greet_goodbye: { title: "Goodbye", description: "**User:** {user}\n**Members:** {count}", color: "2B2D31", footer: "L", showTimestamp: false },

  // --- Premium ---
  premium_status: { title: "Premium Active", description: "**Status:** Unlocked\nAll premium commands available.", color: "F1C40F", footer: "L", showTimestamp: false },
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
  DEFAULT_EMBEDS,
  CATEGORY_INDEX,
};
