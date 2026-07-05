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
const { getGuild, updateGuild, DEFAULT_EMBEDS } = require("../../database");
const { buildFromConfig } = require("../../embedBuilder");

// All editable embed keys + a friendly label (emoji-free)
const EMBED_OPTIONS = [
  { key: "antinuke_enabled", label: "Antinuke — Shield Activated", cat: "Antinuke" },
  { key: "antinuke_disabled", label: "Antinuke — Shield Deactivated", cat: "Antinuke" },
  { key: "antinuke_triggered", label: "Antinuke — Threat Neutralized", cat: "Antinuke" },
  { key: "antinuke_blocked", label: "Antinuke — Action Blocked", cat: "Antinuke" },
  { key: "bot_blocked", label: "Bot Protection — Unauthorized Bot Kicked", cat: "Antinuke" },
  { key: "raid_detected", label: "Anti-Raid — Raid Detected", cat: "Antinuke" },
  { key: "help_menu", label: "Info — Help Menu", cat: "Info" },
  { key: "ban_success", label: "Moderation — Ban", cat: "Moderation" },
  { key: "kick_success", label: "Moderation — Kick", cat: "Moderation" },
  { key: "timeout_success", label: "Moderation — Timeout", cat: "Moderation" },
  { key: "lock_success", label: "Moderation — Lock", cat: "Moderation" },
  { key: "purge_success", label: "Moderation — Purge", cat: "Moderation" },
  { key: "lockdown_enabled", label: "Moderation — Lockdown", cat: "Moderation" },
  { key: "greet_welcome", label: "Welcome — Greeting", cat: "Welcome" },
  { key: "greet_goodbye", label: "Welcome — Goodbye", cat: "Welcome" },
  { key: "premium_status", label: "Premium — Status", cat: "Premium" },
  { key: "success", label: "System — Success", cat: "System" },
  { key: "error", label: "System — Error", cat: "System" },
  { key: "warn", label: "System — Warning", cat: "System" },
  { key: "info", label: "System — Info", cat: "System" },
  { key: "no_perms", label: "System — Access Denied", cat: "System" },
];

