// Resolve :name: emoji tokens against a guild's custom emojis.
// Falls back to the literal token if the emoji isn't found.
function resolveEmojis(text, guild) {
  if (!text || typeof text !== "string") return text;
  if (!guild) return text;
  return text.replace(/:([a-zA-Z0-9_]+):/g, (match, name) => {
    const emoji = guild.emojis.cache.find(
      (e) => e.name.toLowerCase() === name.toLowerCase()
    );
    return emoji ? emoji.toString() : match;
  });
}

// Check whether a token like ":shield:" or "🛡️" refers to a real emoji
function isEmojiToken(text) {
  if (!text) return false;
  if (text.startsWith(":") && text.endsWith(":") && text.length > 2) return true;
  // crude unicode detection
  return /\p{Extended_Pictographic}/u.test(text);
}

module.exports = { resolveEmojis, isEmojiToken };
