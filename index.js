require("dotenv").config();
const fs = require("fs");
const path = require("path");
const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  Collection,
  PermissionsBitField,
} = require("discord.js");
const config = require("./src/config");
const { getGuild, updateGuild, addAudit, flushNow } = require("./src/database");
const { sendEmbed, success, error, setClient } = require("./src/embedBuilder");
const antinuke = require("./src/handlers/antinuke");
const logger = require("./src/logger");

if (!config.token || config.token === "your_bot_token_here") {
  logger.error("No DISCORD_TOKEN found. Copy .env.example to .env and fill in your bot token.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildBans,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildWebhooks,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember, Partials.Reaction],
});

// ===== Load commands =====
client.commands = new Collection();
const commandsPath = path.join(__dirname, "src", "commands");
let loadedCount = 0;

function loadCommands(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      loadCommands(fullPath);
    } else if (entry.name.endsWith(".js")) {
      try {
        const cmd = require(fullPath);
        if (cmd.name || cmd.data) {
          client.commands.set(cmd.name || cmd.data.name, cmd);
          loadedCount++;
        }
      } catch (e) {
        logger.error(`Failed to load command ${fullPath}:`, e.message);
      }
    }
  }
}
loadCommands(commandsPath);
logger.log(`[commands] loaded ${loadedCount} commands`);

// ===== Permission helper =====
function hasPermission(member, command) {
  if (command.ownerOnly && member.id !== config.ownerId) return false;
  if (command.permissions && !member.permissions.has(command.permissions)) return false;
  // Extra owners bypass antinuke perms
  const data = getGuild(member.guild.id);
  if (data.antinuke.extraOwners.includes(member.id)) return true;
  return true;
}

// ===== Ready =====
client.once(Events.ClientReady, (c) => {
  logger.log(`[ready] ${c.user.tag} online — serving ${c.guilds.cache.size} guilds`);
  c.user.setActivity("for nukes", { type: 3 }); // Watching
  setClient(c); // give the embed builder access to the bot avatar for footer icons

  // Cache all existing channels/roles so auto-restore can revert them.
  // Wrap in try/catch so one bad channel never crashes startup.
  try {
    for (const guild of c.guilds.cache.values()) {
      guild.channels.cache.forEach((ch) => {
        try { antinuke.cacheChannel(ch); } catch (e) {
          logger.warn(`[ready] skipped channel ${ch.id} in ${guild.name}: ${e.message}`);
        }
      });
      guild.roles.cache.forEach((r) => {
        try { antinuke.cacheRole(r); } catch (e) {
          logger.warn(`[ready] skipped role ${r.id} in ${guild.name}: ${e.message}`);
        }
      });
    }
    logger.log("[ready] cached channels & roles for auto-restore");
  } catch (e) {
    logger.error("[ready] caching failed (non-fatal):", e.message);
  }

  // Initialize guild data for any guild missing a config file
  for (const guild of c.guilds.cache.values()) {
    getGuild(guild.id);
  }

  // Attach antinuke handlers
  antinuke.setup(c);
});

// ===== Slash command interaction =====
client.on(Events.InteractionCreate, async (interaction) => {
  // Component (button/select) interactions — delegate to the owning command
  if (interaction.isButton() || interaction.isStringSelectMenu()) {
    const embedCmd = client.commands.get("embed");
    if (embedCmd?.handleComponent && interaction.customId.startsWith("embed_")) {
      try {
        await embedCmd.handleComponent(interaction, client);
      } catch (e) {
        logger.error("[component] embed handler failed:", e.message);
        interaction.reply({ content: "Something went wrong.", ephemeral: true }).catch(() => {});
      }
    }
    return;
  }
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  const data = getGuild(interaction.guild.id);

  // Premium gate
  if (command.premium && !data.premium && interaction.user.id !== config.ownerId) {
    return error(interaction, interaction.guild, "This command requires **L Premium**.");
  }

  // Permission check
  if (command.permissions && !interaction.member.permissions.has(command.permissions)) {
    return error(interaction, interaction.guild, "You don't have permission to use this command.");
  }

  try {
    await command.executeInteraction(interaction, client);
  } catch (e) {
    logger.error(`[slash] ${interaction.commandName} failed:`, e);
    const payload = { content: "Something went wrong running that command.", ephemeral: true };
    if (interaction.deferred || interaction.replied) interaction.editReply(payload).catch(() => {});
    else interaction.reply(payload).catch(() => {});
  }
});

// ===== Prefix (message) command handler =====
client.on(Events.MessageCreate, async (message) => {
  if (!message.guild || message.author.bot) return;
  const data = getGuild(message.guild.id);
  const prefix = data.prefix || config.defaultPrefix;

  // AFK check
  for (const [uid, afk] of Object.entries(data.afk)) {
    if (message.mentions.users.has(uid)) {
      const embed = require("./src/embedBuilder").buildEmbed("warn", message.guild, {
        detail: `<@${uid}> is AFK: ${afk.message}\n*${timeAgo(afk.since)} ago*`,
      });
      message.channel.send({ embeds: [embed] }).catch(() => {});
    }
  }
  // Remove AFK when the AFK user sends a message
  if (data.afk[message.author.id]) {
    updateGuild(message.guild.id, (d) => { delete d.afk[message.author.id]; });
    message.reply("Welcome back! Your AFK status was removed.").then((m) => setTimeout(() => m.delete().catch(() => {}), 4000));
  }

  if (!message.content.startsWith(prefix)) return;
  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const commandName = args.shift()?.toLowerCase();
  if (!commandName) return;

  const command = client.commands.get(commandName) || client.commands.find((c) => c.aliases?.includes(commandName));
  if (!command) return;

  // Premium gate
  if (command.premium && !data.premium && message.author.id !== config.ownerId) {
    return error(message, message.guild, "This command requires **L Premium**.");
  }

  // Permission check
  if (command.permissions && !message.member.permissions.has(command.permissions)) {
    return error(message, message.guild, "You don't have permission to use this command.");
  }

  try {
    await command.execute(message, args, client);
  } catch (e) {
    logger.error(`[prefix] ${commandName} failed:`, e);
    message.reply("Something went wrong running that command.").catch(() => {});
  }
});

// ===== Guild join — initialize config =====
client.on(Events.GuildCreate, (guild) => {
  getGuild(guild.id);
  addAudit(guild.id, "Bot Added", "L", `L was added to ${guild.name}`, "info");
  logger.log(`[guildCreate] initialized config for ${guild.name} (${guild.id})`);
});

// ===== Error handling =====
client.on(Events.Error, (e) => logger.error("[client error]", e.message));
client.on(Events.Warn, (w) => logger.warn("[client warn]", w));
process.on("unhandledRejection", (e) => logger.error("[unhandledRejection]", e));

// ===== Graceful shutdown — flush pending DB writes =====
async function shutdown(signal) {
  logger.log(`[shutdown] ${signal} received — flushing DB and exiting`);
  try { flushNow(); } catch (e) { logger.error("[shutdown] flush failed", e.message); }
  try { await client.destroy(); } catch {}
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

client.login(config.token);
