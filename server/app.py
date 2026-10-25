"""Learning Spanish with Penguin: local server.

Serves the single-page app in web/ and a small API:
  GET  /api/health  -> {"ok": true, "coach": bool, "model": str|null}
  GET  /api/state   -> {"state": {...}|null, "updated": float}
  PUT  /api/state   -> body {"state": {...}}; stores the progress blob (last write wins; the client merges)
  POST /api/coach   -> optional AI writing coach (only when ANTHROPIC_API_KEY is set)

Run: py -3.13 -m uvicorn server.app:app --port 8300   (or start.bat)
"""
from __future__ import annotations

import json
import os
import sqlite3
import time
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
DATA = ROOT / "data"
DB_PATH = DATA / "progress.db"

COACH_MODEL = os.environ.get("COACH_MODEL", "claude-opus-5-5")


# ---------------------------------------------------------------- storage
def _db() -> sqlite3.Connection:
    DATA.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.execute("CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL, updated REAL NOT NULL)")
    return con


_db().close()   # create the database on start

app = FastAPI(title="Learning Spanish with Penguin")


class StateIn(BaseModel):
    state: dict[str, Any]


@app.get("/api/health")
def health() -> dict[str, Any]:
    on = bool(os.environ.get("ANTHROPIC_API_KEY"))
    return {"ok": True, "coach": on, "model": COACH_MODEL if on else None}


@app.get("/api/state")
def get_state() -> dict[str, Any]:
    con = _db()
    try:
        row = con.execute("SELECT json, updated FROM state WHERE id = 1").fetchone()
    finally:
        con.close()
    if not row:
        return {"state": None, "updated": 0}
    return {"state": json.loads(row[0]), "updated": row[1]}


@app.put("/api/state")
def put_state(body: StateIn) -> dict[str, Any]:
    now = time.time()
    con = _db()
    try:
        con.execute("INSERT INTO state (id, json, updated) VALUES (1, ?, ?) "
                    "ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated = excluded.updated",
                    (json.dumps(body.state, ensure_ascii=False), now))
        con.commit()
    finally:
        con.close()
    return {"ok": True, "updated": now}


# ---------------------------------------------------------------- coach
class CoachIn(BaseModel):
    mode: str = "writing"           # "writing" (prompts, stories) | "reading" (learner explains a Spanish sentence in English)
    kind: str = "prompt"            # "prompt" | "story" | "beat" | "reading"
    task_en: str = ""               # what the learner was asked to do (English)
    context_es: str = ""            # what the other person said / beat hint
    text: str                       # the learner's Spanish
    targets: list[str] = []
    model_answers: list[str] = []


COACH_SCHEMA = {
    "type": "object",
    "properties": {
        "meaning_conveyed": {"type": "boolean"},
        "meaning_note": {"type": "string"},
        "corrections": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "original": {"type": "string"},
                    "fixed": {"type": "string"},
                    "why": {"type": "string"},
                },
                "required": ["original", "fixed", "why"],
                "additionalProperties": False,
            },
        },
        "corrected": {"type": "string"},
        "natural": {"type": "string"},
        "encouragement": {"type": "string"},
    },
    "required": ["meaning_conveyed", "meaning_note", "corrections", "corrected", "natural", "encouragement"],
    "additionalProperties": False,
}

COACH_SYSTEM = """You are a warm, patient Spanish writing coach for an adult English speaker who is a beginner and is
about to travel to Mexico. Judge the learner's Spanish on whether the MEANING gets across first; grammar slips
matter but must never be harsh. Use Mexican Spanish (ustedes, carro, celular, jugo, boleto, camión, ahorita...);
never suggest vosotros or Spain-only words. Ignore missing accents, ¿¡ and capitalisation unless they change the
meaning (mention at most one accent tip). Corrections: only the real errors (gender, agreement, verb form, word
choice, missing word), each with the original fragment, the fixed fragment and a one-sentence beginner-level
explanation in English. "corrected" keeps the learner's own sentence as close as possible, just fixed.
"natural" is how a Mexican would actually say it, simple and short. "encouragement" is one short, specific,
upbeat line in English (it is spoken by a cartoon penguin coach). Keep everything brief."""


