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

  // Antinuke defaults — strict mode ON by default for maximum security
  antinuke: {
    defaultThreshold: 3,
    defaultWindow: 10000,
    punishment: "ban",
    strict: true, // ANY destructive action by non-whitelisted = immediate punish
  },

  // The full command catalog — used by the help menu and embed customizer
  categories: [
    {
      name: "Antinuke",
      blurb: "Strict antinuke shield, auto-restore, whitelists, anti-ping, bot anti-add, anti-raid, anti-spam & anti-webhook.",
      commands: ["antinuke", "antiping", "extraowner", "init", "multiwhitelist", "nukehooks", "whitelist", "strictmode", "botwhitelist", "antiraid", "panic", "recover", "antiwebhook", "antispam"],
    },
    {
      name: "Automod",
      blurb: "Auto-moderation filters, ghost-ping defense and automod whitelists.",
      commands: ["antighostping", "automod", "automodwhitelist"],
    },
    {
      name: "Info",
      blurb: "Core utility info — help menu, invite link, latency and uptime.",
      commands: ["help", "invite", "ping", "uptime"],
    },
    {
      name: "Leveling",
      blurb: "XP, ranks and a live leaderboard for your community.",
      commands: ["leaderboard", "leveling", "rank"],
    },
    {
      name: "Logging",
      blurb: "Comprehensive event logging to a channel of your choice.",
      commands: ["logging"],
    },
    {
      name: "Moderation",
      blurb: "Full moderation suite — bans, kicks, timeouts, locks, purge, roles, lockdown & slowmode.",
      commands: ["ban", "hardban", "hide", "hideall", "kick", "list", "lock", "lockall", "timeout", "nickname", "purge", "purgebots", "role", "steal", "unban", "unhide", "unhideall", "unlock", "unlockall", "untimeout", "lockdown", "slowmode", "roleall"],
    },
    {
      name: "Premium",
      blurb: "Premium-only power tools: anti-alt, mass roles, server identity & more.",
      commands: ["antialt", "autorole", "boosterrole", "massrole", "massunban", "premium", "resetserveravatar", "resetserverbanner", "resetserverbio", "setserveravatar", "setserverbanner", "setserverbio"],
    },
    {
      name: "Util",
      blurb: "Everyday utilities — AFK, avatars, definitions, server info and more.",
      commands: ["afk", "ask", "avatar", "banner", "define", "membercount", "nuke", "prefix", "report", "serverinfo", "stats", "userinfo"],
    },
    {
      name: "Welcome",
      blurb: "Greet new members with fully customizable welcome embeds.",
      commands: ["greet"],
    },
    {
      name: "Embeds",
      blurb: "Customize every embed the bot sends — emoji-free, per-server, per-category.",
      commands: ["embed"],
    },
  ],
};
