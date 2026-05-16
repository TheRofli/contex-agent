from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware


BACKEND = os.environ.get("MINDO_STT_BACKEND", "parakeet")
DEFAULT_MODELS = {
    "faster-whisper": "small",
    "parakeet": "nvidia/parakeet-tdt-0.6b-v3",
}
MODEL_NAME = os.environ.get("MINDO_STT_MODEL") or DEFAULT_MODELS.get(
    BACKEND, "nvidia/parakeet-tdt-0.6b-v3"
)
DEVICE = os.environ.get("MINDO_STT_DEVICE", "cpu")
COMPUTE_TYPE = os.environ.get("MINDO_STT_COMPUTE_TYPE", "int8")
def normalize_language_hint(value: str | None) -> str | None:
    if not value:
        return None

    normalized = value.strip().lower()
    return None if normalized in {"", "auto", "detect", "none"} else normalized


LANGUAGE = normalize_language_hint(os.environ.get("MINDO_STT_LANGUAGE"))
BEAM_SIZE = int(os.environ.get("MINDO_STT_BEAM_SIZE", "5"))
INITIAL_PROMPT = os.environ.get("MINDO_STT_INITIAL_PROMPT") or None
PRELOAD_ON_START = (
    os.environ.get("MINDO_STT_PRELOAD_ON_START", "").lower()
    in {"1", "true", "yes", "on"}
) or BACKEND == "parakeet"
RUNTIME_ROOT = Path(
    os.environ.get("MINDO_STT_RUNTIME_ROOT")
    or os.environ.get("MINDO_STT_HOME")
    or Path(tempfile.gettempdir()) / "mindo-stt"
)
MODEL_DIR = Path(
    os.environ.get("MINDO_STT_MODEL_DIR") or RUNTIME_ROOT / "models"
)

app = FastAPI(title="Mindo Local STT")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["app://obsidian.md", "http://localhost", "http://127.0.0.1"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

model_cache: dict[str, Any] = {}


@app.on_event("startup")
def preload_selected_model() -> None:
    if not PRELOAD_ON_START:
        return

    if BACKEND == "parakeet":
        get_parakeet_model()
    elif BACKEND == "faster-whisper":
        get_faster_whisper_model()


def get_faster_whisper_model() -> Any:
    key = f"faster-whisper::{MODEL_NAME}::{DEVICE}::{COMPUTE_TYPE}"

    if key not in model_cache:
        from faster_whisper import WhisperModel

        model_cache[key] = WhisperModel(
            MODEL_NAME,
            device=DEVICE,
            compute_type=COMPUTE_TYPE,
            download_root=str(MODEL_DIR),
        )

    return model_cache[key]


def get_parakeet_model() -> Any:
    key = f"parakeet::{MODEL_NAME}"

    if key not in model_cache:
        import nemo.collections.asr as nemo_asr

        model_cache[key] = nemo_asr.models.ASRModel.from_pretrained(
            model_name=MODEL_NAME
        )

    return model_cache[key]


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "backend": BACKEND,
        "model": MODEL_NAME,
        "device": DEVICE,
        "compute_type": COMPUTE_TYPE,
        "language": LANGUAGE or "auto",
        "beam_size": str(BEAM_SIZE),
    }


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)) -> dict[str, str]:
    suffix = Path(file.filename or "audio.webm").suffix or ".webm"
    temp_paths: list[str] = []

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_file.write(await file.read())
        temp_path = temp_file.name
        temp_paths.append(temp_path)

    try:
        if BACKEND == "parakeet":
            wav_path = convert_to_wav(temp_path)
            temp_paths.append(wav_path)
            text = transcribe_with_parakeet(wav_path)
            language = LANGUAGE or ""
        else:
            text, language = transcribe_with_faster_whisper(temp_path)

        return {
            "text": text,
            "language": language,
            "backend": BACKEND,
            "model": MODEL_NAME,
        }
    finally:
        for path in temp_paths:
            try:
                os.remove(path)
            except OSError:
                pass


def transcribe_with_faster_whisper(path: str) -> tuple[str, str]:
    segments, info = get_faster_whisper_model().transcribe(
        path,
        language=LANGUAGE,
        initial_prompt=INITIAL_PROMPT,
        beam_size=BEAM_SIZE,
        condition_on_previous_text=False,
        vad_filter=True,
        vad_parameters={
            "min_silence_duration_ms": 500,
            "speech_pad_ms": 250,
        },
    )
    text = " ".join(segment.text.strip() for segment in segments).strip()

    return text, info.language or ""


def transcribe_with_parakeet(path: str) -> str:
    model = get_parakeet_model()

    try:
        result = model.transcribe([path], batch_size=1)
    except TypeError:
        result = model.transcribe([path])

    return extract_text(result)


def convert_to_wav(path: str) -> str:
    source_path = Path(path)

    if source_path.suffix.lower() == ".wav":
        return path

    import imageio_ffmpeg

    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_file:
        wav_path = temp_file.name

    ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
    command = [
        ffmpeg_path,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        path,
        "-ac",
        "1",
        "-ar",
        "16000",
        "-f",
        "wav",
        wav_path,
    ]
    completed = subprocess.run(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    if completed.returncode != 0:
        raise RuntimeError(
            f"ffmpeg audio conversion failed: {completed.stderr.strip()}"
        )

    return wav_path

def extract_text(value: Any) -> str:
    if value is None:
        return ""

    if isinstance(value, str):
        return value.strip()

    if isinstance(value, dict):
        for key in ("text", "transcript", "result"):
            text = value.get(key)

            if isinstance(text, str):
                return text.strip()

    text_attr = getattr(value, "text", None)

    if isinstance(text_attr, str):
        return text_attr.strip()

    if isinstance(value, (list, tuple)):
        parts = [extract_text(item) for item in value]
        return " ".join(part for part in parts if part).strip()

    return str(value).strip()
