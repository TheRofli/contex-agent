from __future__ import annotations

import array
import json
import os
import re
import sys
import threading
import time
import urllib.request
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any

import torch


HOST = os.environ.get("MINDO_SILERO_HOST", "127.0.0.1")
PORT = int(os.environ.get("MINDO_SILERO_PORT", "9100"))
RUNTIME_DIR = Path(
    os.environ.get(
        "MINDO_SILERO_HOME",
        Path.home() / "AppData" / "Local" / "Mindo" / "silero",
    )
)
DEFAULT_VOICE = os.environ.get("MINDO_SILERO_VOICE", "baya")
MAX_CHUNK_LENGTH = 900

MODEL_CONFIGS: dict[str, dict[str, Any]] = {
    "ru-v5_5": {
        "url": os.environ.get(
            "MINDO_SILERO_RU_MODEL_URL",
            os.environ.get(
                "MINDO_SILERO_MODEL_URL",
                "https://models.silero.ai/models/tts/ru/v5_5_ru.pt",
            ),
        ),
        "path": RUNTIME_DIR / "models" / "v5_5_ru.pt",
        "sample_rate": int(os.environ.get("MINDO_SILERO_SAMPLE_RATE", "48000")),
        "language": "ru",
        "voices": {"baya", "eugene"},
    },
}

VOICE_TO_MODEL: dict[str, str] = {
    voice: model_id
    for model_id, config in MODEL_CONFIGS.items()
    for voice in config["voices"]
}
SUPPORTED_VOICES = set(VOICE_TO_MODEL)

TERM_PRONUNCIATIONS = {
    "ai": "эй ай",
    "api": "эй пи ай",
    "agent": "эйджент",
    "and": "энд",
    "bitnet": "битнет",
    "browser": "браузер",
    "chatgpt": "чат джи пи ти",
    "codex": "кодекс",
    "concept": "концепт",
    "contex": "контекс",
    "context": "контекст",
    "diff": "дифф",
    "docker": "докер",
    "demo": "демо",
    "demonstration": "демонстрация",
    "endpoint": "эндпоинт",
    "for": "фор",
    "gemma": "джемма",
    "github": "гитхаб",
    "in": "ин",
    "inside": "инсайд",
    "kokoro": "кокоро",
    "llm": "эл эл эм",
    "local": "локал",
    "looplm": "луп эл эм",
    "markdown": "маркдаун",
    "model": "модель",
    "mla": "эм эл эй",
    "mvp": "эм ви пи",
    "obsidian": "обсидиан",
    "of": "ов",
    "onnx": "он эн эн икс",
    "openai": "оупен эй ай",
    "preview": "превью",
    "proof": "пруф",
    "project": "проект",
    "qore": "кор",
    "rollback": "роллбэк",
    "silero": "силеро",
    "stt": "эс ти ти",
    "tts": "ти ти эс",
    "uses": "юзес",
    "vault": "волт",
    "voice": "войс",
    "webgpu": "веб джи пи ю",
    "with": "виз",
    "whisper": "виспер",
}

LETTER_PRONUNCIATIONS = {
    "a": "эй",
    "b": "би",
    "c": "си",
    "d": "ди",
    "e": "и",
    "f": "эф",
    "g": "джи",
    "h": "эйч",
    "i": "ай",
    "j": "джей",
    "k": "кей",
    "l": "эл",
    "m": "эм",
    "n": "эн",
    "o": "оу",
    "p": "пи",
    "q": "кью",
    "r": "ар",
    "s": "эс",
    "t": "ти",
    "u": "ю",
    "v": "ви",
    "w": "дабл ю",
    "x": "икс",
    "y": "вай",
    "z": "зэд",
}

TRANSLITERATION_REPLACEMENTS = [
    ("sch", "щ"),
    ("sh", "ш"),
    ("ch", "ч"),
    ("zh", "ж"),
    ("yo", "йо"),
    ("yu", "ю"),
    ("ya", "я"),
    ("ph", "ф"),
    ("th", "с"),
    ("ck", "к"),
    ("qu", "кв"),
]

TRANSLITERATION_CHARS = str.maketrans(
    {
        "a": "а",
        "b": "б",
        "c": "к",
        "d": "д",
        "e": "е",
        "f": "ф",
        "g": "г",
        "h": "х",
        "i": "и",
        "j": "дж",
        "k": "к",
        "l": "л",
        "m": "м",
        "n": "н",
        "o": "о",
        "p": "п",
        "q": "к",
        "r": "р",
        "s": "с",
        "t": "т",
        "u": "у",
        "v": "в",
        "w": "в",
        "x": "кс",
        "y": "и",
        "z": "з",
    }
)

model_lock = threading.Lock()
models: dict[str, Any] = {}


