const {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
} = require("discord.js");
const fs = require("node:fs/promises");
const path = require("node:path");
const { once } = require("node:events");
const chokidar = require("chokidar");

const { token, clientId, guildId } = require("./env.json");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});
client.commands = new Collection();
client.ongoingRecordings = {};
client.loadedFiles = {};

const watcherOptions = {
  ignored: /(^|[\/\\])\../,
  persistent: true,
  usePolling: true,
  interval: 1000,
};

const resolveDir = (folderName) => path.join(__dirname, folderName);

const clipWatcher = chokidar.watch(resolveDir("clips"), watcherOptions);
clipWatcher.on("all", (event, filepath) => {
  if (![".mp3", ".ogg"].includes(path.extname(filepath))) return;
  const filename = path.basename(filepath, path.extname(filepath));

  if (event === "add" || event === "change") {
    client.loadedFiles[filename] = filepath;
  } else if (event === "unlink") {
    console.log(`Clip watcher detects deleted clip: ${filepath}`);
    if (client.loadedFiles[filename]) {
      delete client.loadedFiles[filename];
    }
  }
});

const cmdWatcher = chokidar.watch(resolveDir("commands"), watcherOptions);
cmdWatcher.on("all", (event, filepath) => {
  if (path.extname(filepath) !== ".js") return;
  if (event !== "change" && event !== "add") return;
  if (event === "change") {
    console.log(`Command watcher detects edited command: ${filepath}`);
    delete require.cache[require.resolve(filepath)];
  }
  const command = require(filepath);
  client.commands.set(command.data.name, command);
});

client.once(Events.ClientReady, async () => {
  console.log("Client is ready!");
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
      console.error(
        `No command matching ${interaction.commandName} was found.`
      );
      return;
    }

    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(`Error running command ${interaction.commandName}`);
      console.error(err);

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: "Error executing command!",
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: "Error executing command!",
          ephemeral: true,
        });
      }
    }
  } else if (interaction.isAutocomplete()) {
    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
      console.error(
        `No command matching ${interaction.commandName} was found.`
      );
      return;
    }

    try {
      await command.autocomplete(interaction);
    } catch (error) {
      console.error(error);
    }
  }
});

process.on("error", console.error);

process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
});

const registerCommands = async () => {
  try {
    const commands = [];
    const commandFiles = (await fs.readdir(resolveDir("commands"))).filter(
      (file) => file.endsWith(".js")
    );

    for (const file of commandFiles) {
      const command = require(`./commands/${file}`);
      commands.push(command.data.toJSON());
    }

    const rest = new REST({ version: "10" }).setToken(token);
    ``;
    console.log(
      `Started refreshing ${commands.length} application (/) commands.`
    );

    const data = await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );

    console.log(
      `Successfully reloaded ${data.length} application (/) commands.`
      // `Successfully reloaded ${commands.length} application (/) commands.`
    );
  } catch (error) {
    console.error(error);
  }
};

(async () => {
  await once(clipWatcher, "ready");
  await once(cmdWatcher, "ready");
  // await registerCommands();
  console.log(`Loaded ${Object.keys(client.loadedFiles).length} clips.`);
  await client.login(token);
})();
