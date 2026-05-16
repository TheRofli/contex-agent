import { createServer } from "node:http";
import { mkdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { KokoroTTS } from "kokoro-js";

const HOST = process.env.MINDO_KOKORO_JS_HOST || "127.0.0.1";
const PORT = Number.parseInt(process.env.MINDO_KOKORO_JS_PORT || "9200", 10);
const MODEL_ID =
  process.env.MINDO_KOKORO_MODEL ||
  "onnx-community/Kokoro-82M-v1.0-ONNX";
const DEFAULT_VOICE = process.env.MINDO_KOKORO_VOICE || "af_heart";
const DTYPE = process.env.MINDO_KOKORO_DTYPE || "q8";
const DEVICE = process.env.MINDO_KOKORO_DEVICE || "cpu";
const TMP_ROOT =
  process.env.MINDO_KOKORO_TMP ||
  join(tmpdir(), "mindo-kokoro-js");

const ENGLISH_VOICES = [
  "af_heart",
  "af_bella",
  "af_nicole",
  "af_sarah",
  "am_fenrir",
  "am_michael",
  "am_puck",
  "bf_emma",
  "bf_isabella",
  "bm_george",
  "bm_fable"
];

let ttsPromise = null;

function ensureTts() {
  if (!ttsPromise) {
    console.log(`Loading Kokoro JS model ${MODEL_ID} dtype=${DTYPE} device=${DEVICE}`);
    ttsPromise = KokoroTTS.from_pretrained(MODEL_ID, {
      dtype: DTYPE,
      device: DEVICE
    });
  }

  return ttsPromise;
}

async function readRequestJson(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

function sendCors(response) {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type");
}

function sendJson(response, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": body.byteLength
  });
  response.end(body);
}

function getRequestPath(request) {
  return new URL(request.url || "/", `http://${HOST}:${PORT}`).pathname;
}

function selectVoice(tts, requestedVoice) {
  const voice =
    typeof requestedVoice === "string" && requestedVoice.trim()
      ? requestedVoice.trim()
      : DEFAULT_VOICE;

  return Object.prototype.hasOwnProperty.call(tts.voices, voice)
    ? voice
    : DEFAULT_VOICE;
}

async function synthesizeSpeech(payload) {
  const input = String(payload.input || payload.text || "").trim();

  if (!input) {
    throw new Error("No readable text was provided.");
  }

  const tts = await ensureTts();
  const voice = selectVoice(tts, payload.voice);
  const speed = Number.isFinite(Number(payload.speed))
    ? Math.min(2, Math.max(0.5, Number(payload.speed)))
    : 1;
  const started = performance.now();
  const audio = await tts.generate(input, { voice, speed });
  const outputPath = join(TMP_ROOT, `speech-${Date.now()}-${Math.random()}.wav`);

  await mkdir(TMP_ROOT, { recursive: true });
  await audio.save(outputPath);

  try {
    const wav = await readFile(outputPath);
    const elapsed = ((performance.now() - started) / 1000).toFixed(2);
    console.log(
      `Kokoro speech generated: voice=${voice} chars=${input.length} seconds=${elapsed}`
    );
    return wav;
  } finally {
    await unlink(outputPath).catch(() => undefined);
  }
}

const server = createServer(async (request, response) => {
  sendCors(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  const path = getRequestPath(request);

  try {
    if (request.method === "GET" && path === "/health") {
      sendJson(response, 200, {
        status: "ok",
        model: MODEL_ID,
        voice: DEFAULT_VOICE,
        voices: ENGLISH_VOICES,
        loaded: Boolean(ttsPromise)
      });
      return;
    }

    if (request.method === "GET" && path === "/v1/audio/voices") {
      sendJson(response, 200, {
        data: ENGLISH_VOICES.map((voice) => ({
          id: voice,
          object: "voice"
        }))
      });
      return;
    }

    if (request.method === "POST" && path === "/shutdown") {
      sendJson(response, 200, { status: "stopping" });
      setTimeout(() => {
        server.close(() => process.exit(0));
      }, 50);
      return;
    }

    if (
      request.method === "POST" &&
      (path === "/v1/audio/speech" || path === "/speech")
    ) {
      const payload = await readRequestJson(request);
      const audio = await synthesizeSpeech(payload);
      response.writeHead(200, {
        "content-type": "audio/wav",
        "content-length": audio.byteLength
      });
      response.end(audio);
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    console.error("Kokoro speech failed:", error);
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Contex Kokoro JS TTS listening on http://${HOST}:${PORT}`);
  console.log(`Speech endpoint: http://${HOST}:${PORT}/v1/audio/speech`);
});
