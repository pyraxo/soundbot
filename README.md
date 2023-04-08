# Soundbot

Discord.js bot that records solo and group audio from a voice channel.

## Usage

```bash
$ npm i
$ npm start
```

Edit `env.example.json` and save as `env.json`.

`opusscript` was used instead of `@discordjs/opus` for fast prototyping. FFMPEG is required.

This is a personal bot for a private server and the code is for educational purposes only. Minimal testing was done.

## Commands
* `record <clipname>` - Starts an audio recording from the user running the command
* `grouprec <clipname>` - Starts a group recording of everyone in the voice channel, excluding bots
* `stop` - Stops recording
* `list` - Lists all recordings
* `delete <clipname>` - Deletes the specified clip
* `play <clipname>` - Plays the specified clip