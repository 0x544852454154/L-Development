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
    return ctx.reply(payload);
  }
  return ctx.channel.send(payload);
}

// Shorthand helpers
const success = (ctx, guild, detail, vars = {}) => sendEmbed(ctx, "success", guild, { detail, ...vars });
const error = (ctx, guild, detail, vars = {}) => sendEmbed(ctx, "error", guild, { detail, ...vars });
const warn = (ctx, guild, detail, vars = {}) => sendEmbed(ctx, "warn", guild, { detail, ...vars });

// ===== Built-in default embeds (emoji-free, professional) =====
// These double as the source of truth for the category hierarchy.
const DEFAULT_EMBEDS = {
  // --- System / generic ---
  success: { title: "Success", description: "{detail}", color: "57F287", footer: "L", showTimestamp: true },
  error: { title: "Error", description: "{detail}", color: "ED4245", footer: "L", showTimestamp: true },
  warn: { title: "Warning", description: "{detail}", color: "F1C40F", footer: "L", showTimestamp: true },
  info: { title: "Information", description: "{detail}", color: "2B2D31", footer: "L", showTimestamp: true },
  no_perms: { title: "Access Denied", description: "You do not have permission to use this command.", color: "ED4245", footer: "L", showTimestamp: true },
  generic: { title: "L", description: "{detail}", color: "ED4245", footer: "L", showTimestamp: true },

  // --- Antinuke ---
  antinuke_enabled: { title: "Antinuke Shield Activated", description: "The L antinuke shield is now **online**.\nDestructive actions by unauthorized users will be blocked and reverted automatically.", color: "57F287", footer: "L • Antinuke", showTimestamp: true },
  antinuke_disabled: { title: "Antinuke Shield Deactivated", description: "The antinuke shield is now **offline**.\nThis server is no longer protected from nukes.", color: "F1C40F", footer: "L • Antinuke", showTimestamp: true },
  antinuke_triggered: { title: "Threat Neutralized", description: "A destructive action by **{executor}** was detected and **auto-reverted**.\nThe offender has been punished and the damage restored.", color: "ED4245", footer: "L • Antinuke", showTimestamp: true },
  antinuke_blocked: { title: "Action Blocked", description: "An unauthorized **{action}** by **{executor}** was blocked.\nNo damage was done to the server.", color: "ED4245", footer: "L • Antinuke", showTimestamp: true },
  bot_blocked: { title: "Unauthorized Bot Kicked", description: "A bot (**{bot}**) was added by **{executor}** who is not whitelisted to add bots.\nThe bot has been automatically removed.", color: "ED4245", footer: "L • Bot Protection", showTimestamp: true },
  raid_detected: { title: "Raid Detected", description: "A join burst of **{count}** members in **{window}**s was detected.\nPanic mode has been engaged. New joins are being screened.", color: "ED4245", footer: "L • Anti-Raid", showTimestamp: true },

  // --- Info ---
  help_menu: { title: "L — Command Center", description: "Browse every category L protects your server with.", color: "2B2D31", footer: "L • The Antinuke Authority", showTimestamp: false },

  // --- Moderation ---
  ban_success: { title: "Member Banned", description: "**{user}** has been banned.\n**Reason:** {reason}", color: "ED4245", footer: "L • Moderation", showTimestamp: true },
  kick_success: { title: "Member Kicked", description: "**{user}** has been kicked.\n**Reason:** {reason}", color: "ED4245", footer: "L • Moderation", showTimestamp: true },
  timeout_success: { title: "Member Timed Out", description: "**{user}** was timed out for **{duration}**.", color: "F1C40F", footer: "L • Moderation", showTimestamp: true },
  lock_success: { title: "Channel Locked", description: "{channel} has been locked.", color: "ED4245", footer: "L • Moderation", showTimestamp: true },
  purge_success: { title: "Messages Purged", description: "**{count}** messages were deleted from {channel}.", color: "57F287", footer: "L • Moderation", showTimestamp: true },
  lockdown_enabled: { title: "Server Lockdown Engaged", description: "All text channels have been locked. Only whitelisted roles can send messages.\nUse `/lockdown off` to release.", color: "ED4245", footer: "L • Moderation", showTimestamp: true },

  // --- Welcome ---
  greet_welcome: { title: "Welcome", description: "Welcome {user} to **{server}**.\nYou are member #{count}.", color: "57F287", footer: "L • Greetings", showTimestamp: true },
  greet_goodbye: { title: "Member Left", description: "**{user}** has left the server.\nWe are now at **{count}** members.", color: "949BA4", footer: "L • Greetings", showTimestamp: true },

  // --- Premium ---
  premium_status: { title: "Premium Active", description: "This server has **L Premium** unlocked.\nAll premium commands are available.", color: "F1C40F", footer: "L • Premium", showTimestamp: true },
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
