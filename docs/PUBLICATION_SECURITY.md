# Publication Security

Use this checklist before making the repository public.

## Never Publish

- `data.json`
- API keys
- `.env` files
- local vault content
- downloaded model weights
- `.mindo-*` and legacy `.contex-*` runtime folders
- `.venv-*`, `.python-stt`, `.cache`, `node_modules`
- Rust `target`
- debug logs that include local paths or user note contents

## Source Visibility Strategy

For official Obsidian Community Plugin submission, the source repository must
be reviewable. The realistic protection strategy is source-available, not
secret-source.

Recommended public/private split:

- Public:
  - plugin UI source;
  - Obsidian integration code;
  - tests;
  - release packaging;
  - docs;
  - non-secret runtime launchers.
- Private or future hosted service:
  - paid hosted inference;
  - proprietary prompt packs;
  - private analytics or licensing service;
  - commercial deployment automation.

## License Position

Mindo now uses a source-available license:

- users may download, install, run, and inspect it;
- users may not repackage it as a competing product;
- users may not reuse substantial code, workflows, prompts, or assets in
  another AI assistant product without permission.

This is not legal advice. Before a serious public launch, have a lawyer review
the license text.

## GitHub Repo Setup

Recommended repository settings:

- Disable "Allow forking" if you use a private repo for development.
- For the public repo, keep branch protection on `main`.
- Require the `Verify` workflow before merging.
- Use GitHub release drafts.
- Use Dependabot only for dev dependencies you are ready to update.
- Do not store API keys in repository secrets unless a workflow needs them.

## Pre-Publish Command

```bash
npm run release:check
npm run package
```

Then inspect:

```text
dist/mindo
dist/mindo-release.json
```
