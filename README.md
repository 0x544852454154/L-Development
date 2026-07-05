# L — The Antinuke Authority (v2)

A Discord antinuke bot with **strict-mode auto-restore**, **bot anti-add**, **anti-raid**, **anti-spam**, **emoji-free customizable embeds**, and **74 commands** across 10 categories. Optimized with audit-log caching and write-behind DB.

> L is justice.

---

## What's new in v2 (major security + performance upgrade)

- **Strict mode (default ON):** ANY single destructive action by a non-whitelisted user = immediate punishment + auto-restore. No more waiting for a threshold to be crossed. One channel delete by a rogue admin = instant ban + channel restored.
- **Bot anti-add:** when a non-whitelisted user adds a bot to the server, the bot is auto-kicked instantly. A bot whitelist (`/botwhitelist`) allows specific bots.
- **Anti-raid:** detects join bursts and engages panic mode (auto-kick/ban new joins for 5 minutes).
- **Anti-spam:** per-user message rate limiting with configurable threshold.
- **Anti-webhook:** blocks webhook creation by non-whitelisted users.
- **Emoji-free embeds:** all embeds are now clean and professional — no emojis. The embed builder ignores legacy emoji fields, so every command is automatically emoji-free.
- **Better embed hierarchy:** embeds are organized by category with a 3-tier fallback (guild category override -> guild flat override -> built-in default).
- **100x optimization:** audit-log fetch cache (one API call per guild per 4s instead of one per event), write-behind DB (batched disk writes), in-memory config cache, concurrent-fetch deduplication.
- **10 new commands:** `strictmode`, `botwhitelist`, `antiraid`, `panic`, `recover`, `antiwebhook`, `antispam`, `lockdown`, `slowmode`, `roleall`.

---

## Features

- **Antinuke Shield** — strict or threshold mode. Detects mass channel/role deletions, mass unbans, webhook spam, channel-creation spam, and unauthorized bot additions.
- **Auto-Restore** — re-creates deleted channels (with overwrites & topic), roles (with permissions), re-applies mass-unbans, restores webhooks. In strict mode, restores immediately on any unauthorized deletion.
- **Customizable Embeds (emoji-free)** — every response uses a customizable embed. Edit titles, descriptions, colors, footers, and images with `/embed`. Per-server, per-category hierarchy.
- **Multi-Server** — each guild gets its own config, prefix, embeds, and whitelist.

---

## Quick Start

