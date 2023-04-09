const { unlink } = require("node:fs/promises");
const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("delete")
    .setDescription("Deletes a clip")
    .addStringOption((option) =>
      option
        .setName("clip")
        .setDescription("The clip to delete")
        .setRequired(true)
        .setAutocomplete(true)
    ),
  async execute(interaction) {
    const clipName = interaction.options.getString("clip");
    if (!interaction.client.loadedFiles[clipName]) {
      return interaction.reply({
        content: `The clip ${clipName} doesn't exist.`,
        ephemeral: true,
      });
    }

    await unlink(interaction.client.loadedFiles[clipName]);
    console.log(`${interaction.member.displayName} deleted clip ${clipName}`);
    delete interaction.client.loadedFiles[clipName];
    return interaction.reply(`Deleted clip \`${clipName}\`.`);
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
