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
const { SlashCommandBuilder, MessageFlags } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("parry")
    .setDescription("Stops all sounds and plays the parry sound"),
  async execute(interaction) {
    if (Object.keys(interaction.client.ongoingRecordings).length > 0) {
      return interaction.reply({
        content: "There's an ongoing recording. Try again later.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const clipName = "parry";
    if (typeof interaction.client.loadedFiles[clipName] === "undefined") {
      return interaction.reply({
        content: `The parry clip doesn't exist! Upload it with \`/upload name:parry\``,
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply();

    const member = interaction.member;
    let connection = getVoiceConnection(interaction.guildId);

    // If bot is not in a voice channel, check if user is in one
    if (!connection) {
      if (!(member.voice?.channel)) {
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

    // Stop any currently playing audio
    const currentSubscription = connection.state.subscription;
    if (currentSubscription) {
      currentSubscription.player.stop();
      currentSubscription.unsubscribe();
    }

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
      content: `🛡️ PARRY!`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
