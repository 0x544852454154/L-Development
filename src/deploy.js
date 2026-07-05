require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { REST, Routes } = require("discord.js");
const config = require("./config");

if (!config.token || !config.clientId) {
  console.error("Missing DISCORD_TOKEN or CLIENT_ID in .env");
  process.exit(1);
}

const commands = [];
const commandsPath = path.join(__dirname, "commands");

function loadCommands(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      loadCommands(fullPath);
    } else if (entry.name.endsWith(".js")) {
      try {
        const cmd = require(fullPath);
        if (cmd.data && cmd.data.toJSON) {
          commands.push(cmd.data.toJSON());
          console.log(`  + ${cmd.data.name}`);
        }
      } catch (e) {
        console.error(`  ! failed ${fullPath}: ${e.message}`);
      }
    }
  }
}

loadCommands(commandsPath);
console.log(`\nDeploying ${commands.length} slash commands...`);

const rest = new REST({ version: "10" }).setToken(config.token);

(async () => {
  try {
    // Register globally so all servers get them (takes up to 1 hour to propagate).
    // For instant testing, swap to guild-scoped registration with your test guild ID.
    const data = await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
    console.log(`\n✓ Successfully registered ${data.length} global slash commands.`);
    console.log("Note: global commands can take up to 1 hour to appear in all guilds.");
    console.log("For instant testing, use a guild-scoped deploy (see comments in deploy.js).");
  } catch (e) {
    console.error("Failed to deploy:", e);
  }
})();
