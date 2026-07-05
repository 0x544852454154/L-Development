const { EmbedBuilder } = require("discord.js");
const { getGuild } = require("./database");
const { resolveEmojis } = require("./emojiUtils");

// Replace {placeholders} in a string with values from `vars`
function fill(text, vars = {}) {
  if (!text) return text;
  return text.replace(/\{(\w+)\}/g, (_, key) => (vars[key] !== undefined ? String(vars[key]) : `{${key}}`));
}

// Build a Discord EmbedBuilder from a stored embed config + runtime variables.
// embedKey: the key into guild.embeds (e.g. "ban_success")
// guild:    the discord.js Guild (for emoji resolution)
// vars:     { user, server, count, reason, channel, ... }
function buildEmbed(embedKey, guild, vars = {}) {
  const data = getGuild(guild?.id || "0");
  let cfg = (data.embeds || {})[embedKey];
  if (!cfg) {
    // Fallback to a generic success embed
    cfg = (data.embeds || {}).success || { title: embedKey, color: "ED4245", showTimestamp: true, useServerEmojis: true };
  }
  return buildFromConfig(cfg, guild, vars);
}

// Lower-level: build from an explicit config object
function buildFromConfig(cfg, guild, vars = {}) {
  const useServerEmojis = cfg.useServerEmojis !== false;
  const resolve = (t) => {
    let out = fill(t, vars);
    if (useServerEmojis) out = resolveEmojis(out, guild);
    return out;
  };

  const color = parseInt((cfg.color || "ED4245").replace("#", ""), 16);
  const embed = new EmbedBuilder().setColor(color);

  // Author
  if (cfg.authorName || cfg.authorEmoji) {
    const name = cfg.authorName ? resolve(String(cfg.authorName)) : "";
    const emoji = cfg.authorEmoji ? resolve(String(cfg.authorEmoji)) : null;
    embed.setAuthor({ name: name || "L", iconURL: undefined });
    // Note: author emoji is inline text since Discord authors don't support
    // custom emoji separately — we prepend it to the name when present.
    if (emoji) {
      embed.data.author.name = `${emoji} ${name}`.trim();
    }
  }

  // Title
  if (cfg.title) {
    const emoji = cfg.titleEmoji ? resolve(String(cfg.titleEmoji)) : null;
    const title = resolve(String(cfg.title));
    embed.setTitle(emoji ? `${emoji} ${title}` : title);
  }

  // Description
  if (cfg.description) {
    embed.setDescription(resolve(String(cfg.description)));
  }

  // Thumbnail
  if (cfg.thumbnailUrl) {
    try { embed.setThumbnail(cfg.thumbnailUrl); } catch {}
  }

  // Image
  if (cfg.imageUrl) {
    try { embed.setImage(cfg.imageUrl); } catch {}
  }

  // Footer
  if (cfg.footer || cfg.footerEmoji || cfg.showTimestamp) {
    const emoji = cfg.footerEmoji ? resolve(String(cfg.footerEmoji)) : null;
    const text = cfg.footer ? resolve(String(cfg.footer)) : "";
    const footerText = [emoji, text].filter(Boolean).join(" ");
    if (footerText) embed.setFooter({ text: footerText });
  }

  if (cfg.showTimestamp) embed.setTimestamp();

  return embed;
}

// Send an embed to a message-based or interaction-based context.
// `ctx` is a discord.js Message or interaction with `.channel.send` or `.reply`.
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

module.exports = { buildEmbed, buildFromConfig, sendEmbed, fill, success, error, warn };
