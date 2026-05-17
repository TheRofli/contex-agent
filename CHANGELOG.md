# Changelog

## 0.2.4

- Replaced the hand-drawn inline SVG logo with a compact embedded PNG generated from the real Mindo logo, preserving the correct whale shape in Community Plugin installs.

## 0.2.3

- Adjusted the Mindo home hero spacing so the greeting sits below the embedded whale logo instead of overlapping it on narrow installs.

## 0.2.2

- Embedded the Mindo whale logo in the plugin bundle so Community Plugin installs do not show broken image placeholders when optional asset files are absent.
- Removed `assets/logo.png` from the required release file list because the runtime UI no longer depends on that external PNG.

## 0.2.1

- Switched to the recognized MIT license.
- Removed `!important` CSS overrides and avoided `text-decoration`.
- Reduced system identity warnings by removing direct `process.*` reads from the plugin bundle.
- Documented why local filesystem and shell access are required for bundled desktop runtimes.

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
