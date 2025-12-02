const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { writeFile } = require("node:fs/promises");
const path = require("node:path");
const https = require("node:https");
const http = require("node:http");

const downloadFile = (url) => {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;

    protocol.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirects
        downloadFile(response.headers.location).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
        return;
      }

      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve(Buffer.concat(chunks)));
      response.on("error", reject);
    }).on("error", reject);
  });
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("upload")
    .setDescription("Upload an audio clip from a file or URL")
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("Name for the clip (without extension)")
        .setRequired(true)
    )
    .addAttachmentOption((option) =>
      option
        .setName("file")
        .setDescription("Upload an MP3 or OGG file")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("url")
        .setDescription("URL to an MP3 or OGG file")
        .setRequired(false)
    ),
  async execute(interaction) {
    const clipName = interaction.options.getString("name");
    const attachment = interaction.options.getAttachment("file");
    const url = interaction.options.getString("url");

    // Check that at least one source is provided
    if (!attachment && !url) {
      return interaction.reply({
        content: "Please provide either a file upload or a URL!",
        flags: MessageFlags.Ephemeral,
      });
    }

    // Check if clip name already exists
    if (interaction.client.loadedFiles[clipName]) {
      return interaction.reply({
        content: `A clip named \`${clipName}\` already exists! Use /delete to remove it first or choose a different name.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply();

    try {
      let fileBuffer;
      let fileExtension;

      if (attachment) {
        // Handle file upload
        const attachmentUrl = attachment.url;
        const ext = path.extname(attachment.name).toLowerCase();

        if (ext !== ".mp3" && ext !== ".ogg") {
          return interaction.followUp({
            content: "Only MP3 and OGG files are supported!",
            flags: MessageFlags.Ephemeral,
          });
        }

        fileExtension = ext;

        // Download the attachment
        const response = await fetch(attachmentUrl);
        if (!response.ok) {
          throw new Error(`Failed to download file: ${response.statusText}`);
        }
        fileBuffer = Buffer.from(await response.arrayBuffer());
      } else {
        // Handle URL download
        const ext = path.extname(new URL(url).pathname).toLowerCase();

        if (ext !== ".mp3" && ext !== ".ogg") {
          return interaction.followUp({
            content: "URL must point to an MP3 or OGG file!",
            flags: MessageFlags.Ephemeral,
          });
        }

        fileExtension = ext;
        fileBuffer = await downloadFile(url);
      }

      // Save the file
      const filepath = path.join(__dirname, "../clips", `${clipName}${fileExtension}`);
      await writeFile(filepath, fileBuffer);

      return interaction.followUp({
        content: `✅ Successfully uploaded clip \`${clipName}\`! Use \`/play clip:${clipName}\` to play it.`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      console.error("Error uploading clip:", err);
      return interaction.followUp({
        content: `❌ Failed to upload clip: ${err.message}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
