# Mindo Local STT

This helper starts a local STT endpoint for the Obsidian plugin:

```text
http://127.0.0.1:9000/transcribe
```

Run from the plugin folder:

```powershell
npm run stt:start
```

The first run installs Python dependencies into the local STT runtime folder
and downloads the selected model when the first transcription happens. Installer
download caches are pruned after setup, while the active selected model cache is
kept for the next launch.

Supported backends:

- `parakeet` - default NVIDIA NeMo backend with `nvidia/parakeet-tdt-0.6b-v3`.
  This is a large first install, but it gives the best local voice-command quality.
- `faster-whisper` - lighter fallback backend for machines that cannot run Parakeet.

Optional environment variables:

```powershell
$env:MINDO_STT_MODEL = "nvidia/parakeet-tdt-0.6b-v3"
$env:MINDO_STT_BACKEND = "parakeet"
$env:MINDO_STT_DEVICE = "cpu"
$env:MINDO_STT_COMPUTE_TYPE = "int8"
$env:MINDO_STT_LANGUAGE = "auto"
$env:MINDO_STT_PORT = "9000"
$env:MINDO_STT_HOME = "C:\tmp\mindo-stt"
$env:MINDO_STT_PRELOAD_ON_START = "1"
```
