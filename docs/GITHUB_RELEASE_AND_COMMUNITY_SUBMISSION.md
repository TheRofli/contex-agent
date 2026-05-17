# GitHub Release And Obsidian Community Submission

This document is the release path for Mindo.

## Important Reality Check

Obsidian Community Plugins are reviewed from GitHub. The public repository
must expose enough source code for review. If the goal is to publish in the
official Community Plugins catalog, do not assume a closed-source release-only
repository will pass review.

The practical protection model is:

- publish source that Obsidian can review;
- keep local secrets, caches, downloaded models, and user data out of GitHub;
- use the MIT license so GitHub and review tooling can recognize the license;
- split future proprietary services or hosted runtimes into a private backend
  if they must remain closed.

## Repository Checklist

Before pushing to GitHub:

- `manifest.json` exists in the repository root.
- `main.js`, `styles.css`, and `manifest.json` are produced by `npm run build`.
- `README.md`, `CHANGELOG.md`, `LICENSE`, and `versions.json` are present.
- `data.json` is not committed.
- `.mindo-*`, legacy `.contex-*`, `.venv-*`, `.python-stt`, `.cache`, `node_modules`, Rust
  `target`, downloaded model files, and release zips are not committed.
- `manifest.json`, `package.json`, and `versions.json` versions match.
- `manifest.json` has `"isDesktopOnly": true`.

## Local Release Commands

Run:

```bash
npm ci
npm run verify
npm run core:build
npm run core:install
npm run package
```

The clean release folder is:

```text
dist/mindo
```

## GitHub Release

Create a tag that exactly matches `manifest.json` -> `version`.
For version `0.2.3`, use `0.2.3`, not `v0.2.3`; the Obsidian submission bot
looks for a GitHub Release whose tag is exactly the manifest version.

```bash
git tag 0.2.3
git push origin 0.2.3
```

The `Release` workflow creates a GitHub release with:

- `manifest.json`
- `main.js`
- `styles.css`
- `mindo-X.Y.Z.zip`
- `mindo-release.json`

Open the release and manually inspect the assets before submitting to the
community plugin catalog.

## Obsidian Community Plugin Submission

After the GitHub repo and first release are ready:

1. Open the official `obsidianmd/obsidian-releases` repository.
2. Fork it.
3. Edit `community-plugins.json`.
4. Add an entry similar to:

   ```json
   {
    "id": "mindo",
    "name": "Mindo",
    "author": "Mindo",
    "description": "Talk to your vault with local voice, RAG, Wiki memory, safe edits, and Mindo Code.",
    "repo": "TheRofli/mindo"
   }
   ```

5. Open a pull request.
6. Answer review feedback.

The plugin id must match `manifest.json`.

## Manual Install Path

Until the community review is accepted, users can install manually:

1. Download the release zip.
2. Extract it to:

   ```text
   Vault/.obsidian/plugins/mindo
   ```

3. Restart Obsidian.
4. Enable `Mindo` under Community plugins.

## BRAT / Beta Path

For early testers, use BRAT with the GitHub repository. This is useful before
submitting to the official Community Plugins catalog.

## Release Notes Template

```markdown
## Mindo v0.2.3

Mindo is a local-first AI companion for Obsidian.

Highlights:
- active-note and vault-aware chat;
- local voice workflows;
- Mindo Wiki memory;
- safe note creation and editing;
- real source references;
- Rust-accelerated search/RAG core;
- early Mindo Code planning workflow.

Install:
Download `mindo-0.2.3.zip`, extract it to
`Vault/.obsidian/plugins/mindo`, then enable the plugin in Obsidian.
```
