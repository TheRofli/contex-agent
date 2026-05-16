# Mindo Local TTS

Contex uses these local TTS engines:

- Silero TTS v5.5 for Russian.
- kokoro-js with `onnx-community/Kokoro-82M-v1.0-ONNX` for English.

No Docker Desktop is required.

## Local Silero TTS

Silero is the default TTS provider. It runs as a small local Python HTTP server,
uses Russian `v5_5_ru.pt` for `baya`/`eugene`, and keeps the loaded model warm
after the first request.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/tts_server/start_silero_server.ps1
```

Default endpoint:

```text
http://127.0.0.1:9100/speech
```

The first speech request downloads the selected Silero model into:

```text
%LOCALAPPDATA%\Mindo\silero\models
```

Available voices:

- Russian v5.5: `baya`, `eugene`

## Local Kokoro JS TTS

Kokoro JS is the local English TTS provider. It installs `kokoro-js` into a
runtime folder and serves an OpenAI-compatible speech endpoint:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/tts_server/start_kokoro_server.ps1
```

Default endpoint:

```text
http://127.0.0.1:9200/v1/audio/speech
```

The first English speech request may download the ONNX model into the local
Hugging Face cache:

```text
%LOCALAPPDATA%\Mindo\kokoro-js\hf-cache
```

Recommended default English voice: `af_heart`.
