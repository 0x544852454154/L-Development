const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  TextInputBuilder,
  TextInputStyle,
  ModalBuilder,
} = require("discord.js");
const { getGuild, updateGuild, DEFAULT_EMBEDS, loadGlobalEmbeds, updateGlobalEmbed, resetGlobalEmbed } = require("../../database");
const { buildFromConfig } = require("../../embedBuilder");
const config = require("../../config");

// All editable embed keys + a friendly label
const EMBED_OPTIONS = [
  { key: "antinuke_enabled", label: "Antinuke — Shield Activated", cat: "Antinuke" },
  { key: "antinuke_triggered", label: "Antinuke — Nuke Detected", cat: "Antinuke" },
  { key: "antinuke_disabled", label: "Antinuke — Shield Deactivated", cat: "Antinuke" },
  { key: "help_menu", label: "Info — Help Menu", cat: "Info" },
  { key: "ban_success", label: "Moderation — Ban", cat: "Moderation" },
  { key: "kick_success", label: "Moderation — Kick", cat: "Moderation" },
  { key: "timeout_success", label: "Moderation — Timeout", cat: "Moderation" },
  { key: "lock_success", label: "Moderation — Lock", cat: "Moderation" },
  { key: "purge_success", label: "Moderation — Purge", cat: "Moderation" },
  { key: "greet_welcome", label: "Welcome — Greeting", cat: "Welcome" },
  { key: "greet_goodbye", label: "Welcome — Goodbye", cat: "Welcome" },
  { key: "premium_status", label: "Premium — Status", cat: "Premium" },
  { key: "success", label: "Generic — Success", cat: "System" },
  { key: "error", label: "Generic — Error", cat: "System" },
  { key: "warn", label: "Generic — Warning", cat: "System" },
  { key: "no_perms", label: "Generic — No Permissions", cat: "System" },
];

const FIELDS = [
  { key: "title", label: "Title", placeholder: "Embed title" },
  { key: "titleEmoji", label: "Title Emoji (:name: or unicode)", placeholder: ":shield: or 🛡️" },
  { key: "description", label: "Description (**bold**, :emoji:, {vars})", placeholder: "Embed description", style: TextInputStyle.Paragraph },
  { key: "footer", label: "Footer", placeholder: "Footer text" },
  { key: "footerEmoji", label: "Footer Emoji", placeholder: ":owner: or 👑" },
  { key: "authorName", label: "Author Name", placeholder: "L" },
  { key: "authorEmoji", label: "Author Emoji", placeholder: ":owner: or 👑" },
  { key: "color", label: "Color (hex without #)", placeholder: "ED4245" },
  { key: "thumbnailUrl", label: "Thumbnail URL", placeholder: "https://..." },
  { key: "imageUrl", label: "Image URL", placeholder: "https://..." },
];

