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
const { SlashCommandBuilder, GuildMember } = require("discord.js");

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
        ephemeral: true,
      });
    }

    const clipName = interaction.options.getString("clip");
    if (typeof interaction.client.loadedFiles[clipName] === "undefined") {
      return interaction.reply({
        content: `The clip ${clipName} doesn't exist.`,
        ephemeral: true,
      });
    }

    const member = interaction.member;
    if (!(member instanceof GuildMember && member.voice.channel)) {
      return interaction.reply({
        content: "You're not in a voice channel!",
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    let connection = getVoiceConnection(interaction.guildId);
    if (!connection) {
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
        content: `Could not connect to ${member.voice.channel.name}`,
        ephemeral: true,
      });
    }

    connection.once(VoiceConnectionStatus.Ready, () => {
      console.log(
        `Connection created by ${member.displayName} in ${member.guild.name} > #${member.voice.channel.name}`
      );
    });

    connection.once(
      VoiceConnectionStatus.Disconnected,
      async (oldState, newState) => {
        try {
          await Promise.race([
            entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
            entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
          ]);
          // Seems to be reconnecting to a new channel - ignore disconnect
        } catch (error) {
          // Seems to be a real disconnect which SHOULDN'T be recovered from
          connection.destroy();
        }
      }
    );

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

    player.once("error", (err) => {
      console.error(
        `Error: ${err.message} with resource ${err.resource.metadata.title}`
      );
      player.stop();
    });

    player.once(AudioPlayerStatus.Idle, () => {
      player.stop();
    });

    const subscription = connection.subscribe(player);

    // subscription could be undefined if the connection is destroyed!
    if (subscription) {
      // Unsubscribe after 5 seconds (stop playing audio on the voice connection)
      setTimeout(() => subscription.unsubscribe(), 5_000);
    }

    return interaction.followUp({
      content: `Playing ${clipName}`,
      ephemeral: true,
    });
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
