module.exports = {
    name: 'play',
    description: 'Plays a voice clip',
    async execute(msg, args, bot) {
        if (typeof args[0] === 'undefined') {
            return msg.channel.send('lol idk what file u want me to play')
        }

        const authorVoiceState = msg.channel.guild.voiceStates.resolve(msg.author.id)
        if (!authorVoiceState) {
            console.log('Author is not in channel')
            return msg.channel.send('lol ure not in a vc')
        }

        const filename = args.join(' ').toLowerCase()

        if (typeof bot.loadedFiles[filename] === 'undefined') {
            let botConn = await authorVoiceState.channel.join()

            if (bot.loadedFiles['nofilename']) {
                await botConn.play(bot.loadedFiles['nofilename'], { volume: 1 })
            }
            return msg.channel.send('thats some nonsense filename')
        }

        let botConn = await authorVoiceState.channel.join()

        try {
            await botConn.play(bot.loadedFiles[filename], { volume: 1 })
        } catch (err) {
            console.error(err)
        }
    }
}