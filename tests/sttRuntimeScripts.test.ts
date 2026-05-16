import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const sttServerDir = join(process.cwd(), "tools", "stt_server");
const startScript = readFileSync(
  join(sttServerDir, "start_stt_server.ps1"),
  "utf8"
);
const serverScript = readFileSync(join(sttServerDir, "server.py"), "utf8");

assert.equal(
  existsSync(join(sttServerDir, "requirements-whispercpp.txt")),
  false,
  "whisper.cpp requirements must not ship with the STT helper"
);
assert.equal(
  startScript.includes("whisper.cpp") || serverScript.includes("whisper.cpp"),
  false,
  "STT helper scripts must not expose the removed whisper.cpp backend"
);
assert.equal(
  startScript.includes("pywhispercpp") || serverScript.includes("pywhispercpp"),
  false,
  "pywhispercpp must not be imported after removing whisper.cpp"
);
assert.match(
  startScript,
  /else\s*\{\s*"parakeet"\s*\}/,
  "PowerShell runtime should default to Parakeet"
);
assert.match(
  startScript,
  /\$env:MINDO_STT_LANGUAGE\s*=\s*"auto"/,
  "local STT should default language detection to auto"
);
assert.match(
  startScript,
  /function Clear-SttInstallCaches/,
  "installer should define cache cleanup"
);
assert.match(
  startScript,
  /function Ensure-SttRuntimeDirectories/,
  "installer should recreate runtime directories after cleanup"
);
assert.match(
  startScript,
  /function Remove-OtherSttModelCaches/,
  "installer should define model cache pruning"
);
assert.match(
  startScript,
  /function Resolve-HuggingFaceModelCacheName/,
  "installer should be able to identify the active Hugging Face model cache"
);
assert.match(
  startScript,
  /Clear-SttInstallCaches/,
  "installer should call cache cleanup after dependency/model setup"
);
assert.match(
  startScript,
  /Remove-OtherSttModelCaches/,
  "installer should prune inactive STT model caches"
);
assert.match(
  startScript,
  /models--\*/,
  "installer should prune inactive Hugging Face model caches"
);
assert.match(
  startScript,
  /Clear-SttInstallCaches[\s\S]*Ensure-SttRuntimeDirectories/,
  "installer should recreate runtime directories after cleanup before server start"
);
assert.match(
  serverScript,
  /LANGUAGE\s*=\s*normalize_language_hint/,
  "server should treat language=auto as automatic detection"
);

console.log("sttRuntimeScripts tests passed");
