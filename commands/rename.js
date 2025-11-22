const { SlashCommandBuilder } = require("discord.js");
const { rename } = require("node:fs/promises");
const path = require("node:path");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("rename")
    .setDescription("Rename an existing clip")
    .addStringOption((option) =>
      option
        .setName("oldname")
        .setDescription("The clip to rename")
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption((option) =>
      option
        .setName("newname")
        .setDescription("The new name for the clip (without extension)")
        .setRequired(true)
    ),
  async execute(interaction) {
    const oldName = interaction.options.getString("oldname");
    const newName = interaction.options.getString("newname");

    // Check if old clip exists
    if (!interaction.client.loadedFiles[oldName]) {
      return interaction.reply({
        content: `The clip \`${oldName}\` doesn't exist.`,
        ephemeral: true,
      });
    }

    // Check if new name is already taken
    if (interaction.client.loadedFiles[newName]) {
      return interaction.reply({
        content: `A clip named \`${newName}\` already exists! Choose a different name.`,
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    try {
      const oldPath = interaction.client.loadedFiles[oldName];
      const extension = path.extname(oldPath);
      const newPath = path.join(path.dirname(oldPath), `${newName}${extension}`);

      // Rename the file
      await rename(oldPath, newPath);

      return interaction.followUp({
        content: `✅ Successfully renamed \`${oldName}\` to \`${newName}\``,
        ephemeral: true,
      });
    } catch (err) {
      console.error("Error renaming clip:", err);
      return interaction.followUp({
        content: `❌ Failed to rename clip: ${err.message}`,
        ephemeral: true,
      });
    }
  },
  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused();
    const choices = Object.keys(interaction.client.loadedFiles).filter(
      (choice) => choice.startsWith(focusedValue)
    );
    await interaction.respond(
      choices.map((choice) => ({ name: choice, value: choice })).slice(0, 25)
    );
  },
};
