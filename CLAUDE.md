# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Soundbot is a Discord.js v14 bot that records solo and group audio from voice channels. It uses slash commands and provides interactive button-based UX for recording control.

## Development Commands

```bash
npm install              # Install dependencies
npm start                # Start the bot (runs index.js)
```

## Production Deployment with PM2

The bot is deployed using PM2 for process management, automatic restarts, and logging.

### PM2 Commands

```bash
# Start the bot with PM2
pm2 start ecosystem.config.js

# View bot status
pm2 status

# View live logs
pm2 logs soundbot

# View last 100 log lines
pm2 logs soundbot --lines 100

# Restart the bot
pm2 restart soundbot

# Stop the bot
pm2 stop soundbot

# Remove from PM2
pm2 delete soundbot
```

### Auto-Start on Server Reboot

To configure PM2 to auto-start the bot on server reboot:

```bash
# Save the current PM2 process list
pm2 save

# Generate and run the startup script (requires sudo)
pm2 startup
# Follow the instructions printed by the command above
```

The startup command will print a `sudo` command that you need to run to enable auto-start.

### Log Files

PM2 logs are stored in the `logs/` directory:
- `logs/out.log` - Standard output
- `logs/error.log` - Error output

You can also view logs using PM2's built-in log viewer: `pm2 logs soundbot`

### Configuration Setup

```bash
cp env.example.json env.json
# Then edit env.json with:
# - token: Discord bot token
# - clientId: Discord application client ID
# - guildId: Discord server (guild) ID
```

### Command Registration

The `registerCommands()` function in index.js is currently commented out (line 151). To register slash commands with Discord, uncomment this line before running the bot for the first time or after adding/modifying commands.

## Architecture

### Entry Point (index.js)

- Creates Discord client with required intents: `Guilds` and `GuildVoiceStates`
- Manages two critical global state objects on the client:
  - `client.commands`: Collection of loaded slash commands
  - `client.ongoingRecordings`: Tracks active recordings per user (keyed by member.id)
  - `client.loadedFiles`: Maps clip names to file paths for all audio clips
- Implements hot-reload watchers using chokidar for both commands and clips directories
- Handles both command execution and autocomplete interactions

### Command Structure

Commands live in `commands/` directory. Each exports:
- `data`: SlashCommandBuilder with command definition
- `execute(interaction)`: Async function to handle command execution
- `autocomplete(interaction)` (optional): Async function to handle autocomplete requests

### Recording Architecture

The `/record` command implements a multi-stage audio recording pipeline:

1. **Connection**: Joins voice channel using `@discordjs/voice`
2. **Recording**:
   - Solo mode: Records only the command user
   - Group mode: Records all non-bot members in the voice channel
   - Raw audio is captured as PCM streams, decoded from Opus using `prism-media`
   - Each user's audio is saved as a separate `.pcm` file during recording
3. **Processing**:
   - Solo recordings: Converted to MP3 with pitch correction (`asetrate=44100*1.1`)
   - Group recordings: Mixed together using ffmpeg's `amix` filter, then converted to MP3
   - Temporary PCM files are deleted after conversion
4. **State Management**: Uses interactive buttons (Record/Stop) with a message component collector that times out after 60 seconds of inactivity

### File Watching

- `clipWatcher`: Monitors `clips/` for .mp3 and .ogg files, auto-updates `client.loadedFiles`
- `cmdWatcher`: Monitors `commands/` for .js files, enables hot-reload by clearing require cache on changes

Both watchers use polling mode with 1-second intervals for reliability.

### Audio Playback

The `/play` command:
- Uses autocomplete to suggest available clips from `client.loadedFiles`
- Creates an AudioPlayer with NoSubscriberBehavior.Stop
- Uses `demuxProbe` to auto-detect audio format
- Automatically unsubscribes after 5 seconds (hardcoded timeout)
- Handles voice connection lifecycle with reconnection logic

### Audio Upload

The `/upload` command allows importing audio clips from external sources:
- **File Upload**: Users can upload MP3 or OGG files directly via Discord's file picker
- **URL Import**: Users can provide a URL to download MP3 or OGG files
- Both options are supported in a single command for flexibility
- Validates file extensions and checks for duplicate clip names
- Downloaded files are saved to the `clips/` directory
- Automatically added to `client.loadedFiles` via the file watcher

## Available Commands

- `/record` - Record audio from voice channels (solo or group mode)
- `/play` - Play saved audio clips
- `/upload` - Upload audio clips from files or URLs
- `/list` - List all available clips
- `/delete` - Delete saved clips
- `/ping` - Check bot responsiveness

## Key Dependencies

- `discord.js` v14.25.0: Core Discord API client
- `@discordjs/voice` v0.19.0: Voice channel connections and audio streaming
- `@discordjs/opus` v0.10.0: Opus audio codec
- `@snazzah/davey`: Required for Discord's DAVE voice encryption protocol
- `prism-media`: Audio format decoding (Opus to PCM)
- `fluent-ffmpeg`: Audio processing and conversion
- `ffmpeg-static` / `@ffmpeg-installer/ffmpeg`: FFmpeg binaries
- `chokidar`: File system watching
- `pm2`: Process manager for production deployment

**Node.js Version**: 22.21.1 (LTS) - Pinned via Volta

## Important Notes

- This bot is designed for a single guild (server) - commands are registered per-guild, not globally
- Recording blocks playback: If any user has an ongoing recording, playback commands will fail
- Group recordings filter out bot users to prevent feedback loops
- The bot must not be deafened (`selfDeaf: false`) to receive audio
- All audio files are stored in `clips/` directory
- PCM format used internally: 48000 Hz, 2 channels, s32le
- Solo recordings apply 1.1x pitch correction during conversion
