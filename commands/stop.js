const path = require('path')
const fs = require('fs/promises')
const ffmpeg = require('fluent-ffmpeg')
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;

module.exports = {
    name: 'stop',
    description: 'Stops recording',
    async execute(msg, args, bot) {
        if (!bot.ongoingRecordings[msg.author.id] === 'undefined') return
        const recording = bot.ongoingRecordings[msg.author.id]

        if (!recording.isGroup) {
            recording.botConn.disconnect()

            ffmpeg().setFfmpegPath(ffmpegPath)
            .input(recording.temppath)
            .inputFormat('s32le')
            .outputOptions('-af asetrate=44100*1.1,aresample=44100')
            .outputOptions('-ac 2')
            .outputOptions('-ab 96k')
            .format('mp3')
            .on('error', err => {
                console.log(`Error encountered while trying to convert to mp3: ${err}`);
            })
            .on('end', async () => {
                console.log(`Converted ${recording.filename}.mp3`);
                await fs.unlink(recording.temppath)
                console.log(`Deleted old ${recording.temppath}`)
            })
            .save(recording.filepath.replace('pcm', 'mp3'))

            delete bot.ongoingRecordings[msg.author.id]
            await msg.channel.send(`ok, file saved as ${recording.filename}`)
        } else {
            recording.botConn.disconnect()

            const command = ffmpeg().setFfmpegPath(ffmpegPath)
            .outputOptions('-ac 2')
            .outputOptions('-ab 96k')
            .outputOptions(`-filter_complex amix=inputs=${recording.recordings.length}:duration=first:dropout_transition=0`)
            .format('mp3')
            .on('error', err => {
                console.log(`Error encountered while trying to merge mp3: ${err}`);
            })
            .on('end', async () => {
                console.log(`Converted ${recording.filename}.mp3`);
                for (const userRecording of recording.recordings) {
                    await fs.unlink(userRecording.temppath)
                    console.log(`Deleted group recording from user @ ${userRecording.temppath}`)
                }
            })

            for (const userRecording of recording.recordings) {
                command.input(userRecording.temppath).inputFormat('s32le')
            }

            command.save(recording.filepath.replace('pcm', 'mp3'))
        }
    }
}