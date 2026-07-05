# L — The Antinuke Authority

A Discord antinuke bot with **auto-restore**, **fully customizable embeds**, **server emoji support**, **multi-server config**, and **63 commands** across 9 categories.

> L is justice.

---

## Features

- 🛡️ **Antinuke Shield** — detects mass channel/role deletions, mass unbans, and webhook spam, then automatically reverts the damage and punishes the offender.
- ♻️ **Auto-Restore** — re-creates deleted channels (with overwrites & topic), roles (with permissions), re-applies mass-unbans, and restores webhooks.
- 🎨 **Customizable Embeds** — every bot response uses a customizable embed. Edit titles, descriptions, colors, footers, images, and emojis with the `/embed` command — in Discord, live.
- 😀 **Server Emoji Support** — use `:emoji_name:` in any embed field and L resolves it to your server's custom emojis. Toggle globally per embed.
- ⚙️ **Multi-Server** — each guild gets its own config, prefix, embeds, and whitelist.
- 📜 **63 Commands** across Antinuke, Automod, Info, Leveling, Logging, Moderation, Premium, Util, and Welcome.

---

## Quick Start

### 1. Prerequisites
- [Node.js](https://nodejs.org/) v18+ (or [Bun](https://bun.sh/))
- A Discord bot application — create one at <https://discord.com/developers/applications>

### 2. Install
```bash
cd l-antinuke-bot
npm install
# or: bun install
```

### 3. Configure
Copy the example env file and fill in your details:
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
# or: node src/deploy.js
```
> Global slash commands can take up to 1 hour to appear. For instant testing, temporarily switch to guild-scoped registration in `src/deploy.js`.

### 5. Invite the Bot
Open your application in the Discord Developer Portal → OAuth2 → URL Generator → select `bot` + `applications.commands` scopes and `Administrator` permission → visit the generated URL.

### 6. Run
```bash
npm start
# or: node index.js
# or for auto-restart on file changes: npm run dev
```

You should see:
```
[2025-01-01 12:00:00] [commands] loaded 64 commands
[2025-01-01 12:00:00] [ready] L#0001 online — serving 1 guilds
```

---

## Usage

### Set up antinuke (the main event)
```
/init              → initialize L with safe defaults
/antinuke on       → arm the shield
/whitelist add role @Moderators  → exempt trusted roles
/extraowner add @CoAdmin        → add a co-owner (bypasses antinuke)
```

### Auto-restore is on by default
When someone mass-deletes channels/roles or mass-unbans, L **automatically reverts the damage** and bans the offender. Configure thresholds with `/antinuke threshold 3`.

### Customize embeds (the new command)
```
/embed list                    → see all editable embeds
/embed edit ban_success        → open the interactive editor (modal)
/embed view greet_welcome      → preview an embed
/embed reset help_menu         → reset to default
/embed emojis                  → toggle server emoji rendering
```
In the editor, type `:shield:` or `:owner:` to insert your server's custom emojis — L resolves them automatically. Use `**bold**`, `*italic*`, and `{user}`, `{server}`, `{count}`, `{reason}` placeholders.

### All commands
Run `/help` in Discord to see every category, or `/help Antinuke` to browse a specific category.

| Category | Commands |
|---|---|
| **Antinuke** | `antinuke` `antiping` `extraowner` `init` `multiwhitelist` `nukehooks` `whitelist` |
| **Automod** | `antighostping` `automod` `automodwhitelist` |
| **Info** | `help` `invite` `ping` `uptime` |
| **Leveling** | `leaderboard` `leveling` `rank` |
| **Logging** | `logging` |
| **Moderation** | `ban` `hardban` `hide` `hideall` `kick` `list` `lock` `lockall` `timeout` `nickname` `purge` `purgebots` `role` `steal` `unban` `unhide` `unhideall` `unlock` `unlockall` `untimeout` |
| **Premium** | `antialt` `autorole` `boosterrole` `massrole` `massunban` `premium` `resetserveravatar` `resetserverbanner` `resetserverbio` `setserveravatar` `setserverbanner` `setserverbio` |
| **Util** | `afk` `ask` `avatar` `banner` `define` `membercount` `nuke` `prefix` `report` `serverinfo` `stats` `userinfo` |
| **Welcome** | `greet` |

Both **slash commands** (`/ban`) and **prefix commands** (`!ban`) work. Change the prefix with `/prefix ?`.

---

## How Auto-Restore Works

1. L caches every channel and role on startup (and on create/update).
2. When a channel/role is deleted, L checks the audit log for the executor.
3. If the executor isn't whitelisted and the deletion count crosses the threshold within the time window, L:
   - **Re-creates** the deleted entity from cache (name, topic, overwrites, permissions, position).
   - **Punishes** the offender (ban / kick / strip dangerous roles — configurable).
   - **Logs** the event to your restore log channel.
4. Same logic for mass-unbans (re-bans) and webhook spam.

Configure in `serverdata/<guildId>.json` or via commands:
```
/antinuke threshold 3      → 3 deletions in 10s triggers restore
/antinuke punishment ban   → ban offenders (ban | kick | strip)
```

---

## File Structure
```
l-antinuke-bot/
├── index.js                 # Main entry: login, events, command loader
├── package.json
├── .env.example
├── src/
│   ├── config.js           # Bot config + command catalog
│   ├── database.js         # Per-guild JSON storage + default embeds
│   ├── embedBuilder.js     # Builds embeds from customizable config
│   ├── emojiUtils.js       # Resolves :name: to guild emojis
│   ├── logger.js
│   ├── deploy.js           # Slash command registration
│   ├── handlers/
│   │   └── antinuke.js     # Antinuke shield + auto-restore engine
│   └── commands/
│       ├── antinuke/       # 7 commands
│       ├── automod/        # 3
│       ├── embeds/         # 1 (the embed customizer)
│       ├── info/           # 4
│       ├── leveling/       # 3
│       ├── logging/        # 1
│       ├── moderation/     # 20
│       ├── premium/        # 12
│       ├── util/           # 12
│       └── welcome/        # 1
└── serverdata/             # auto-created: one JSON per guild
```

---

## Customizing Embeds

All embeds live in `serverdata/<guildId>.json` under the `embeds` key. Each embed supports:

| Field | Description |
|---|---|
| `title` / `titleEmoji` | Embed title + leading emoji |
| `description` | Body text. Supports `**bold**`, `*italic*`, line breaks, `:emoji:`, and `{placeholders}` |
| `footer` / `footerEmoji` | Footer text + emoji |
| `authorName` / `authorEmoji` | Author line |
| `color` | Hex color without `#` (e.g. `ED4245`) |
| `thumbnailUrl` / `imageUrl` | Image URLs |
| `showTimestamp` | `true`/`false` |
| `useServerEmojis` | `true`/`false` — resolve `:name:` to guild emojis |

**Placeholders:** `{user}`, `{server}`, `{count}`, `{reason}`, `{channel}`, `{detail}`, `{duration}`.

Edit them either via `/embed edit <key>` in Discord, or by editing the JSON file directly (bot reloads per-command).

---

## Enabling Premium (for testing)

Premium commands are gated by `premium: true` in each command file. To unlock premium for a server, edit `serverdata/<guildId>.json` and set `"premium": true`, or add a `/premium` upgrade flow.

---

## Troubleshooting

- **Slash commands don't appear:** Run `npm run deploy`. If still missing after an hour, switch `deploy.js` to guild-scoped registration (uncomment the guild route with your test guild ID).
- **Bot doesn't respond to prefix commands:** Ensure `Message Content Intent` is enabled in the Developer Portal, and the prefix matches (`/prefix` to check).
- **Auto-restore isn't working:** Ensure the bot has `Administrator` or the relevant manage permissions, and that `antinuke.enabled` is `true` (`/antinuke status`).
- **Custom emojis show as `:name:`:** Run `/embed emojis` to enable server emoji rendering, or set `useServerEmojis: true` in the embed config.

---

## License

MIT — do whatever you want. L is justice.

---

**L — The Antinuke Authority.** Auto-restore • Customizable embeds • Server emoji support • Multi-server.
