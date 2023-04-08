const path = require('path')
const fsSync = require('fs')

module.exports = {
    name: 'grouprec',
    description: 'Starts recording audio for the entire group',
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
        const filepath = `${path.join(__dirname, '../clips', filename)}.pcm`

        let recordings = []
        for (const member of authorVoiceState.channel.members.array()) {
            if (member.user.bot) continue
            const userTemppath = `${path.join(__dirname, '../clips', filename)}-${member.id}tmp.pcm`
            const dataStream = botConn.receiver.createStream(member, { mode: 'pcm', end: 'manual' })

            dataStream.pipe(fsSync.createWriteStream(userTemppath))

            recordings.push({
                temppath: userTemppath,
                id: member.id
            })
        }

        bot.ongoingRecordings[msg.author.id] = {
            botConn,
            filename,
            filepath,
            recordings,
            isGroup: true
        }
    }
}