function isOwner(userId) {
  return userId === config.ownerId;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("embed")
    .setDescription("Customize the bot's embed messages (title, description, color, emojis) - OWNER ONLY")
    .addStringOption((o) =>
      o.setName("action").setDescription("What to do").setRequired(true)
        .addChoices(
          { name: "edit — customize an embed", value: "edit" },
          { name: "view — preview an embed", value: "view" },
          { name: "reset — reset an embed to default", value: "reset" },
          { name: "list — list all editable embeds", value: "list" },
          { name: "emojis — toggle server emoji rendering", value: "emojis" },
        )
    )
    .addStringOption((o) => o.setName("embed").setDescription("Embed key to edit/view/reset").setRequired(false)),
  name: "embed",
  category: "Info",
  ownerOnly: true,
  aliases: ["embeds", "customize"],

  async executeInteraction(interaction, client) {
    if (!isOwner(interaction.user.id)) {
      return interaction.reply({ content: "❌ This command is restricted to the bot owner only.", ephemeral: true });
    }

    const action = interaction.options.getString("action");
    const embedKey = interaction.options.getString("embed");
    const globalEmbeds = loadGlobalEmbeds();

    if (action === "list") {
      const lines = EMBED_OPTIONS.map((o) => `\`${o.key}\` — ${o.label}`);
      const embed = buildFromConfig(
        { title: "Editable Embeds (Global)", titleEmoji: "🎨", description: lines.join("\n") + "\n\n*Changes apply to ALL servers*", color: "2B2D31", footer: "Use /embed edit <key>", footerEmoji: "👑", showTimestamp: false },
        interaction.guild
      );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (action === "emojis") {
      // Toggle server emoji rendering globally for all embeds
      const current = Object.values(globalEmbeds)[0]?.useServerEmojis !== false;
      for (const key of Object.keys(globalEmbeds)) {
        globalEmbeds[key].useServerEmojis = !current;
      }
      // Save by updating one embed (triggers save of entire cache)
      updateGlobalEmbed("antinuke_enabled", globalEmbeds["antinuke_enabled"]);

      const embed = buildFromConfig(
        { title: "Server Emoji Rendering (Global)", titleEmoji: current ? "❌" : "✅", description: `Server emoji rendering is now **${!current ? "ENABLED" : "DISABLED"}** for ALL servers.\n\nWhen enabled, \`:name:\` tokens resolve to your server's custom emojis.`, color: !current ? "57F287" : "ED4245", footer: "L • Embed Customizer", footerEmoji: "🎨", showTimestamp: true },
        interaction.guild
      );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (!embedKey) {
      // Show a select menu to pick an embed
      const select = new StringSelectMenuBuilder()
        .setCustomId(`embed_select_${action}`)
        .setPlaceholder("Pick an embed to " + action)
        .addOptions(
          EMBED_OPTIONS.map((o) =>
            new StringSelectMenuOptionBuilder().setLabel(o.label).setValue(o.key).setDescription(o.cat)
          )
        );
      const row = new ActionRowBuilder().addComponents(select);
      const embed = buildFromConfig(
        { title: "Embed Customizer (Global)", titleEmoji: "🎨", description: `Pick the embed you want to **${action}**.\nYou can use \`:emoji_name:\` to insert your server's custom emojis.\n\n*Changes apply to ALL servers*`, color: "2B2D31", footer: "L • Embed Customizer", footerEmoji: "🎨", showTimestamp: false },
        interaction.guild
      );
      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    if (action === "view") {
      const cfg = globalEmbeds[embedKey];
      if (!cfg) return interaction.reply({ content: `Embed \`${embedKey}\` not found.`, ephemeral: true });
      const embed = buildFromConfig(cfg, interaction.guild, { user: "@user", server: interaction.guild.name, count: "123", reason: "example reason", channel: "#general", detail: "example detail" });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (action === "reset") {
      resetGlobalEmbed(embedKey);
      const embed = buildFromConfig({ title: "Embed Reset (Global)", titleEmoji: "♻️", description: `Embed \`${embedKey}\` was reset to its default for ALL servers.`, color: "57F287", footer: "L • Embed Customizer", footerEmoji: "🎨", showTimestamp: true }, interaction.guild);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (action === "edit") {
      const cfg = globalEmbeds[embedKey];
      if (!cfg) return interaction.reply({ content: `Embed \`${embedKey}\` not found. Run \`/embed list\` to see valid keys.`, ephemeral: true });

      // Build a modal with the editable fields
      const modal = new ModalBuilder().setCustomId(`embed_edit_${embedKey}`).setTitle(`Edit: ${embedKey.slice(0, 20)}`);
      const rows = FIELDS.slice(0, 5).map((f) => {
        const ti = new TextInputBuilder()
          .setCustomId(f.key)
          .setLabel(f.label)
          .setValue(String(cfg[f.key] ?? ""))
          .setPlaceholder(f.placeholder || "")
          .setStyle(f.style || TextInputStyle.Short)
          .setRequired(false);
        return new ActionRowBuilder().addComponents(ti);
      });
      modal.addComponents(...rows);
      await interaction.showModal(modal);

      // Collect the second batch via a follow-up (Discord modals cap at 5 fields)
      const filter = (i) => i.customId === `embed_edit_${embedKey}` && i.user.id === interaction.user.id;
      try {
        const submission = await interaction.awaitModalSubmit({ filter, time: 600000 });
        // Update global embeds with first batch
        for (const f of FIELDS.slice(0, 5)) {
          const v = submission.fields.getTextInputValue(f.key);
          if (v !== null && v !== undefined) globalEmbeds[embedKey][f.key] = v;
        }
        updateGlobalEmbed(embedKey, globalEmbeds[embedKey]);

        // Ask for the remaining fields
        const modal2 = new ModalBuilder().setCustomId(`embed_edit2_${embedKey}`).setTitle(`Edit (2/2): ${embedKey.slice(0, 18)}`);
        const rows2 = FIELDS.slice(5).map((f) => {
          const ti = new TextInputBuilder()
            .setCustomId(f.key)
            .setLabel(f.label)
            .setValue(String(globalEmbeds[embedKey][f.key] ?? ""))
            .setPlaceholder(f.placeholder || "")
            .setStyle(f.style || TextInputStyle.Short)
            .setRequired(false);
          return new ActionRowBuilder().addComponents(ti);
        });
        modal2.addComponents(...rows2);
        await submission.showModal(modal2);

        const filter2 = (i) => i.customId === `embed_edit2_${embedKey}` && i.user.id === interaction.user.id;
        const submission2 = await submission.awaitModalSubmit({ filter: filter2, time: 600000 });
        // Update global embeds with second batch
        for (const f of FIELDS.slice(5)) {
          const v = submission2.fields.getTextInputValue(f.key);
          if (v !== null && v !== undefined) globalEmbeds[embedKey][f.key] = v;
        }
        // Also toggle server emojis + timestamp on color presence
        globalEmbeds[embedKey].showTimestamp = globalEmbeds[embedKey].showTimestamp !== false;
        updateGlobalEmbed(embedKey, globalEmbeds[embedKey]);

        // Show a live preview + toggle buttons
        const updated = loadGlobalEmbeds()[embedKey];
        const preview = buildFromConfig(updated, interaction.guild, { user: "@user", server: interaction.guild.name, count: "123", reason: "example reason", channel: "#general", detail: "example detail" });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`embed_toggle_emojis_${embedKey}`).setLabel("Server Emojis").setStyle(updated.useServerEmojis !== false ? ButtonStyle.Success : ButtonStyle.Secondary).setEmoji("🎨"),
          new ButtonBuilder().setCustomId(`embed_toggle_timestamp_${embedKey}`).setLabel("Timestamp").setStyle(updated.showTimestamp ? ButtonStyle.Success : ButtonStyle.Secondary).setEmoji("🕐"),
          new ButtonBuilder().setCustomId(`embed_preview_${embedKey}`).setLabel("Preview").setStyle(ButtonStyle.Primary).setEmoji("👁️"),
        );

        await submission2.reply({ content: "✅ Embed saved globally! Changes apply to ALL servers. Live preview + toggles below.", embeds: [preview], components: [row], ephemeral: true });
      } catch (e) {
        // Modal timeout — ignore
      }
      return;
    }
  },

  async execute(message, args, client) {
    if (!isOwner(message.author.id)) {
      return message.reply("❌ This command is restricted to the bot owner only.");
    }

    const action = args[0] || "list";
    const globalEmbeds = loadGlobalEmbeds();
    // Reuse the interaction logic by constructing a pseudo-interaction is complex;
    // for prefix, show the help + list.
    const data = getGuild(message.guild.id);
    if (action === "list" || !args[1]) {
      const lines = EMBED_OPTIONS.map((o) => `\`${o.key}\``);
      const embed = buildFromConfig(
        { title: "Embed Customizer (Global)", titleEmoji: "🎨", description: `**Usage:**\n\`${data.prefix}embed edit <key>\` — customize\n\`${data.prefix}embed view <key>\` — preview\n\`${data.prefix}embed reset <key>\` — reset\n\`${data.prefix}embed emojis\` — toggle server emojis\n\n**Editable embeds:**\n${lines.join("\n")}\n\n*Changes apply to ALL servers*`, color: "2B2D31", footer: "L • Embed Customizer", footerEmoji: "🎨", showTimestamp: false },
        message.guild
      );
      return message.reply({ embeds: [embed] });
    }
    const embedKey = args[1];
    if (action === "view") {
      const cfg = globalEmbeds[embedKey];
      if (!cfg) return message.reply(`Embed \`${embedKey}\` not found.`);
      const embed = buildFromConfig(cfg, message.guild, { user: "@user", server: message.guild.name, count: "123", reason: "example reason", channel: "#general", detail: "example detail" });
      return message.reply({ embeds: [embed] });
    }
    if (action === "reset") {
      resetGlobalEmbed(embedKey);
      return message.reply(`♻️ Reset \`${embedKey}\` to default for ALL servers.`);
    }
    if (action === "emojis") {
      const current = Object.values(globalEmbeds)[0]?.useServerEmojis !== false;
      for (const key of Object.keys(globalEmbeds)) {
        globalEmbeds[key].useServerEmojis = !current;
      }
      // Save by updating one embed (triggers save of entire cache)
      updateGlobalEmbed("antinuke_enabled", globalEmbeds["antinuke_enabled"]);
      return message.reply(`Server emoji rendering is now **${!current ? "ENABLED" : "DISABLED"}** for ALL servers.`);
    }
    if (action === "edit") {
      return message.reply(`Use the slash command \`/embed edit ${embedKey}\` for the full interactive editor. (Modals work best with slash commands.)`);
    }
  },
};

// Button + select-menu handler (registered in index via a separate event hook)
module.exports.handleComponent = async (interaction, client) => {
  if (!isOwner(interaction.user.id)) {
    return interaction.reply({ content: "❌ This command is restricted to the bot owner only.", ephemeral: true });
  }

  const [type, , ...rest] = interaction.customId.split("_");
  // Patterns: embed_select_<action>, embed_toggle_emojis_<key>, embed_toggle_timestamp_<key>, embed_preview_<key>
  if (interaction.customId.startsWith("embed_select_")) {
    const action = interaction.customId.replace("embed_select_", "");
    const embedKey = interaction.values[0];
    // Re-run edit/view/reset for the chosen key by delegating
    const cmd = client.commands.get("embed");
    const fakeInteraction = {
      ...interaction,
      options: {
        getString: (n) => (n === "action" ? action : n === "embed" ? embedKey : null),
      },
      reply: (p) => interaction.update(p),
      showModal: (m) => interaction.showModal(m),
      awaitModalSubmit: (o) => interaction.awaitModalSubmit(o),
      user: interaction.user,
      guild: interaction.guild,
      deferred: false,
      replied: false,
    };
    return cmd.executeInteraction(fakeInteraction, client);
  }
  if (interaction.customId.startsWith("embed_toggle_emojis_")) {
    const embedKey = interaction.customId.replace("embed_toggle_emojis_", "");
    const globalEmbeds = loadGlobalEmbeds();
    globalEmbeds[embedKey].useServerEmojis = !(globalEmbeds[embedKey].useServerEmojis !== false);
    updateGlobalEmbed(embedKey, globalEmbeds[embedKey]);
    return interaction.reply({ content: `🎨 Server emojis toggled for \`${embedKey}\` (GLOBAL).`, ephemeral: true });
  }
  if (interaction.customId.startsWith("embed_toggle_timestamp_")) {
    const embedKey = interaction.customId.replace("embed_toggle_timestamp_", "");
    const globalEmbeds = loadGlobalEmbeds();
    globalEmbeds[embedKey].showTimestamp = !globalEmbeds[embedKey].showTimestamp;
    updateGlobalEmbed(embedKey, globalEmbeds[embedKey]);
    return interaction.reply({ content: `🕐 Timestamp toggled for \`${embedKey}\` (GLOBAL).`, ephemeral: true });
  }
  if (interaction.customId.startsWith("embed_preview_")) {
    const embedKey = interaction.customId.replace("embed_preview_", "");
    const cfg = loadGlobalEmbeds()[embedKey];
    const embed = buildFromConfig(cfg, interaction.guild, { user: "@user", server: interaction.guild.name, count: "123", reason: "example", channel: "#general", detail: "example" });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
