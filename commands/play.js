const {
  joinVoiceChannel,
  getVoiceConnection,
  createAudioPlayer,
  NoSubscriberBehavior,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  demuxProbe,
  createAudioResource,
} = require("@discordjs/voice");
const { createReadStream } = require("node:fs");
const { SlashCommandBuilder, GuildMember, MessageFlags } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Plays a voice clip")
    .addStringOption((option) =>
      option
        .setName("clip")
        .setDescription("The clip to play")
        .setRequired(true)
        .setAutocomplete(true)
    ),
  async execute(interaction) {
    if (Object.keys(interaction.client.ongoingRecordings).length > 0) {
      return interaction.reply({
        content: "There's an ongoing recording. Try again later.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const clipName = interaction.options.getString("clip");
    if (typeof interaction.client.loadedFiles[clipName] === "undefined") {
      return interaction.reply({
        content: `The clip ${clipName} doesn't exist.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply();

    const member = interaction.member;
    let connection = getVoiceConnection(interaction.guildId);

    // If bot is not in a voice channel, check if user is in one
    if (!connection) {
      if (!(member instanceof GuildMember && member.voice.channel)) {
        return interaction.followUp({
          content: "You're not in a voice channel and the bot isn't connected to one!",
          flags: MessageFlags.Ephemeral,
        });
      }

      // Join the user's voice channel
      connection = joinVoiceChannel({
        channelId: member.voice.channelId,
        guildId: interaction.guildId,
        adapterCreator: interaction.guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false,
      });
    }

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
    } catch (err) {
      console.warn(err);
      return interaction.followUp({
        content: `Could not connect to voice channel`,
        flags: MessageFlags.Ephemeral,
      });
    }

    connection.once(VoiceConnectionStatus.Ready, () => {
      const channelName = member.voice?.channel?.name || "voice channel";
      console.log(
        `Connection used by ${member.displayName} in ${member.guild.name} > #${channelName}`
      );
    });

    const player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Stop,
      },
    });

    const readStream = createReadStream(
      interaction.client.loadedFiles[clipName]
    );
    const { stream, type } = await demuxProbe(readStream);
    const resource = createAudioResource(stream, {
      inputType: type,
      inlineVolume: false,
      metadata: { title: interaction.client.loadedFiles[clipName] },
    });

    player.play(resource);

    entersState(player, AudioPlayerStatus.Playing, 5000);

    const subscription = connection.subscribe(player);

    player.once("error", (err) => {
      console.error(
        `Error: ${err.message} with resource ${err.resource.metadata.title}`
      );
      player.stop();
      if (subscription) {
        subscription.unsubscribe();
      }
    });

    player.once(AudioPlayerStatus.Idle, () => {
      player.stop();
      // Unsubscribe when playback completes naturally
      if (subscription) {
        subscription.unsubscribe();
      }
    });

    return interaction.followUp({
      content: `Playing ${clipName}`,
      flags: MessageFlags.Ephemeral,
    });
  },
  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused();
    const focusedLower = focusedValue.toLowerCase();
    const choices = Object.keys(interaction.client.loadedFiles).filter(
      (choice) => choice.toLowerCase().startsWith(focusedLower)
    );
    await interaction.respond(
      choices.map((choice) => ({ name: choice, value: choice })).slice(0, 25)
    );
  },
};
