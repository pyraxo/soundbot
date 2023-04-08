const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("list")
    .setDescription("Lists all available clips"),
  async execute(interaction) {
    return interaction.reply(
      [
        `List of saved clips (total: ${
          Object.keys(interaction.client.loadedFiles).length
        }):`,
        Object.keys(interaction.client.loadedFiles)
          .map((name) => `\`${name}\``)
          .join(", "),
      ].join("\n")
    );
  },
};
