const { EmbedBuilder } = require("discord.js");
const { getGuild } = require("./database");

/*
 * L Embed Builder — v2 (emoji-free, category-hierarchical)
 *
 * Design goals:
 *  - NO emojis in any embed by default. Clean, professional, security-tool aesthetic.
 *  - The builder IGNORES any legacy emoji fields (titleEmoji/footerEmoji/authorEmoji)
 *    so existing command files keep working but render emoji-free automatically.
 *  - Embeds are organized by category: embeds[category][key] for a cleaner hierarchy.
 *  - Flat-key lookup (embeds["ban_success"]) still works for backward compatibility.
 *  - Per-guild overrides fall back to category defaults, then to global defaults.
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
// Emoji fields are intentionally IGNORED to enforce the emoji-free design.
function buildFromConfig(cfg, guild, vars = {}) {
  const resolve = (t) => (t == null ? null : fill(String(t), vars));

  const color = parseInt((cfg.color || "ED4245").replace("#", ""), 16);
  const embed = new EmbedBuilder().setColor(color);

  // Author (emoji-free)
  if (cfg.authorName) {
    const name = resolve(cfg.authorName);
    if (name) embed.setAuthor({ name });
  }

  // Title (emoji-free — titleEmoji deliberately ignored)
  if (cfg.title) {
    const title = resolve(cfg.title);
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

  // Footer (emoji-free — footerEmoji deliberately ignored)
  if (cfg.footer || cfg.showTimestamp) {
    const text = cfg.footer ? resolve(cfg.footer) : "";
    if (text) embed.setFooter({ text });
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

// ===== Built-in default embeds (minimal, clean, emoji-free) =====
// Design: short title, 1-2 line description, simple footer, consistent dark color.
// No walls of text. No emojis. Easy to scan.
const DEFAULT_EMBEDS = {
  // --- System / generic ---
  success: { title: "Success", description: "{detail}", color: "57F287", footer: "L", showTimestamp: false },
  error: { title: "Error", description: "{detail}", color: "ED4245", footer: "L", showTimestamp: false },
  warn: { title: "Warning", description: "{detail}", color: "F1C40F", footer: "L", showTimestamp: false },
  info: { title: "Information", description: "{detail}", color: "2B2D31", footer: "L", showTimestamp: false },
  no_perms: { title: "Access Denied", description: "You lack permission to use this command.", color: "ED4245", footer: "L", showTimestamp: false },
  generic: { title: "L", description: "{detail}", color: "2B2D31", footer: "L", showTimestamp: false },

  // --- Antinuke ---
  antinuke_enabled: { title: "Antinuke Enabled", description: "All protections are now active.", color: "57F287", footer: "L", showTimestamp: false },
  antinuke_disabled: { title: "Antinuke Disabled", description: "All protections are now off.", color: "ED4245", footer: "L", showTimestamp: false },
  antinuke_triggered: { title: "Threat Neutralized", description: "{action} by {executor} was reverted.", color: "ED4245", footer: "L", showTimestamp: true },
  antinuke_blocked: { title: "Action Blocked", description: "{action} by {executor} was blocked.", color: "ED4245", footer: "L", showTimestamp: false },
  bot_blocked: { title: "Bot Blocked", description: "{bot} added by {executor} was kicked.", color: "ED4245", footer: "L", showTimestamp: false },
  raid_detected: { title: "Raid Detected", description: "{count} joins in {window}s. Panic mode engaged.", color: "ED4245", footer: "L", showTimestamp: true },

  // --- Info ---
  help_menu: { title: "All Commands", description: "Use /help <category> to browse a category.", color: "2B2D31", footer: "L", showTimestamp: false },

  // --- Moderation ---
  ban_success: { title: "Member Banned", description: "{user} — {reason}", color: "ED4245", footer: "L", showTimestamp: false },
  kick_success: { title: "Member Kicked", description: "{user} — {reason}", color: "ED4245", footer: "L", showTimestamp: false },
  timeout_success: { title: "Member Timed Out", description: "{user} for {duration}", color: "F1C40F", footer: "L", showTimestamp: false },
  lock_success: { title: "Channel Locked", description: "{channel}", color: "ED4245", footer: "L", showTimestamp: false },
  purge_success: { title: "Messages Purged", description: "{count} messages in {channel}", color: "57F287", footer: "L", showTimestamp: false },
  lockdown_enabled: { title: "Lockdown Engaged", description: "All channels locked. Use /lockdown off to release.", color: "ED4245", footer: "L", showTimestamp: false },

  // --- Welcome ---
  greet_welcome: { title: "Welcome", description: "{user} joined {server}.\nMember #{count}", color: "57F287", footer: "L", showTimestamp: false },
  greet_goodbye: { title: "Goodbye", description: "{user} left.\n{count} members", color: "949BA4", footer: "L", showTimestamp: false },

  // --- Premium ---
  premium_status: { title: "Premium Active", description: "All premium commands unlocked.", color: "F1C40F", footer: "L", showTimestamp: false },
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
