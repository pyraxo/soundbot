const fs = require('fs/promises')

module.exports = {
    name: 'delete',
    description: 'Deletes a clip',
    async execute(msg, args, bot) {
        const clipName = args.join(' ').toLowerCase()
        if (typeof bot.loadedFiles[clipName] === 'undefined') {
            return msg.channel.send('u sure that clip exists? lol')
        }

        await fs.unlink(bot.loadedFiles[clipName])
        console.log(`Deleted ${clipName}`)
        delete bot.loadedFiles[clipName]
        return msg.channel.send(`alright, \`${clipName}\`'s gone`)
    }
}