const { createWriteStream } = require("node:fs");
const { rename, unlink } = require("node:fs/promises");
const { pipeline } = require("node:stream");
const path = require("node:path");
const {
  joinVoiceChannel,
  getVoiceConnection,
  VoiceConnectionStatus,
  entersState,
  EndBehaviorType,
} = require("@discordjs/voice");
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  GuildMember,
} = require("discord.js");
const { opus } = require("prism-media");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;

const startRecording = (receiver, userId) => {
  const opusStream = receiver.subscribe(userId, {
    end: {
      behavior: EndBehaviorType.AfterSilence,
      duration: 1000,
    },
  });

  const oggStream = new opus.OggLogicalBitstream({
    opusHead: new opus.OpusHead({
      channelCount: 2,
      sampleRate: 48000,
    }),
    pageSizeControl: {
      maxPackets: 10,
    },
    crc: false,
  });

  const filename = `${userId}-${Date.now()}`;
  const filepath = path.join(__dirname, "../clips", filename) + ".ogg";
  const out = createWriteStream(filepath);
  console.log(`Started recording ${filename}`);
  pipeline(opusStream, oggStream, out, (err) =>
    err
      ? console.warn(`Could not record ${filename}:`, err)
      : console.log(`Recorded ${filename}`)
  );

  return filepath;
};

const initRecord = (receiver, ids) => {
  const paths = ids.map((memberId) => startRecording(receiver, memberId));
  return paths;
};

const endRecord = async (userId, paths, newPath) => {
  if (!paths.length) {
    throw new Error("No file paths found");
  }

  const command = ffmpeg()
    .setFfmpegPath(ffmpegPath)
    .outputOptions("-ac 2")
    .outputOptions("-ab 96k")
    .outputOptions(
      `-filter_complex amix=inputs=${paths.length}:duration=first:dropout_transition=0`
    )
    .format("mp3")
    .on("error", (err) => {
      console.log(`Error encountered while trying to merge mp3: ${err}`);
    })
    .once("end", async () => {
      console.log(`Converted ${filename}.mp3`);
      try {
        await rename(filepath, newPath);
        for (const temppath of paths) {
          await unlink(temppath);
          console.log(`Deleted group recording from user @ ${temppath}`);
        }
      } catch (err) {
        console.warn(err);
      }
    });

  for (const temppath of paths) {
    command.input(temppath).inputFormat("opus");
  }

  return command.save(newPath);
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("record")
    .setDescription("Records a voice clip")
    .addStringOption((option) =>
      option
        .setName("clip")
        .setDescription("Name of the clip")
        .setRequired(true)
    )
    .addBooleanOption((option) =>
      option
        .setName("group")
        .setDescription("Whether or not to record everyone in the channel")
        .setRequired(false)
    ),
  async execute(interaction) {
    if (interaction.client.ongoingRecordings[interaction.member.id]) {
      return interaction.reply({
        content: "You have an ongoing recording. End that one first!",
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

    const isGroup = interaction.options.getBoolean("group");
    const clipName = interaction.options.getString("clip");

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
    const receiver = connection.receiver;

    connection.once(VoiceConnectionStatus.Ready, () => {
      console.log(
        `Connection created by ${member.displayName} in ${member.guild.name} > #${member.voice.channel.name}`
      );
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`record:${member.id}`)
        .setLabel("Record")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🔴")
        .setDisabled(false),
      new ButtonBuilder()
        .setCustomId(`stop:${member.id}`)
        .setLabel("Stop")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
        .setEmoji("⏹️")
    );

    const updatedRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`record:${member.id}`)
        .setLabel("Record")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("🔴")
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`stop:${member.id}`)
        .setLabel("Stop")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(false)
        .setEmoji("⏹️")
    );

    const collector = interaction.channel.createMessageComponentCollector({
      filter: (i) => i.user.id === member.id,
      time: 60_000,
    });

    collector.on("collect", async (i) => {
      if (i.customId === `record:${member.id}`) {
        await i.update({
          content:
            "Recording has started! Press the **Stop** button to end it!",
          components: [updatedRow],
          ephemeral: true,
        });
        collector.resetTimer();
        interaction.client.ongoingRecordings[member.id] = {
          rcv: {},
          paths: [],
          clipName: clipName,
        };
        const paths = initRecord(
          receiver,
          isGroup ? member.voice.channel.members : [member.id]
        );
        interaction.client.ongoingRecordings[member.id].paths = paths;
      } else if (i.customId === `stop:${member.id}`) {
        await i.update({
          content: "Recording has ended!",
          components: [],
          ephemeral: true,
        });
        for (const id in interaction.client.ongoingRecordings[member.id].rcv) {
          interaction.client.ongoingRecordings[member.id].rcv[id].destroy();
          delete interaction.client.ongoingRecordings[member.id].rcv[id];
        }
        const { clipName, paths } =
          interaction.client.ongoingRecordings[member.id];
        const newPath = path.join(__dirname, "../clips", clipName) + ".mp3";
        try {
          await endRecord(member.id, paths, newPath);
        } catch (err) {
          console.warn(err);
          return i.update({
            content: "Recording failed",
            components: [],
            ephemeral: true,
          });
        }
        // Save file with clipName
        collector.stop("Recording ended");
        delete interaction.client.ongoingRecordings[member.id];
      }
    });

    return interaction.followUp({
      content:
        "New recording initialised! Press the **Record** button to begin recording, and **Stop** to end it!",
      components: [row],
      ephemeral: true,
    });
  },
};
