# Soundbot

👂🗣 Discord.js bot that records solo and group audio from a voice channel.

Updated for Discord.js v14 and slash commands.

## Usage

```bash
npm i
npm start
cp env.example.json env.json
```

This is a personal bot for a private server and the code is for educational purposes only.

## Prerequisites

* `discord.js` v14
* Node v16 and above
* `ffmpeg-static` included
* `sodium-native` is used for encryption
* `@discordjs/opus` is used for Opus

## Commands

* `/record <clip:String> <group:Boolean>`
  * Starts recording the user running the command. Includes **record** and **stop** button for UX.
* `/list` - Lists all recordings
* `/delete <clip:String>` - Deletes the specified clip
* `/play <clip:String>` - Plays the specified clip
