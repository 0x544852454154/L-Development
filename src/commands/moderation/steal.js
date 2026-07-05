const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { success, error } = require("../../embedBuilder");

// Parse a custom emoji token like <:name:id> or <a:name:id> or a raw emoji URL.
function parseEmoji(input) {
  if (!input) return null;
  const match = input.match(/<(a?):([a-zA-Z0-9_]+):(\d+)>/);
  if (match) {
    const animated = match[1] === "a";
    const name = match[2];
    const id = match[3];
    const ext = animated ? "gif" : "png";
    return {
      name,
      animated,
      url: `https://cdn.discordapp.com/emojis/${id}.${ext}?size=96&quality=lossless`,
    };
  }
  // Raw URL fallback
  if (/^https?:\/\//i.test(input)) {
    const m = input.match(/\/([^\/?#]+?)\.(png|gif|jpg|jpeg|webp)(?:[?#]|$)/i);
    const name = (m && m[1]) || "stolen_emoji";
    return { name: name.slice(0, 28), animated: false, url: input };
  }
  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("steal")
    .setDescription("Steal a custom emoji from another server and add it here")
    .addStringOption((o) =>
      o
        .setName("emoji")
        .setDescription("The emoji to steal — e.g. <:name:id> or <a:name:id>")
        .setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("name").setDescription("Optional new name for the emoji").setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEmojisAndStickers),
  name: "steal",
  category: "Moderation",
  permissions: [PermissionFlagsBits.ManageEmojisAndStickers],
  aliases: ["emojisteal", "addemoji"],

  async executeInteraction(interaction, client) {
    const raw = interaction.options.getString("emoji");
    const customName = interaction.options.getString("name");
    const parsed = parseEmoji(raw);
    if (!parsed) return error(interaction, interaction.guild, "Provide a custom emoji token like `<:name:id>` or `<a:name:id>`.");

    const me = interaction.guild.members.me;
    if (!me.permissions.has(PermissionFlagsBits.ManageEmojisAndStickers))
      return error(interaction, interaction.guild, "I lack the **Manage Emojis and Stickers** permission.");

    const name = (customName || parsed.name).replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 32);
    if (!name) return error(interaction, interaction.guild, "Invalid emoji name. Use letters, numbers, and underscores only.");

    let created;
    try {
      created = await interaction.guild.emojis.create({
        attachment: parsed.url,
        name,
        reason: `${interaction.user.tag}: stolen emoji`,
      });
    } catch (e) {
      return error(interaction, interaction.guild, `Failed to steal emoji: ${e.message}`);
    }

    return success(interaction, interaction.guild, `Stolen emoji ${created.toString()} added as **\`${created.name}\`**.`);
  },

  async execute(message, args, client) {
    const raw = args.join(" ");
    if (!raw) return error(message, message.guild, "Please provide a custom emoji token like `<:name:id>` or `<a:name:id>`.");
    const parsed = parseEmoji(raw);
    if (!parsed) return error(message, message.guild, "Provide a custom emoji token like `<:name:id>` or `<a:name:id>`.");

    const me = message.guild.members.me;
    if (!me.permissions.has(PermissionFlagsBits.ManageEmojisAndStickers))
      return error(message, message.guild, "I lack the **Manage Emojis and Stickers** permission.");

    const name = parsed.name.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 32);
    if (!name) return error(message, message.guild, "Invalid emoji name derived from token. Use letters, numbers, and underscores only.");

    let created;
    try {
      created = await message.guild.emojis.create({
        attachment: parsed.url,
        name,
        reason: `${message.author.tag}: stolen emoji`,
      });
    } catch (e) {
      return error(message, message.guild, `Failed to steal emoji: ${e.message}`);
    }

    return success(message, message.guild, `Stolen emoji ${created.toString()} added as **\`${created.name}\`**.`);
  },
};
