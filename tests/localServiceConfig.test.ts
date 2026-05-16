import assert from "node:assert/strict";
import {
  getConfiguredLocalSileroVoiceName,
  getEndpointHealthUrl,
  getEndpointHost,
  getEndpointPort,
  getLocalKokoroEnvironment,
  getLocalSileroEnvironment,
  getLocalSttEnvironment
} from "../src/runtime/localServiceConfig";
import {
  DEFAULT_SETTINGS,
  type ContexSettings
} from "../src/types";

const settings: ContexSettings = {
  ...DEFAULT_SETTINGS,
  sttEndpoint: "http://127.0.0.1:9000/transcribe",
  sttBackend: "parakeet",
  sttModel: "nvidia/parakeet-tdt-0.6b-v3",
  sttLanguage: "auto",
  sttQualityMode: "quality",
  sttBeamSize: 7,
  sttInitialPrompt: "Mindo, Obsidian, Markdown",
  kokoroTtsEndpoint: "http://127.0.0.1:9200/v1/audio/speech",
  kokoroModel: "onnx-community/Kokoro-82M-v1.0-ONNX",
  kokoroVoice: "af_heart",
  sileroTtsEndpoint: "http://127.0.0.1:9100/speech",
  sileroVoice: "baya"
};

assert.equal(
  getEndpointHealthUrl("http://127.0.0.1:9000/transcribe"),
  "http://127.0.0.1:9000/health"
);
assert.equal(getEndpointHealthUrl("not a url"), null);
assert.equal(getEndpointPort("http://127.0.0.1:9000/transcribe", 7000), 9000);
assert.equal(getEndpointPort("https://example.com/api", 7000), 443);
assert.equal(getEndpointPort("not a url", 7000), 7000);
assert.equal(getEndpointHost("http://127.0.0.1:9000/transcribe", "localhost"), "127.0.0.1");
assert.equal(getEndpointHost("not a url", "localhost"), "localhost");

assert.deepEqual(
  getLocalSttEnvironment(settings, { PATH: "test-path" }).MINDO_STT_LANGUAGE,
  ""
);
assert.deepEqual(
  getLocalSttEnvironment(settings, { PATH: "test-path" }).MINDO_STT_BACKEND,
  "parakeet"
);
assert.deepEqual(
  getLocalSttEnvironment(settings, { PATH: "test-path" }).MINDO_STT_PORT,
  "9000"
);
assert.deepEqual(
  getLocalKokoroEnvironment(settings, { PATH: "test-path" }).MINDO_KOKORO_JS_PORT,
  "9200"
);
assert.deepEqual(
  getLocalSileroEnvironment(settings, { PATH: "test-path" }).MINDO_SILERO_PORT,
  "9100"
);
assert.equal(getConfiguredLocalSileroVoiceName(settings), "baya");
assert.equal(
  getConfiguredLocalSileroVoiceName({
    ...settings,
    sileroVoice: "unknown"
  }),
  "eugene"
);

console.log("localServiceConfig tests passed");
