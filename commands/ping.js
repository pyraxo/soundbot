module.exports = {
    name: 'ping',
    description: 'Ping!',
    async execute(msg) {
        const time = Date.now()
        const reply = await msg.channel.send('pong!')
        return reply.edit(`pong took \`${Date.now() - time}\` ms`)
    }
}