def ensure_model_file(model_id: str) -> Path:
    config = MODEL_CONFIGS[model_id]
    model_path = Path(config["path"])
    model_path.parent.mkdir(parents=True, exist_ok=True)

    if model_path.exists() and model_path.stat().st_size > 0:
        return model_path

    tmp_path = model_path.with_suffix(".pt.download")
    print(f"Downloading Silero model {model_id}: {config['url']}", flush=True)
    urllib.request.urlretrieve(str(config["url"]), tmp_path)
    tmp_path.replace(model_path)
    return model_path


def get_model(model_id: str):
    with model_lock:
        cached = models.get(model_id)

        if cached is not None:
            return cached

        model_path = ensure_model_file(model_id)
        torch.set_num_threads(int(os.environ.get("MINDO_SILERO_THREADS", "4")))
        loaded = torch.package.PackageImporter(str(model_path)).load_pickle(
            "tts_models",
            "model",
        )
        loaded.to(torch.device("cpu"))
        models[model_id] = loaded
        print(f"Silero model loaded: {model_path}", flush=True)
        return loaded


def resolve_voice(voice: str) -> tuple[str, str, dict[str, Any]]:
    selected_voice = voice if voice in SUPPORTED_VOICES else DEFAULT_VOICE

    if selected_voice not in SUPPORTED_VOICES:
        selected_voice = "baya"

    model_id = VOICE_TO_MODEL[selected_voice]
    return selected_voice, model_id, MODEL_CONFIGS[model_id]


def normalize_pronunciation_dictionary(value) -> dict[str, str]:
    if not isinstance(value, dict):
        return {}

    pronunciations: dict[str, str] = {}

    for key, pronunciation in value.items():
        if not isinstance(key, str) or not isinstance(pronunciation, str):
            continue

        normalized_key = key.strip().lower()
        normalized_pronunciation = pronunciation.strip()

        if normalized_key and normalized_pronunciation:
            pronunciations[normalized_key] = normalized_pronunciation

    return pronunciations


def build_pronunciation_dictionary(extra_pronunciations=None) -> dict[str, str]:
    pronunciations = dict(TERM_PRONUNCIATIONS)
    pronunciations.update(normalize_pronunciation_dictionary(extra_pronunciations))
    return pronunciations


def pronounce_latin_token(
    match: re.Match[str],
    pronunciations: dict[str, str],
) -> str:
    token = match.group(0)
    normalized = token.strip("_-/+").lower()

    if not normalized:
        return token

    parts = [part for part in re.split(r"[_+\-/]+", normalized) if part]

    if len(parts) > 1:
        return " ".join(
            pronounce_latin_word(part, part.upper(), pronunciations)
            for part in parts
        )

    return pronounce_latin_word(normalized, token, pronunciations)


def pronounce_latin_word(
    word: str,
    original: str,
    pronunciations: dict[str, str],
) -> str:
    if word in pronunciations:
        return pronunciations[word]

    if original.isupper() and len(word) <= 6:
        return " ".join(LETTER_PRONUNCIATIONS.get(char, char) for char in word)

    transliterated = word
    for source, replacement in TRANSLITERATION_REPLACEMENTS:
        transliterated = transliterated.replace(source, replacement)

    return transliterated.translate(TRANSLITERATION_CHARS)


def pronounce_latin_words(text: str, pronunciations: dict[str, str]) -> str:
    return re.sub(
        r"[A-Za-z][A-Za-z0-9_+\-/]*",
        lambda match: pronounce_latin_token(match, pronunciations),
        text,
    )


