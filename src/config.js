require("dotenv").config();

module.exports = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  ownerId: process.env.OWNER_ID,
  defaultPrefix: process.env.DEFAULT_PREFIX || "!",
  defaultPremium: String(process.env.DEFAULT_PREMIUM).toLowerCase() === "true",

  // Branding
  name: "L",
  tagline: "The Antinuke Authority",
  color: 0xed4245,

  // Antinuke defaults
  antinuke: {
    defaultThreshold: 3,
    defaultWindow: 10000, // 10 seconds in ms
    punishment: "ban", // ban | kick | strip
  },

  // The full command catalog — used by the help menu and embed customizer
  categories: [
    {
      name: "Antinuke",
      emoji: "🛡️",
      blurb: "Neutralize nukes before they land. Auto-restore, whitelists, anti-ping & webhooks.",
      commands: ["antinuke", "antiping", "extraowner", "init", "multiwhitelist", "nukehooks", "whitelist"],
    },
    {
      name: "Automod",
      emoji: "🤖",
      blurb: "Auto-moderation filters, ghost-ping defense and automod whitelists.",
      commands: ["antighostping", "automod", "automodwhitelist"],
    },
    {
      name: "Info",
      emoji: "ℹ️",
      blurb: "Core utility info — help menu, invite link, latency and uptime.",
      commands: ["help", "invite", "ping", "uptime"],
    },
    {
      name: "Leveling",
      emoji: "🏆",
      blurb: "XP, ranks and a live leaderboard for your community.",
      commands: ["leaderboard", "leveling", "rank"],
    },
    {
      name: "Logging",
      emoji: "📜",
      blurb: "Comprehensive event logging to a channel of your choice.",
      commands: ["logging"],
    },
    {
      name: "Moderation",
      emoji: "⚖️",
      blurb: "Full moderation suite — bans, kicks, timeouts, locks, purge & roles.",
      commands: ["ban", "hardban", "hide", "hideall", "kick", "list", "lock", "lockall", "timeout", "nickname", "purge", "purgebots", "role", "steal", "unban", "unhide", "unhideall", "unlock", "unlockall", "untimeout"],
    },
    {
      name: "Premium",
      emoji: "👑",
      blurb: "Premium-only power tools: anti-alt, mass roles, server identity & more.",
      commands: ["antialt", "autorole", "boosterrole", "massrole", "massunban", "premium", "resetserveravatar", "resetserverbanner", "resetserverbio", "setserveravatar", "setserverbanner", "setserverbio"],
    },
    {
      name: "Util",
      emoji: "🔧",
      blurb: "Everyday utilities — AFK, avatars, definitions, server info and more.",
      commands: ["afk", "ask", "avatar", "banner", "define", "membercount", "nuke", "prefix", "report", "serverinfo", "stats", "userinfo"],
    },
    {
      name: "Welcome",
      emoji: "🚪",
      blurb: "Greet new members with fully customizable welcome embeds.",
      commands: ["greet"],
    },
  ],
};
