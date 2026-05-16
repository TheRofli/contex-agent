# Changelog

## 0.2.0

- Renamed public plugin identity from Contex Agent to Mindo.
- Changed the Obsidian plugin id to `mindo`.
- Updated release packaging to build `dist/mindo` and `mindo-release.json`.
- Updated runtime helper names and local cache folders to use Mindo naming.
- Kept `contex-core` as the internal Rust sidecar name for compatibility.

## 0.1.0

- Added Contex Agent sidebar with active note context.
- Added vault search, web research, note creation, note updates, and safe change history.
- Added Contex Wiki memory structure with prompt library initialization.
- Added attachment display and context extraction.
- Added local STT/TTS helpers and voice dialogue experiments.
- Added Rust `contex-core` sidecar for accelerated RAG/search/resolver workflows.
- Added release packaging script and GitHub verification workflow.
