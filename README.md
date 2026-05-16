# Mindo

Mindo is a local-first AI companion for Obsidian. It can chat with the active note, search the vault, create and edit Markdown notes, run local voice workflows, and maintain a structured Mindo Wiki memory layer.

Repository: `https://github.com/TheRofli/mindo`

Note: the public product name is Mindo. The Obsidian plugin id and release
folder still use `contex-agent` for compatibility with existing installs.

## Features

- Active-note aware chat with vault and web context.
- Tool routing for opening notes, creating notes, replacing text, undoing changes, and running research workflows.
- Mindo Wiki memory with Raw, Wiki, Schema, Inbox, Prompt Library, and maintenance files.
- Real source references for vault notes and web results.
- Attachments for images, PDF/text files, and dragged files.
- Local STT/TTS helpers for Parakeet/faster-whisper and Silero/Kokoro-style speech workflows.
- Optional Rust sidecar (`contex-core`) for faster vault search, resolver scoring, and RAG indexing.

## Install For Local Testing

1. Copy or clone this repository into your vault plugins folder:

   `Vault/.obsidian/plugins/contex-agent`

2. Install dependencies:

   ```bash
   npm install
   ```

3. Build:

   ```bash
   npm run build
   ```

4. Enable `Mindo` in Obsidian community plugins.

## Mindo Wiki Initial Build

Open Obsidian's command palette and run:

`Mindo: Initialize Wiki`

Or open `Settings -> Mindo -> Wiki -> Mindo Wiki Initial Build` and click `Initialize / repair`.

This creates or repairs:

- `Mindo Wiki/Raw`
- `Mindo Wiki/Wiki`
- `Mindo Wiki/Schema`
- `Mindo Wiki/Inbox`
- `Mindo Wiki/Wiki/Prompts/Prompt Library.md`
- `Mindo Wiki/Schema/prompts.jsonl`

## Development

```bash
npm run test
npm run core:test
npm run build
npm run verify
```

Build the Rust sidecar:

```bash
npm run core:build
npm run core:install
```

Package a clean release folder:

```bash
npm run package
```

The release output is written to:

`dist/contex-agent`

## Publishing

Read the release docs before making the repository public:

- `docs/GITHUB_RELEASE_AND_COMMUNITY_SUBMISSION.md`
- `docs/PUBLICATION_SECURITY.md`

Mindo is source-available. Users may install, run, and inspect the
plugin, but redistribution, competing products, and commercial reuse require
permission. See `LICENSE`.

## Release Notes

For an Obsidian release, upload at minimum:

- `manifest.json`
- `main.js`
- `styles.css`

If you want bundled local acceleration/runtime helpers, include the generated `dist/contex-agent` folder contents from `npm run package`.

Never publish `data.json`; it contains local settings and API keys.