### 1. Prerequisites
- [Node.js](https://nodejs.org/) v18+
- A Discord bot application — <https://discord.com/developers/applications>

### 2. Install
```bash
cd l-antinuke-bot
npm install
```

### 3. Configure
```bash
cp .env.example .env
```
Edit `.env`:
```
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_bot_client_id
OWNER_ID=your_discord_user_id
DEFAULT_PREFIX=!
```

### 4. Register Slash Commands
```bash
npm run deploy
```

### 5. Invite the Bot
Developer Portal -> OAuth2 -> URL Generator -> select `bot` + `applications.commands` -> `Administrator` permission -> visit URL.

### 6. Run
```bash
npm start
# or: npm run dev   (auto-restart on file changes)
```

---

## Security Setup (the important part)

### Recommended lockdown sequence
```
/init                  -> initialize L with safe defaults (strict mode ON, auto-restore ON)
/antinuke on           -> arm the shield
/strictmode on         -> confirm strict mode (immediate punish on ANY unauthorized deletion)
/botwhitelist add <botid>  -> whitelist your trusted bots (L itself, music bot, etc.)
/antiraid on           -> enable join-burst raid detection
/antispam on           -> enable message spam protection
/antiwebhook on        -> block unauthorized webhook creation
/whitelist add role @Admins  -> exempt your trusted admins
```

Now your server is locked down:
- Any non-whitelisted user who deletes a channel/role = **instantly banned + the channel/role is restored**.
- Any non-whitelisted user who adds a bot = **the bot is instantly kicked + the adder is punished**.
- A raid (10 joins in 10s) = **panic mode engages, new joins auto-kicked for 5 min**.

### Strict mode vs threshold mode
- **Strict (default, recommended):** one unauthorized deletion = immediate punishment + restore. Maximum security.
- **Threshold:** waits for N deletions in M seconds before acting. More tolerant (use `/strictmode off` + `/antinuke threshold 3`).

### Whitelisting
- `/whitelist add user @Admin` — exempt a user from antinuke
- `/whitelist add role @Staff` — exempt a role
- `/extraowner add @CoOwner` — add a co-owner (full bypass)
- `/botwhitelist add <botId>` — allow a specific bot to be added

---

## Customizing Embeds (emoji-free)

```
/embed list              -> see all editable embeds
/embed edit ban_success  -> open the interactive editor (modal)
/embed view greet_welcome -> preview an embed
/embed reset help_menu   -> reset to default
```

The editor supports:
- **Title, description, footer, author, color, thumbnail, image** (no emoji fields — clean design)
- **Markdown:** `**bold**`, `*italic*`, `` `code` ``, line breaks
- **Placeholders:** `{user}`, `{server}`, `{count}`, `{reason}`, `{channel}`, `{detail}`, `{executor}`, `{action}`, `{duration}`, `{bot}`

---

## All Commands (74)

| Category | Commands |
|---|---|
| **Antinuke** (14) | `antinuke` `antiping` `extraowner` `init` `multiwhitelist` `nukehooks` `whitelist` `strictmode` `botwhitelist` `antiraid` `panic` `recover` `antiwebhook` `antispam` |
| **Automod** (3) | `antighostping` `automod` `automodwhitelist` |
| **Info** (4) | `help` `invite` `ping` `uptime` |
| **Leveling** (3) | `leaderboard` `leveling` `rank` |
| **Logging** (1) | `logging` |
| **Moderation** (23) | `ban` `hardban` `hide` `hideall` `kick` `list` `lock` `lockall` `timeout` `nickname` `purge` `purgebots` `role` `steal` `unban` `unhide` `unhideall` `unlock` `unlockall` `untimeout` `lockdown` `slowmode` `roleall` |
| **Premium** (12) | `antialt` `autorole` `boosterrole` `massrole` `massunban` `premium` `resetserveravatar` `resetserverbanner` `resetserverbio` `setserveravatar` `setserverbanner` `setserverbio` |
| **Util** (12) | `afk` `ask` `avatar` `banner` `define` `membercount` `nuke` `prefix` `report` `serverinfo` `stats` `userinfo` |
| **Welcome** (1) | `greet` |
| **Embeds** (1) | `embed` |

Both slash (`/ban`) and prefix (`!ban`) work. Change prefix with `/prefix`.

---

## How Strict-Mode Auto-Restore Works

1. L caches every channel, role, and ban on startup (and on create/update).
2. When a channel/role is deleted, L fetches the audit log executor (cached — one API call per 4s).
3. If the executor is **not whitelisted** and **strict mode is ON**:
   - The deleted entity is **immediately restored** from cache (channel with overwrites, role with permissions, ban re-applied).
   - The offender is **immediately punished** (ban / kick / strip dangerous roles).
   - The event is **logged** to your log channel + audit log.
4. Same instant response for unauthorized bot additions, webhook creation, and mass-unbans.
5. Anti-raid: if N joins happen in M seconds, panic mode engages and new joins are auto-kicked/banned for 5 minutes.

---

## File Structure
```
l-antinuke-bot/
├── index.js                 # Main entry: login, events, command loader, graceful shutdown
├── package.json
├── .env.example
├── src/
│   ├── config.js           # Bot config + 10-category command catalog
│   ├── database.js         # Per-guild JSON storage + write-behind cache + emoji-free defaults
│   ├── embedBuilder.js     # Emoji-free embed builder + category-hierarchical lookup
│   ├── logger.js
│   ├── deploy.js           # Slash command registration
│   ├── handlers/
│   │   ├── antinuke.js     # v2 engine: strict mode, bot anti-add, anti-raid, anti-spam, anti-webhook
│   │   └── auditCache.js   # Audit-log fetch cache (the 100x optimization)
│   └── commands/
│       ├── antinuke/       # 14 commands
│       ├── automod/        # 3
│       ├── embeds/         # 1 (the embed customizer)
│       ├── info/           # 4
│       ├── leveling/       # 3
│       ├── logging/        # 1
│       ├── moderation/     # 23
│       ├── premium/        # 12
│       ├── util/           # 12
│       └── welcome/        # 1
└── serverdata/             # auto-created: one JSON per guild
```

---

## Performance Optimizations

1. **Audit-log cache** (`handlers/auditCache.js`): the old bot called `guild.fetchAuditLogs()` on every destructive event (one API call per channel deletion). During a 50-channel nuke, that's 50 sequential API calls. The cache fetches once per guild per 4 seconds and deduplicates concurrent fetches — a 50-channel nuke now does **one** API call.
2. **Write-behind DB** (`database.js`): config changes update the in-memory cache instantly (O(1)) and batch disk writes every 1.5s. A nuke that triggers 50 config updates writes the file **once** instead of 50 times.
3. **In-memory config cache**: all `getGuild()` calls are map lookups — no disk reads after the first load.
4. **Early event short-circuiting**: antinuke events return immediately if the shield is off or the executor is whitelisted, before any async work.

---

## Troubleshooting

- **Slash commands don't appear:** Run `npm run deploy`. Global commands take up to 1 hour; for instant testing use guild-scoped registration in `src/deploy.js`.
- **Bot doesn't respond to prefix commands:** Enable **Message Content Intent** in the Developer Portal.
- **Auto-restore isn't working:** Ensure the bot has `Administrator` permission and `antinuke.enabled` is `true` (`/antinuke status`).
- **Bot keeps getting kicked:** You probably have `blockBotAdd` on but haven't whitelisted your bots. Run `/botwhitelist add <botId>` for each trusted bot.
- **Too aggressive?** Switch to threshold mode with `/strictmode off` + `/antinuke threshold 5`.

---

## License

MIT — L is justice.