READING_SCHEMA = {
    "type": "object",
    "properties": {
        "understood": {"type": "string", "enum": ["yes", "partly", "no"]},
        "verdict": {"type": "string"},
        "feedback": {"type": "string"},
        "misconceptions": {"type": "array", "items": {"type": "string"}},
        "encouragement": {"type": "string"},
    },
    "required": ["understood", "verdict", "feedback", "misconceptions", "encouragement"],
    "additionalProperties": False,
}

READING_SYSTEM = """You are a warm, patient Spanish reading coach for an adult English-speaking beginner preparing for a trip to
Mexico. The learner read one Spanish sentence and explained in English, in their own words, what it is about. Compare
MEANING only: did they get the idea? Point out any misunderstanding gently and concretely (which Spanish word or
phrase they misread and what it really means). Never comment on their English spelling, grammar or style, and never
give a score. "verdict" is a 3-8 word headline; "feedback" one or two short sentences; "misconceptions" lists each
real misunderstanding in one short sentence (empty if none); "encouragement" one short upbeat line (it is spoken by
a cartoon penguin coach). Keep everything brief."""


def _reading_request(body: CoachIn) -> str:
    return (f"Spanish sentence: {body.context_es}\n"
            f"Reference translation: {body.task_en}\n"
            f"Learner's explanation (English, own words): {body.text}")


def _coach_request(body: CoachIn) -> str:
    parts = [f"Task ({body.kind}): {body.task_en}"]
    if body.context_es:
        parts.append(f"Context in Spanish: {body.context_es}")
    if body.targets:
        parts.append("Words/phrases the answer should ideally use: " + ", ".join(body.targets))
    if body.model_answers:
        parts.append("Example good answers: " + " | ".join(body.model_answers))
    parts.append(f"Learner's Spanish:\n{body.text}")
    return "\n".join(parts)


@app.post("/api/coach")
def coach(body: CoachIn) -> JSONResponse:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise HTTPException(503, "Coach not configured: set ANTHROPIC_API_KEY and restart.")
    if not body.text.strip():
        raise HTTPException(400, "Nothing to check yet.")
    import anthropic

    client = anthropic.Anthropic()
    reading = body.mode == "reading"
    kwargs: dict[str, Any] = dict(
        model=COACH_MODEL,
        max_tokens=4000,
        system=READING_SYSTEM if reading else COACH_SYSTEM,
        messages=[{"role": "user", "content": _reading_request(body) if reading else _coach_request(body)}],
        output_config={"effort": "low", "format": {"type": "json_schema", "schema": READING_SCHEMA if reading else COACH_SCHEMA}},
    )
    try:
        try:
            # Server-side refusal fallback (newer SDKs); older SDKs reject the kwarg -> plain request.
            resp = client.beta.messages.create(betas=["server-side-fallback-2026-07-01"], fallbacks="default", **kwargs)
        except TypeError:
            resp = client.messages.create(**kwargs)
    except anthropic.AuthenticationError:
        raise HTTPException(502, "The coach's API key was rejected.")
    except anthropic.RateLimitError:
        raise HTTPException(429, "The coach is busy, try again in a minute.")
    except anthropic.APIStatusError as e:
        raise HTTPException(502, f"Coach error ({e.status_code}).")
    except anthropic.APIConnectionError:
        raise HTTPException(502, "Could not reach the coach (network).")

    if resp.stop_reason == "refusal":
        raise HTTPException(502, "The coach declined this one; the built-in feedback still applies.")
    text = next((b.text for b in resp.content if getattr(b, "type", "") == "text"), "")
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        raise HTTPException(502, "The coach sent back something unreadable.")
    return JSONResponse(data)


# ---------------------------------------------------------------- static app
@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    return FileResponse(WEB / "index.html", headers={"Cache-Control": "no-cache"})


app.mount("/", StaticFiles(directory=WEB, html=True), name="web")
