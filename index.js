const Discord = require('discord.js')
const fs = require('fs/promises')
const fsSync = require('fs')
const path = require('path')
const ffmpeg = require('fluent-ffmpeg')
const chokidar = require('chokidar')

const env = require('./env.json')

const bot = new Discord.Client()
bot.commands = new Discord.Collection()
bot.ongoingRecordings = {}
bot.loadedFiles = {}

const watcherOptions = { ignored: /(^|[\/\\])\../, persistent: true }

const resolveDir = (folderName) => path.join(__dirname, folderName)

const clipWatcher = chokidar.watch(resolveDir('clips'), watcherOptions)
clipWatcher.on('add', filepath => {
    if (path.extname(filepath) === '.mp3') {
        bot.loadedFiles[path.basename(filepath, '.mp3')] = filepath
    }
})

const cmdWatcher = chokidar.watch(resolveDir('commands'), watcherOptions)
cmdWatcher.on('add', filepath => {
    if (path.extname(filepath) === '.js') {
        const command = require(filepath)
        bot.commands.set(command.name, command)
    }
})

bot.once('ready', async () => {
    console.log('Bot is ready')
})

bot.on('message', async msg => {
    if (!msg.content.startsWith(env.prefix) || msg.author.bot) return
    if (msg.channel.id !== env.channel) return

    const args = msg.content.slice(env.prefix.length).trim().split(/ +/)
    const command = args.shift().toLowerCase()

    if (!bot.commands.has(command)) return

    try {
        bot.commands.get(command).execute(msg, args, bot)
    } catch (err) {
        console.error(`Error running command ${command}`)
        console.error(err)
    }
})

process.on('error', console.error)

const loadFiles = async () => {
    const files = await fs.readdir(path.join(__dirname, 'clips'))
    bot.loadedFiles = files.reduce((dict, filepath) => {
        if (path.extname(filepath) === '.mp3') {
            dict[path.basename(filepath, '.mp3')] = path.join(__dirname, 'clips', filepath)
        }
        return dict
    }, {})
    console.log(`loaded ${Object.keys(bot.loadedFiles).length} clips`)
}

loadFiles().then(() => bot.login(env.token)).catch(console.error)