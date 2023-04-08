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
const chokidar = require("chokidar");

const { token, clientId, guildId } = require("./env.json");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});
client.commands = new Collection();
client.ongoingRecordings = {};
client.loadedFiles = {};

const watcherOptions = { ignored: /(^|[\/\\])\../, persistent: true };

const resolveDir = (folderName) => path.join(__dirname, folderName);

const clipWatcher = chokidar.watch(resolveDir("clips"), watcherOptions);
clipWatcher.on("add", (filepath) => {
  if (path.extname(filepath) === ".mp3") {
    client.loadedFiles[path.basename(filepath, ".mp3")] = filepath;
  }
});

const cmdWatcher = chokidar.watch(resolveDir("commands"), watcherOptions);
cmdWatcher.on("add", (filepath) => {
  if (path.extname(filepath) === ".js") {
    const command = require(filepath);
    client.commands.set(command.data.name, command);
  }
});

client.once(Events.ClientReady, async () => {
  console.log("Client is ready");
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

const loadFiles = async () => {
  const files = await fs.readdir(path.join(__dirname, "clips"));
  const dict = {};
  for (const filepath of files) {
    if (path.extname(filepath) === ".mp3") {
      const clipPath = path.join(__dirname, "clips", filepath);
      dict[path.basename(filepath, ".mp3")] = clipPath;
    }
  }
  client.loadedFiles = dict;
  console.log(`Loaded ${Object.keys(client.loadedFiles).length} clips.`);
};

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
      { body: client.commands.map((cmd) => cmd.data.toJSON()) }
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
  await loadFiles();
  // await registerCommands();
  await client.login(token);
})();
