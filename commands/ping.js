const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder().setName("ping").setDescription("Ping!"),
  async execute(interaction) {
    const sent = await interaction.reply({
      content: "Pinging...",
      fetchReply: true,
    });
    return interaction.editReply(
      `Ping took \`${sent.createdTimestamp - interaction.createdTimestamp}\` ms`
    );
  },
};
