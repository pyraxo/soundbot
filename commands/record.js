const { createWriteStream } = require("node:fs");
const { rename, unlink } = require("node:fs/promises");
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
  const filename = `${userId}-${Date.now()}`;
  const filepath = path.join(__dirname, "../clips", filename) + ".pcm";

  console.log(`Started recording ${filename}`);

  const pcmStream = receiver
    .subscribe(userId, {
      end: {
        behavior: EndBehaviorType.Manual,
      },
    })
    .pipe(
      new opus.Decoder({
        rate: 48000,
        channels: 2,
        frameSize: 120,
      })
    )
    .pipe(createWriteStream(filepath));

  pcmStream
    .on("error", (err) => console.warn(`Could not record ${filename}:`, err))
    .on("finish", () => {
      console.log(`Recorded ${filename}`);
      pcmStream.destroy();
    });

  return filepath;
};

const initRecord = (receiver, ids) => {
  const paths = ids.map((memberId) => startRecording(receiver, memberId));
  return paths;
};

const endRecord = async (paths, newPath, isGroup = false) => {
  if (!paths.length) {
    throw new Error("No file paths found");
  }
  if (isGroup) {
    const command = ffmpeg()
      .setFfmpegPath(ffmpegPath)
      .outputOptions("-ac 2")
      .outputOptions("-ab 96k")
      .outputOptions(
        `-filter_complex amix=inputs=${paths.length}:duration=longest:dropout_transition=2`
      )
      .format("mp3")
      .on("error", (err) => {
        console.log(`Error encountered while trying to merge mp3: ${err}`);
      })
      .once("end", async () => {
        console.log(`Converted ${newPath}`);
        try {
          for (const temppath of paths) {
            await unlink(temppath);
            console.log(`Deleted group recording from user @ ${temppath}`);
          }
        } catch (err) {
          console.warn("Error merging recordings:", err);
        }
      });

    for (const temppath of paths) {
      command.input(temppath).inputFormat("s32le");
    }

    return command.save(newPath);
  } else {
    return ffmpeg()
      .setFfmpegPath(ffmpegPath)
      .input(paths[0])
      .inputFormat("s32le")
      .outputOptions("-af asetrate=44100*1.1,aresample=44100")
      .outputOptions("-ac 2")
      .outputOptions("-ab 96k")
      .format("mp3")
      .on("error", (err) => {
        console.warn(`Error encountered while trying to convert to mp3:`, err);
      })
      .once("end", async () => {
        console.log(`Converted ${paths[0]}`);
        await unlink(paths[0]);
        await rename(paths[0].replace("pcm", "mp3"), newPath);
        console.log(`Deleted old ${paths[0]}`);
      })
      .save(paths[0].replace("pcm", "mp3"));
  }
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

    const clipName = interaction.options.getString("clip");

    if (interaction.client.loadedFiles[clipName]) {
      return interaction.reply({
        content: "There is already a recording with that name!",
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
        collector.resetTimer();
        interaction.client.ongoingRecordings[member.id] = {
          rcv: {},
          paths: [],
          clipName: clipName,
        };
        const paths = initRecord(
          receiver,
          isGroup ? member.voice.channel.members.map((m) => m.id) : [member.id]
        );
        interaction.client.ongoingRecordings[member.id].paths = paths;
        await i.update({
          content:
            "Recording has started! Press the **Stop** button to end it!",
          components: [updatedRow],
          ephemeral: true,
        });
      } else if (i.customId === `stop:${member.id}`) {
        for (const id in interaction.client.ongoingRecordings[member.id].rcv) {
          interaction.client.ongoingRecordings[member.id].rcv[id].destroy();
          delete interaction.client.ongoingRecordings[member.id].rcv[id];
        }
        const { clipName, paths } =
          interaction.client.ongoingRecordings[member.id];
        const newPath = path.join(__dirname, "../clips", clipName) + ".mp3";
        try {
          await endRecord(paths, newPath, isGroup);
        } catch (err) {
          console.warn(err);
          return i.update({
            content: "😢 Recording failed. Try again later?",
            components: [],
            ephemeral: true,
          });
        }
        // Save file with clipName
        collector.stop("Recording ended");
        delete interaction.client.ongoingRecordings[member.id];
        await i.update({
          content: `👍 Recording completed! Your new clip is \`${clipName}\``,
          components: [],
          ephemeral: true,
        });
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
