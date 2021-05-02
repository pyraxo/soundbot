module.exports = {
    name: 'list',
    description: 'Lists all available clips',
    execute(msg, args, bot) {
        return msg.channel.send([
            `List of saved clips (total: ${Object.keys(bot.loadedFiles).length}):`,
            Object.keys(bot.loadedFiles).map(name => `\`${name}\``).join(', ')
        ].join('\n'))
    }
}