def clean_russian_text(text: str, extra_pronunciations=None) -> str:
    text = pronounce_latin_words(
        text,
        build_pronunciation_dictionary(extra_pronunciations),
    )
    text = re.sub(r"\s+", " ", text.replace("\r", "\n")).strip()
    text = re.sub(r"[^\w\s\u0400-\u04FF.,!?;:()'\"%+\-/]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def clean_english_text(text: str) -> str:
    text = re.sub(r"\s+", " ", text.replace("\r", "\n")).strip()
    text = re.sub(r"[^\w\s.,!?;:()'\"%+\-/]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def split_text(text: str) -> list[str]:
    parts = re.findall(r"[^.!?;:\n]+[.!?;:]?|\n+", text, re.UNICODE) or [text]
    chunks: list[str] = []
    current = ""

    for part in parts:
        part = part.strip()

        if not part:
            continue

        if len(part) > MAX_CHUNK_LENGTH:
            if current:
                chunks.append(current)
                current = ""

            words = part.split()
            long_current = ""

            for word in words:
                next_part = f"{long_current} {word}".strip()

                if len(next_part) > MAX_CHUNK_LENGTH and long_current:
                    chunks.append(long_current)
                    long_current = word
                else:
                    long_current = next_part

            if long_current:
                chunks.append(long_current)

            continue

        next_current = f"{current} {part}".strip()

        if len(next_current) > MAX_CHUNK_LENGTH and current:
            chunks.append(current)
            current = part
        else:
            current = next_current

    if current:
        chunks.append(current)

    return chunks


def tensor_to_pcm16(audio) -> array.array:
    if hasattr(audio, "detach"):
        audio = audio.detach().cpu().flatten()
    else:
        audio = torch.tensor(audio).flatten()

    samples = (
        torch.clamp(audio, -1.0, 1.0)
        .mul(32767.0)
        .to(torch.int16)
        .tolist()
    )
    pcm = array.array("h", samples)

    if sys.byteorder == "big":
        pcm.byteswap()

    return pcm


def synthesize_wav(text: str, voice: str, extra_pronunciations=None) -> bytes:
    selected_voice, model_id, config = resolve_voice(voice)
    language = str(config["language"])
    sample_rate = int(config["sample_rate"])
    cleaned = (
        clean_russian_text(text, extra_pronunciations)
        if language == "ru"
        else clean_english_text(text)
    )

    if not cleaned:
        raise ValueError("No readable text was provided.")

    tts_model = get_model(model_id)
    pcm = array.array("h")
    silence = array.array("h", [0] * int(sample_rate * 0.22))
    gap = array.array("h", [0] * int(sample_rate * 0.08))
    chunks = split_text(cleaned)
    pcm.extend(silence)

    for index, chunk in enumerate(chunks):
        audio = tts_model.apply_tts(
            text=chunk,
            speaker=selected_voice,
            sample_rate=sample_rate,
        )
        pcm.extend(tensor_to_pcm16(audio))

        if index < len(chunks) - 1:
            pcm.extend(gap)

    with NamedTemporaryFile(delete=False, suffix=".wav") as output_file:
        output_path = Path(output_file.name)

    try:
        with wave.open(str(output_path), "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(pcm.tobytes())

        return output_path.read_bytes()
    finally:
        try:
            output_path.unlink()
        except OSError:
            pass


class SileroHandler(BaseHTTPRequestHandler):
    server_version = "ContexSileroTTS/0.2"

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self) -> None:
        if self.path.split("?", 1)[0] != "/health":
            self.send_error(404)
            return

        self.send_json(
            {
                "status": "ok",
                "models": {
                    model_id: {
                        "language": config["language"],
                        "sampleRate": config["sample_rate"],
                        "voices": sorted(config["voices"]),
                    }
                    for model_id, config in MODEL_CONFIGS.items()
                },
                "voice": DEFAULT_VOICE,
                "voices": sorted(SUPPORTED_VOICES),
                "runtime": str(RUNTIME_DIR),
                "loaded": sorted(models.keys()),
            }
        )

    def do_POST(self) -> None:
        if self.path.split("?", 1)[0] not in {"/speech", "/api/tts"}:
            self.send_error(404)
            return

        try:
            length = int(self.headers.get("content-length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            text = str(payload.get("text") or payload.get("input") or "")
            voice = str(payload.get("voice") or DEFAULT_VOICE)
            pronunciations = payload.get("pronunciations") or payload.get(
                "pronunciationDictionary"
            )
            selected_voice, model_id, _ = resolve_voice(voice)
            started = time.perf_counter()
            audio = synthesize_wav(text, selected_voice, pronunciations)
            elapsed = time.perf_counter() - started
            print(
                f"Silero speech generated: model={model_id} voice={selected_voice} chars={len(text)} seconds={elapsed:.2f}",
                flush=True,
            )
            self.send_response(200)
            self.send_cors_headers()
            self.send_header("content-type", "audio/wav")
            self.send_header("content-length", str(len(audio)))
            self.end_headers()
            self.wfile.write(audio)
        except Exception as error:
            print(f"Silero speech failed: {error}", flush=True)
            self.send_json({"error": str(error)}, status=500)

    def send_json(self, data: dict, status: int = 200) -> None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_cors_headers()
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_cors_headers(self) -> None:
        self.send_header("access-control-allow-origin", "*")
        self.send_header("access-control-allow-methods", "GET, POST, OPTIONS")
        self.send_header("access-control-allow-headers", "content-type")

    def log_message(self, format: str, *args) -> None:
        print(f"{self.address_string()} - {format % args}", flush=True)


def main() -> None:
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer((HOST, PORT), SileroHandler)
    print(f"Contex Silero TTS listening on http://{HOST}:{PORT}/speech", flush=True)
    print("Models: ru-v5_5", flush=True)
    print(f"Runtime: {RUNTIME_DIR}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