// Emoji-free editor fields (7 total — fits in one modal, no second batch needed)
const FIELDS = [
  { key: "title", label: "Title", placeholder: "Embed title" },
  { key: "description", label: "Description (**bold**, *italic*, {vars})", placeholder: "Embed description", style: TextInputStyle.Paragraph },
  { key: "footer", label: "Footer", placeholder: "Footer text" },
  { key: "authorName", label: "Author Name", placeholder: "L" },
  { key: "color", label: "Color (hex without #)", placeholder: "ED4245" },
  { key: "thumbnailUrl", label: "Thumbnail URL", placeholder: "https://..." },
  { key: "imageUrl", label: "Image URL", placeholder: "https://..." },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("embed")
    .setDescription("Customize the bot's embed messages (title, description, color, images)")
    .addStringOption((o) =>
      o.setName("action").setDescription("What to do").setRequired(true)
        .addChoices(
          { name: "edit — customize an embed", value: "edit" },
          { name: "view — preview an embed", value: "view" },
          { name: "reset — reset an embed to default", value: "reset" },
          { name: "list — list all editable embeds", value: "list" },
        )
    )
    .addStringOption((o) => o.setName("embed").setDescription("Embed key to edit/view/reset").setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  name: "embed",
  category: "Embeds",
  permissions: [PermissionFlagsBits.ManageGuild],
  aliases: ["embeds", "customize"],

  async executeInteraction(interaction, client) {
    const action = interaction.options.getString("action");
    const embedKey = interaction.options.getString("embed");
    const data = getGuild(interaction.guild.id);

    if (action === "list") {
      const lines = EMBED_OPTIONS.map((o) => `\`${o.key}\` — ${o.label}`);
      const embed = buildFromConfig(
        { title: "Editable Embeds", description: lines.join("\n"), color: "2B2D31", footer: "L • Embeds", footerIcon: "bot", showTimestamp: false },
        interaction.guild
      );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (!embedKey) {
      const select = new StringSelectMenuBuilder()
        .setCustomId(`embed_select_${action}`)
        .setPlaceholder("Pick an embed to " + action)
        .addOptions(EMBED_OPTIONS.map((o) => new StringSelectMenuOptionBuilder().setLabel(o.label).setValue(o.key).setDescription(o.cat)));
      const row = new ActionRowBuilder().addComponents(select);
      const embed = buildFromConfig(
        { title: "Embed Customizer", description: `Pick the embed you want to **__${action}__**.\n\nPlaceholders: \`{user}\`, \`{server}\`, \`{count}\`, \`{reason}\`, \`{channel}\`, \`{detail}\`, \`{executor}\`, \`{action}\`, \`{duration}\``, color: "2B2D31", footer: "L • Embeds", footerIcon: "bot", showTimestamp: false },
        interaction.guild
      );
      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    if (action === "view") {
      const cfg = data.embeds[embedKey] || DEFAULT_EMBEDS[embedKey];
      if (!cfg) return interaction.reply({ content: `Embed \`${embedKey}\` not found.`, ephemeral: true });
      const embed = buildFromConfig(cfg, interaction.guild, { user: "@user", server: interaction.guild.name, count: "123", reason: "example reason", channel: "#general", detail: "example detail", executor: "@executor", action: "channel deletion", duration: "10m", bot: "ExampleBot" });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (action === "reset") {
      updateGuild(interaction.guild.id, (d) => {
        if (DEFAULT_EMBEDS[embedKey]) d.embeds[embedKey] = JSON.parse(JSON.stringify(DEFAULT_EMBEDS[embedKey]));
      });
      const embed = buildFromConfig({ title: "Embed Reset", description: `Embed \`${embedKey}\` was reset to its default.`, color: "57F287", footer: "L • Embeds", footerIcon: "bot", showTimestamp: false }, interaction.guild);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (action === "edit") {
      const cfg = data.embeds[embedKey] || DEFAULT_EMBEDS[embedKey];
      if (!cfg) return interaction.reply({ content: `Embed \`${embedKey}\` not found. Run \`/embed list\` to see valid keys.`, ephemeral: true });

      // Single modal with all 7 fields (Discord allows up to 5 — so we split into 2 modals)
      const modal = new ModalBuilder().setCustomId(`embed_edit_${embedKey}`).setTitle(`Edit: ${embedKey.slice(0, 20)}`);
      const rows = FIELDS.slice(0, 5).map((f) => {
        const ti = new TextInputBuilder()
          .setCustomId(f.key).setLabel(f.label).setValue(String(cfg[f.key] ?? ""))
          .setPlaceholder(f.placeholder || "").setStyle(f.style || TextInputStyle.Short).setRequired(false);
        return new ActionRowBuilder().addComponents(ti);
      });
      modal.addComponents(...rows);
      await interaction.showModal(modal);

      const filter = (i) => i.customId === `embed_edit_${embedKey}` && i.user.id === interaction.user.id;
      try {
        const submission = await interaction.awaitModalSubmit({ filter, time: 600000 });
        updateGuild(interaction.guild.id, (d) => {
          if (!d.embeds[embedKey]) d.embeds[embedKey] = JSON.parse(JSON.stringify(DEFAULT_EMBEDS[embedKey] || {}));
          for (const f of FIELDS.slice(0, 5)) {
            const v = submission.fields.getTextInputValue(f.key);
            if (v !== null && v !== undefined) d.embeds[embedKey][f.key] = v;
          }
        });

        // Second modal for the remaining 2 fields
        const modal2 = new ModalBuilder().setCustomId(`embed_edit2_${embedKey}`).setTitle(`Edit (2/2): ${embedKey.slice(0, 18)}`);
        const rows2 = FIELDS.slice(5).map((f) => {
          const ti = new TextInputBuilder()
            .setCustomId(f.key).setLabel(f.label).setValue(String(cfg[f.key] ?? ""))
            .setPlaceholder(f.placeholder || "").setStyle(f.style || TextInputStyle.Short).setRequired(false);
          return new ActionRowBuilder().addComponents(ti);
        });
        modal2.addComponents(...rows2);
        await submission.showModal(modal2);

        const filter2 = (i) => i.customId === `embed_edit2_${embedKey}` && i.user.id === interaction.user.id;
        const submission2 = await submission.awaitModalSubmit({ filter: filter2, time: 600000 });
        updateGuild(interaction.guild.id, (d) => {
          for (const f of FIELDS.slice(5)) {
            const v = submission2.fields.getTextInputValue(f.key);
            if (v !== null && v !== undefined) d.embeds[embedKey][f.key] = v;
          }
        });

        const updated = getGuild(interaction.guild.id).embeds[embedKey];
        const preview = buildFromConfig(updated, interaction.guild, { user: "@user", server: interaction.guild.name, count: "123", reason: "example reason", channel: "#general", detail: "example detail", executor: "@executor", action: "channel deletion", duration: "10m", bot: "ExampleBot" });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`embed_toggle_timestamp_${embedKey}`).setLabel("Timestamp").setStyle(updated.showTimestamp ? ButtonStyle.Success : ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`embed_preview_${embedKey}`).setLabel("Preview").setStyle(ButtonStyle.Primary),
        );

        await submission2.reply({ content: "Embed saved. Live preview below.", embeds: [preview], components: [row], ephemeral: true });
      } catch (e) {
        // Modal timeout — ignore
      }
      return;
    }
  },

  async execute(message, args, client) {
    const action = args[0] || "list";
    const data = getGuild(message.guild.id);
    if (action === "list" || !args[1]) {
      const lines = EMBED_OPTIONS.map((o) => `\`${o.key}\``);
      const embed = buildFromConfig(
        { title: "Embed Customizer", description: `**__Usage__**:\n\`${data.prefix}embed edit <key>\` — customize (use slash for full editor)\n\`${data.prefix}embed view <key>\` — preview\n\`${data.prefix}embed reset <key>\` — reset\n\n**__Editable embeds__**:\n${lines.join("\n")}`, color: "2B2D31", footer: "L • Embeds", footerIcon: "bot", showTimestamp: false },
        message.guild
      );
      return message.reply({ embeds: [embed] });
    }
    const embedKey = args[1];
    if (action === "view") {
      const cfg = data.embeds[embedKey] || DEFAULT_EMBEDS[embedKey];
      if (!cfg) return message.reply(`Embed \`${embedKey}\` not found.`);
      const embed = buildFromConfig(cfg, message.guild, { user: "@user", server: message.guild.name, count: "123", reason: "example", channel: "#general", detail: "example", executor: "@executor", action: "test", duration: "10m", bot: "ExampleBot" });
      return message.reply({ embeds: [embed] });
    }
    if (action === "reset") {
      updateGuild(message.guild.id, (d) => {
        if (DEFAULT_EMBEDS[embedKey]) d.embeds[embedKey] = JSON.parse(JSON.stringify(DEFAULT_EMBEDS[embedKey]));
      });
      return message.reply(`Reset \`${embedKey}\` to default.`);
    }
    if (action === "edit") {
      return message.reply(`Use the slash command \`/embed edit ${embedKey}\` for the full interactive editor.`);
    }
  },

  // Button + select-menu handler
  handleComponent: async (interaction, client) => {
    if (interaction.customId.startsWith("embed_select_")) {
      const action = interaction.customId.replace("embed_select_", "");
      const embedKey = interaction.values[0];
      const cmd = client.commands.get("embed");
      const fakeInteraction = {
        ...interaction,
        options: { getString: (n) => (n === "action" ? action : n === "embed" ? embedKey : null) },
        reply: (p) => interaction.update(p),
        showModal: (m) => interaction.showModal(m),
        awaitModalSubmit: (o) => interaction.awaitModalSubmit(o),
        user: interaction.user, guild: interaction.guild, deferred: false, replied: false,
      };
      return cmd.executeInteraction(fakeInteraction, client);
    }
    if (interaction.customId.startsWith("embed_toggle_timestamp_")) {
      const embedKey = interaction.customId.replace("embed_toggle_timestamp_", "");
      updateGuild(interaction.guild.id, (d) => {
        if (d.embeds[embedKey]) d.embeds[embedKey].showTimestamp = !d.embeds[embedKey].showTimestamp;
      });
      return interaction.reply({ content: `Timestamp toggled for \`${embedKey}\`.`, ephemeral: true });
    }
    if (interaction.customId.startsWith("embed_preview_")) {
      const embedKey = interaction.customId.replace("embed_preview_", "");
      const cfg = getGuild(interaction.guild.id).embeds[embedKey] || DEFAULT_EMBEDS[embedKey];
      const embed = buildFromConfig(cfg, interaction.guild, { user: "@user", server: interaction.guild.name, count: "123", reason: "example", channel: "#general", detail: "example", executor: "@executor", action: "test", duration: "10m", bot: "ExampleBot" });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
