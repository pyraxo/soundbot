const path = require('path')
const fsSync = require('fs')

module.exports = {
    name: 'record',
    description: 'Starts recording audio',
    async execute(msg, args, bot) {
        const clipName = args.join(' ').toLowerCase()
        if (typeof bot.loadedFiles[clipName] !== 'undefined') {
            return msg.channel.send('lol try another name, this one\'s already taken')
        }
        const authorVoiceState = msg.channel.guild.voiceStates.resolve(msg.author.id)
        if (!authorVoiceState) {
            console.log('Author is not in channel')
            msg.channel.send('lol ure not in a vc')
        }

        let botConn = await authorVoiceState.channel.join()

        const filename = (args.length > 0 ? args.join(' ') : `${msg.author.id}-${Date.now()}`).toLowerCase()
        const filepath = path.join(__dirname, '../clips', filename) + '.pcm'
        const temppath = `${path.join(__dirname, '../clips', filename)}-tmp${Date.now()}.pcm`
        const dataStream = botConn.receiver.createStream(msg.author, { mode: 'pcm', end: 'manual' })

        dataStream.pipe(fsSync.createWriteStream(temppath))

        bot.ongoingRecordings[msg.author.id] = {
            botConn,
            filename,
            filepath,
            temppath,
            isGroup: false
        }
    }
}