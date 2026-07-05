const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { addAudit } = require("../../database");
const { buildEmbed, error } = require("../../embedBuilder");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("massrole")
    .setDescription("Add a role to every member of the server")
    .addRoleOption((o) => o.setName("role").setDescription("Role to add to all members").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  name: "massrole",
  category: "Premium",
  premium: true,
  permissions: [PermissionFlagsBits.ManageRoles],
  aliases: [],

  async executeInteraction(interaction, client) {
    const role = interaction.options.getRole("role");

    if (role.managed) {
      return error(interaction, interaction.guild, "I can't assign a managed role (bot/integration role).");
    }
    if (role.position >= interaction.guild.members.me.roles.highest.position) {
      return error(
        interaction,
        interaction.guild,
        "I can't assign a role higher than or equal to my highest role. Move my role above the target role.",
      );
    }

    await interaction.deferReply();
    await interaction.editReply({
      content: `⏳ Mass-assigning **${role.name}** to all members. This may take a while in large servers...`,
    });

    let count = 0;
    let failed = 0;
    let skipped = 0;
    try {
      const members = await interaction.guild.members.fetch();
      for (const member of members.values()) {
        if (member.user.bot) {
          skipped++;
          continue;
        }
        if (member.roles.cache.has(role.id)) {
          skipped++;
          continue;
        }
        try {
          await member.roles.add(role, `Massrole by ${interaction.user.tag}`);
          count++;
        } catch {
          failed++;
        }
      }
    } catch (e) {
      const errEmbed = buildEmbed("error", interaction.guild, {
        detail: `Failed to fetch members: \`${e.message}\``,
      });
      return interaction.editReply({ content: "", embeds: [errEmbed] });
    }

    addAudit(
      interaction.guild.id,
      "massrole",
      interaction.user.tag,
      `Added ${role.name} (${role.id}) to ${count} members (${failed} failed, ${skipped} skipped)`,
      "warning",
    );
    const embed = buildEmbed("success", interaction.guild, {
      detail: `Mass-assigned **${role.name}** to **${count}** member(s)${failed ? `, **${failed}** failed` : ""}${skipped ? `, **${skipped}** skipped` : ""}.`,
    });
    return interaction.editReply({ content: "", embeds: [embed] });
  },

  async execute(message, args, client) {
    const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[0]);
    if (!role) {
      return error(message, message.guild, "Please mention a role or provide its ID. Example: `!massrole @role`");
    }
    if (role.managed) {
      return error(message, message.guild, "I can't assign a managed role (bot/integration role).");
    }
    if (role.position >= message.guild.members.me.roles.highest.position) {
      return error(
        message,
        message.guild,
        "I can't assign a role higher than or equal to my highest role. Move my role above the target role.",
      );
    }

    const progress = await message.channel.send(
      `⏳ Mass-assigning **${role.name}** to all members. This may take a while in large servers...`,
    );

    let count = 0;
    let failed = 0;
    let skipped = 0;
    try {
      const members = await message.guild.members.fetch();
      for (const member of members.values()) {
        if (member.user.bot) {
          skipped++;
          continue;
        }
        if (member.roles.cache.has(role.id)) {
          skipped++;
          continue;
        }
        try {
          await member.roles.add(role, `Massrole by ${message.author.tag}`);
          count++;
        } catch {
          failed++;
        }
      }
    } catch (e) {
      const errEmbed = buildEmbed("error", message.guild, {
        detail: `Failed to fetch members: \`${e.message}\``,
      });
      return progress.edit({ content: "", embeds: [errEmbed] });
    }

    addAudit(
      message.guild.id,
      "massrole",
      message.author.tag,
      `Added ${role.name} (${role.id}) to ${count} members (${failed} failed, ${skipped} skipped)`,
      "warning",
    );
    const embed = buildEmbed("success", message.guild, {
      detail: `Mass-assigned **${role.name}** to **${count}** member(s)${failed ? `, **${failed}** failed` : ""}${skipped ? `, **${skipped}** skipped` : ""}.`,
    });
    return progress.edit({ content: "", embeds: [embed] });
  },
};
