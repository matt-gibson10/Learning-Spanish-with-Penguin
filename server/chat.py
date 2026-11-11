"""Charla con Penguin: a Spanish-only conversation partner.

API (see docs/CONTRACT.md, "Conversation API"; details in docs/CHAT.md):
  GET  /api/chat/status   -> {"available", "backend", "model", "note", "backends": [...], "loaded", ...}
                             ?warm=1[&topic_id=ch_playa&level=1] loads the local model in the background and
                             pre-reads that topic's instructions, so the first reply is fast.
  POST /api/chat          -> {"reply_es", "reply_en", "correction", "suggestions", "backend", "ms"}
                             errors: 4xx/503 {"error": "...", "setup": "..."}
  POST /api/translate     -> {"input_lang", "en", "es", "pieces": [{"es", "en"}], "tip", "correction", "backend", "ms"}
                             "think out loud": one sentence (EN, ES attempt or mixed, <= 300 chars) -> natural
                             Mexican Spanish cut into pieces. /api/chat/status?warm=1 without topic_id warms it.
                             See the "think out loud" section below.

How a local reply is made: two requests run at the same time on the same model.
  1. the reply      (persona + topic + level rules -> reply_es, reply_en, suggestions)
  2. the check      (a focused "Spanish teacher" prompt -> the learner's last message with only its
                     grammar mistakes fixed + one line why; the server turns a real change into `correction`)
  Splitting them made corrections far more reliable (8/8 test errors caught, no false alarms, vs 1/6 when the
  reply prompt also had to correct), and llama-server decodes both in one batch, so it costs ~no extra time.

Backends
  local   a small open-source GGUF model on this computer's CPU (offline). Two engines, same model file:
            server  llama.cpp's llama-server.exe (models/llama.cpp/), started as a hidden child process on a free
                    localhost port, killed with the app. Default: faster JSON-constrained decoding, 2 parallel slots.
            python  llama-cpp-python inside this process (pip install -r requirements-chat.txt); fallback.
          Picked automatically (server if installed), or env CHAT_ENGINE=server|python.
          Model file: env CHAT_MODEL_PATH, else models/<DEFAULT_MODEL_FILE>, else the first models/*.gguf.
          Loaded lazily once and kept in memory.
  claude  Anthropic API, only when ANTHROPIC_API_KEY is set. Model: env CHAT_CLAUDE_MODEL. One request does both.

Install the local model with:  .venv\\Scripts\\python.exe scripts\\setup_chat_model.py
"""
from __future__ import annotations

import atexit
import difflib
import importlib.util
import json
import os
import re
import socket
import subprocess
import threading
import time
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Literal, Optional

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent.parent
TOPICS_PATH = ROOT / "content" / "chat_topics.json"
MODELS_DIR = ROOT / "models"
LLAMA_DIR = MODELS_DIR / "llama.cpp"

# The default local model (chosen by the benchmark in docs/CHAT.md). setup_chat_model.py downloads it.
DEFAULT_MODEL_FILE = "Qwen3-4B-Instruct-2507-Q4_K_M.gguf"
DEFAULT_MODEL_NAME = "Qwen3-4B-Instruct-2507 (Q4_K_M)"
CLAUDE_MODEL = os.environ.get("CHAT_CLAUDE_MODEL", "claude-opus-5-5")

SETUP_HINT = ("To chat offline, install Penguin's chat model once (about 2.5 GB): open a terminal in the app "
              "folder, run  .venv\\Scripts\\python.exe scripts\\setup_chat_model.py  and restart start.bat. "
              "Or set ANTHROPIC_API_KEY before start.bat to chat through Claude (needs internet).")
DISCLAIMER = "Penguin's Spanish is usually right but not perfect."

MAX_TURNS = 12          # history turns sent to the model
MAX_TURN_CHARS = 500    # longer messages are cut
SLOT_REPLY, SLOT_CHECK = 0, 1

router = APIRouter()


# ---------------------------------------------------------------- topics
_topics_cache: dict[str, Any] = {"mtime": None, "by_id": {}}


def topics() -> dict[str, dict]:
    """Topics by id, re-read when content/chat_topics.json changes."""
    try:
        mtime = TOPICS_PATH.stat().st_mtime
    except FileNotFoundError:
        return {}
    if _topics_cache["mtime"] != mtime:
        data = json.loads(TOPICS_PATH.read_text(encoding="utf-8"))
        _topics_cache["by_id"] = {t["id"]: t for t in data}
        _topics_cache["mtime"] = mtime
    return _topics_cache["by_id"]


# ---------------------------------------------------------------- prompts and schemas
LEVEL_RULES = {
    1: ("LEVEL 1 (absolute beginner): use ONLY the present tense. Write 1 or 2 very short sentences, "
        "at most 10 words each. Use only very common everyday words. Ask exactly ONE simple question."),
    2: ("LEVEL 2 (beginner): present tense, plus 'ir a + infinitive' (voy a comer), 'me gusta / te gusta', "
        "and the simple past of common verbs (fui, comí, hiciste). Write 2 short sentences, at most 14 words "
        "each, with common words. Ask exactly ONE question."),
    3: "LEVEL 3 (intermediate): speak naturally but clearly, any tense, up to 3 sentences. Ask ONE question.",
}


def build_system(topic: dict, level: int, with_check: bool = False) -> str:
    level = level if level in LEVEL_RULES else 1
    title = topic.get("title", "")
    s = f"""{topic.get("persona_es", "Eres Penguin, un pingüino mexicano muy amable con sombrero.")}

You are Penguin. You chat in Spanish with an English speaker who is learning Mexican Spanish and is about to travel to Mexico.
Situation: {topic.get("scenario_en", "")}
TOPIC: {title} ({topic.get("title_en", "")}). Talk ONLY about this topic: {"; ".join(topic.get("subtopics", []))}.
Words to use when they fit: {", ".join(topic.get("vocab", []))}.

RULES
1. reply_es is ONLY in Spanish, Mexican Spanish (ustedes, carro, celular, jugo, boleto, camión). Never put English in reply_es.
2. {LEVEL_RULES[level]}
3. React to what the learner just said (agree, add one small fact or opinion of yours), then end reply_es with ONE new question about the topic. Never repeat a sentence you already said.
4. Stay in character as Penguin, warm, friendly and encouraging. Never say you are an AI or a model.
5. If the learner asks about something outside the topic (trivia, other countries, math, news, politics, code), do NOT answer it. Say kindly, in Spanish, that you prefer to talk about {title}, and ask a question about {title}.
6. If the learner writes in English, understand it and reply in simple Spanish anyway.
7. Your Spanish must be correct: accents (está, qué, sí, también), gender agreement (la playa bonita, el mar azul), verbs (estoy cansado, not soy cansado).

JSON FIELDS
- reply_es: your answer in Spanish (rules above).
- reply_en: the English translation of reply_es.
- suggestions: 2 or 3 short, simple Spanish answers the learner could give to your question: full little sentences of 3 to 7 words, like "Sí, me gusta mucho." or "Prefiero el mar."."""
    if with_check:
        s += ("\n- learner_fixed: the learner's LAST message with ONLY its real grammar mistakes fixed, keeping "
              "their words (copy it exactly if it is correct; \"\" if it is in English). Ignore accents, ¿ ¡, "
              "capitals and punctuation.\n- why_en: one short friendly line in English explaining the fix, or \"\".")
    return s


CHECK_SYSTEM = """You are a careful teacher of Mexican Spanish. You check ONE short message written by an English-speaking beginner.
If the message is in Spanish, rewrite it with ONLY its grammar mistakes fixed: gender and articles (el/la, un/una), agreement of adjectives, verb conjugation and tense, gustar, ser vs estar, a wrong word. Keep the learner's words, word order and meaning. Ignore missing accents, ¿ ¡, capital letters and punctuation: they are not mistakes. If the message is already correct, copy it exactly. Do not change things that are also correct. Words you may not know are often Mexican foods or places (aguachile, tlayuda, Mazunte, Zipolite): keep them as they are.
gustar agrees with the thing that is liked: "me gusta la playa", "me gustan los tacos" (plural thing -> gustan).
If the message is in English (or mostly English), fixed is "".
why_en: ONE short, friendly sentence in English (at most 15 words) about the main fix; "" if nothing changed.

Examples:
"yo gusto el mar" -> fixed "me gusta el mar", why_en "With gustar, say 'me gusta' (it pleases me)."
"me gusta las olas" -> fixed "me gustan las olas", why_en "Olas is plural, so it's 'me gustan'."
"la casa es bonito" -> fixed "la casa es bonita", why_en "Casa is feminine, so the adjective is bonita."
"ayer yo como tacos" -> fixed "ayer yo comí tacos", why_en "With 'ayer' use the past tense: comí."
"quiero una agua" -> fixed "quiero un agua", why_en "Agua is feminine but takes 'un' / 'el'."
"soy cansado" -> fixed "estoy cansado", why_en "Use estar for how you feel: estoy cansado."
"me gusta mucho la playa" -> fixed "me gusta mucho la playa", why_en ""
"I like the beach" -> fixed "", why_en \"\""""

# Descriptive key names matter to small models: short keys ("es", "en") made replies clearly worse.
REPLY_SCHEMA = {
    "type": "object",
    "properties": {
        "reply_es": {"type": "string", "minLength": 1, "maxLength": 300},
        "reply_en": {"type": "string", "minLength": 1, "maxLength": 300},
        "suggestions": {"type": "array", "items": {"type": "string", "minLength": 1, "maxLength": 60},
                        "minItems": 2, "maxItems": 3},
    },
    "required": ["reply_es", "reply_en", "suggestions"],
    "additionalProperties": False,
}
CHECK_SCHEMA = {
    "type": "object",
    "properties": {"fixed": {"type": "string", "maxLength": 300}, "why_en": {"type": "string", "maxLength": 140}},
    "required": ["fixed", "why_en"],
    "additionalProperties": False,
}
# Claude: one request does both; its structured outputs do not take length limits, so these are plain.
CLAUDE_SCHEMA = {
    "type": "object",
    "properties": {"reply_es": {"type": "string"}, "reply_en": {"type": "string"},
                   "suggestions": {"type": "array", "items": {"type": "string"}},
                   "learner_fixed": {"type": "string"}, "why_en": {"type": "string"}},
    "required": ["reply_es", "reply_en", "suggestions", "learner_fixed", "why_en"],
    "additionalProperties": False,
}


def _clean_history(history: list["Turn"]) -> list[dict]:
    """History -> chat messages (user/assistant), merged, starting with a user turn, last MAX_TURNS kept."""
    msgs: list[dict] = []
    for t in history[-MAX_TURNS:]:
        text = (t.text or "").strip()[:MAX_TURN_CHARS]
        if not text:
            continue
        role = "assistant" if t.role == "bot" else "user"
        if msgs and msgs[-1]["role"] == role:
            msgs[-1]["content"] += "\n" + text
        else:
            msgs.append({"role": role, "content": text})
    if not msgs or msgs[0]["role"] != "user":
        msgs.insert(0, {"role": "user", "content": "¡Hola, Penguin!"})
    return msgs


def build_messages(topic: dict, level: int, history: list["Turn"], with_check: bool = False) -> list[dict]:
    msgs = _clean_history(history)
    if msgs[-1]["role"] == "assistant":
        # The learner has not said anything new (e.g. asked for the opener): ask the bot to continue.
        msgs.append({"role": "user", "content": "(…)"})
    # A short reminder right before the answer keeps small models on track.
    msgs[-1] = {"role": "user", "content": (
        f"{msgs[-1]['content']}\n\n(reply_es: Spanish only, level {level}, one question.)")}
    return [{"role": "system", "content": build_system(topic, level, with_check)}] + msgs


def build_check(history: list["Turn"]) -> Optional[list[dict]]:
    """The focused grammar check of the learner's last message (None if there is nothing to check)."""
    last = next((t.text for t in reversed(history) if t.role == "user"), "").strip()[:MAX_TURN_CHARS]
    if not last or looks_english(last) or not _words(last):
        return None
    i = max(i for i, t in enumerate(history) if t.role == "user")
    asked = next((t.text for t in reversed(history[:i]) if t.role == "bot"), "").strip()[:300]
    user = (f"Penguin asked: {asked}\n" if asked else "") + f"Learner's message: {last}"
    return [{"role": "system", "content": CHECK_SYSTEM}, {"role": "user", "content": user}]


# ---------------------------------------------------------------- output validation
_EN_WORDS = set("""the and you your you're is are was what do does did i i'm i've it it's this that with for have has
like want would could should can't don't there their they we our my about how where when which who
please thanks thank yes hello hi beach food eat love really very good great nice""".split())
_ES_HINT = set("""el la los las un una que qué de en y es está estás son me te se lo mi tu yo tú no sí por para con
muy también pero como cómo dónde cuándo gusta quiero tengo hay mar playa comida""".split())
_OK_LETTERS = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZáéíóúüñÁÉÍÓÚÜÑ")
_PRONOUNS = {"yo", "tu", "el", "ella", "usted", "nosotros", "ellos", "ellas", "ustedes"}
# Accent-free forms that a correction may introduce although they look nothing like the learner's word.
_IRREGULAR = set("""estoy estas esta estamos estan estar estaba estabas estuve estuvo fuiste fuimos fueron
gusta gustan gustaria encanta encantan somos eres eras eramos eran hice hizo hiciste hicimos hicieron tuve tuvo
tuviste tuvimos tuvieron quiero quieres quiere queremos quieren puedo puedes puede podemos pueden tengo tienes
tiene tenemos tienen vengo vienes viene salgo pongo hago dices digo dijo dije vamos vayan quiere""".split())


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFD", (s or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return " ".join(re.sub(r"[^a-z0-9 ]+", " ", s).split())


def _words(s: str) -> list[str]:
    return re.findall(r"[a-záéíóúüñ']+", (s or "").lower())


def english_score(s: str) -> float:
    """Share of words that look English (and not Spanish)."""
    w = _words(s)
    if not w:
        return 0.0
    return sum(1 for x in w if x in _EN_WORDS and x not in _ES_HINT) / len(w)


def looks_english(s: str) -> bool:
    w = _words(s)
    en = sum(1 for x in w if x in _EN_WORDS and x not in _ES_HINT)
    es = sum(1 for x in w if x in _ES_HINT)
    return en >= 2 and en > es


def odd_script(s: str) -> bool:
    """True if the text has letters outside Spanish/English (small models sometimes leak Chinese, Thai...)."""
    return any(unicodedata.category(c).startswith("L") and c not in _OK_LETTERS for c in s or "")


_LOOKALIKE = str.maketrans("аеорсухіАЕОРСХІ", "aeopcyxiAEOPCXI")


def latinize(s: str) -> str:
    """Repair a stray non-Latin token: Cyrillic look-alikes -> Latin, other foreign letters and marks dropped."""
    if not odd_script(s):
        return s
    s = s.translate(_LOOKALIKE)
    keep = []
    for c in unicodedata.normalize("NFC", s):
        cat = unicodedata.category(c)
        if (cat.startswith("L") and c not in _OK_LETTERS) or (cat == "Mn"):
            continue
        keep.append(c)
    return "".join(keep)


def _str(v: Any, limit: int = 600) -> str:
    return (v if isinstance(v, str) else "").strip()[:limit]


def _same_sentence(a: str, b: str) -> bool:
    """Equal after ignoring accents, punctuation, case and optional subject pronouns (yo como = como)."""
    wa = [w for w in _norm(a).split() if w not in _PRONOUNS]
    wb = [w for w in _norm(b).split() if w not in _PRONOUNS]
    return wa == wb


# Slips the small model makes in its own "fixed" sentence: gustar-type verbs never take "yo"/"tú"/… as subject
# ("yo me gusta" -> "me gusta"; "yo me encanta" -> "me encanta").
_GUSTAR_SUBJ = re.compile(r"\b(yo|tú|tu|él|ella|nosotros|ellos|ellas)\s+(me|te|le|nos|les)\s+(gust|encant|interes|duel|fascin|importa|molest)",
                          re.IGNORECASE)


def _repair_fixed(fixed: str) -> str:
    out = _GUSTAR_SUBJ.sub(lambda m: m.group(2) + " " + m.group(3), fixed)
    return out[:1].upper() + out[1:] if fixed[:1].isupper() else out


def make_correction(learner: str, fixed: str, why: str) -> Optional[dict]:
    """A correction only for a real, local change to the learner's own sentence."""
    learner, fixed, why = (learner or "").strip(), (fixed or "").strip(), (why or "").strip()
    if not learner or not fixed or looks_english(learner) or odd_script(fixed) or looks_english(fixed):
        return None
    fixed = _repair_fixed(fixed)
    if _same_sentence(learner, fixed):
        return None
    # A total rewrite is a paraphrase or a translation, not a correction of the learner's words.
    if difflib.SequenceMatcher(None, _norm(learner), _norm(fixed)).ratio() < 0.6:
        return None
    # Every new long word must be a form of one of the learner's words (rica -> rico, gusto -> gusta) or a common
    # irregular verb form (voy -> fui, soy -> estoy); otherwise the "fix" swapped a word (aguachile -> aguacate).
    mine = _norm(learner).split()
    for w in set(_norm(fixed).split()) - set(mine):
        if len(w) >= 5 and w not in _IRREGULAR and                 max((difflib.SequenceMatcher(None, w, m).ratio() for m in mine), default=0) < 0.75:
            return None
    if not why or odd_script(why):
        why = "Here is your sentence with a small fix."
    return {"original": learner, "fixed": fixed, "why_en": why}


def validate_reply(data: Any, topic: dict) -> Optional[dict]:
    """Repair the model's reply JSON into the contract shape (correction filled in later). None if unusable."""
    if not isinstance(data, dict):
        return None
    reply_es = _str(data.get("reply_es"))
    if not reply_es:
        return None
    out = {"reply_es": reply_es, "reply_en": latinize(_str(data.get("reply_en"))), "correction": None,
           "suggestions": []}
    seen: set[str] = set()
    for s in data.get("suggestions") or []:
        s = _str(s, 120)
        k = _norm(s)
        if s and len(k.split()) >= 2 and k not in seen and not looks_english(s) and not odd_script(s):
            seen.add(k)
            out["suggestions"].append(s)
    out["suggestions"] = out["suggestions"][:3]
    for s in topic.get("starters", []):          # top up to 2 suggestions
        if len(out["suggestions"]) >= 2:
            break
        if _norm(s) not in seen:
            seen.add(_norm(s))
            out["suggestions"].append(s)
    return out


def clean_reply(out: dict) -> bool:
    """The Spanish-only check for reply_es."""
    return english_score(out["reply_es"]) < 0.15 and not odd_script(out["reply_es"])


def parse_json(text: str) -> Any:
    text = (text or "").strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.S)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                pass
    return None


# ---------------------------------------------------------------- local model engines
def _threads() -> tuple[int, int]:
    cpu = os.cpu_count() or 8
    return (int(os.environ.get("CHAT_THREADS", str(min(8, max(2, cpu // 2))))),
            int(os.environ.get("CHAT_THREADS_BATCH", str(max(2, cpu - 2)))))


def _ctx() -> int:
    return int(os.environ.get("CHAT_CTX", "4096"))     # per slot


SAMPLING = dict(top_p=0.9, top_k=40, min_p=0.05, repeat_penalty=1.05)


class PythonEngine:
    """llama-cpp-python in this process. One llama context per slot (the weights are memory-mapped and shared),
    so the reply and the check each keep their own prompt cache. Generation is serialised."""
    name = "python"

    def __init__(self) -> None:
        self.path: Optional[Path] = None
        self.llms: dict[int, Any] = {}
        self.lock = threading.Lock()

    @staticmethod
    def available() -> bool:
        return importlib.util.find_spec("llama_cpp") is not None

    def loaded(self) -> bool:
        return bool(self.llms)

    def _llm(self, slot: int):
        if slot not in self.llms:
            from llama_cpp import Llama   # imported lazily: the app works without it
            t, tb = _threads()
            self.llms[slot] = Llama(model_path=str(self.path), n_ctx=_ctx(), n_threads=t, n_threads_batch=tb,
                                    n_batch=512, verbose=False)
        return self.llms[slot]

    def load(self, path: Path) -> None:
        self.path = path
        with self.lock:
            self._llm(SLOT_REPLY)

    def complete(self, messages, schema, temperature, max_tokens, slot):
        kw: dict[str, Any] = dict(messages=messages, temperature=temperature, max_tokens=max_tokens, **SAMPLING)
        if schema is not None:
            kw["response_format"] = {"type": "json_object", "schema": schema}
        with self.lock:
            return self._llm(slot).create_chat_completion(**kw)

    def close(self) -> None:
        self.llms = {}


def _kill_with_parent(proc: subprocess.Popen) -> None:
    """Windows: put the child in a job object that is killed when this process exits (even on a crash)."""
    if os.name != "nt":
        return
    try:
        import ctypes
        from ctypes import wintypes

        class IO_COUNTERS(ctypes.Structure):
            _fields_ = [(n, ctypes.c_ulonglong) for n in ("ReadOperationCount", "WriteOperationCount",
                        "OtherOperationCount", "ReadTransferCount", "WriteTransferCount", "OtherTransferCount")]

        class BASIC(ctypes.Structure):
            _fields_ = [("PerProcessUserTimeLimit", ctypes.c_longlong), ("PerJobUserTimeLimit", ctypes.c_longlong),
                        ("LimitFlags", wintypes.DWORD), ("MinimumWorkingSetSize", ctypes.c_size_t),
                        ("MaximumWorkingSetSize", ctypes.c_size_t), ("ActiveProcessLimit", wintypes.DWORD),
                        ("Affinity", ctypes.c_size_t), ("PriorityClass", wintypes.DWORD),
                        ("SchedulingClass", wintypes.DWORD)]

        class EXTENDED(ctypes.Structure):
            _fields_ = [("BasicLimitInformation", BASIC), ("IoInfo", IO_COUNTERS),
                        ("ProcessMemoryLimit", ctypes.c_size_t), ("JobMemoryLimit", ctypes.c_size_t),
                        ("PeakProcessMemoryUsed", ctypes.c_size_t), ("PeakJobMemoryUsed", ctypes.c_size_t)]

        k32 = ctypes.WinDLL("kernel32", use_last_error=True)
        k32.CreateJobObjectW.restype = wintypes.HANDLE
        k32.OpenProcess.restype = wintypes.HANDLE
        job = k32.CreateJobObjectW(None, None)
        info = EXTENDED()
        info.BasicLimitInformation.LimitFlags = 0x2000          # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        k32.SetInformationJobObject(wintypes.HANDLE(job), 9, ctypes.byref(info), ctypes.sizeof(info))
        hproc = k32.OpenProcess(0x0100 | 0x0001, False, proc.pid)   # PROCESS_SET_QUOTA | PROCESS_TERMINATE
        k32.AssignProcessToJobObject(wintypes.HANDLE(job), wintypes.HANDLE(hproc))
        k32.CloseHandle(wintypes.HANDLE(hproc))
        _JOBS.append(job)    # keep the handle open for the life of this process
    except Exception:
        pass


_JOBS: list = []


class ServerEngine:
    """llama.cpp's llama-server.exe as a hidden child process (OpenAI-compatible API on localhost), 2 slots."""
    name = "server"

    def __init__(self) -> None:
        self.proc: Optional[subprocess.Popen] = None
        self.port = 0

    @staticmethod
    def exe() -> Path:
        env = os.environ.get("CHAT_LLAMA_SERVER")
        return Path(env) if env else LLAMA_DIR / ("llama-server.exe" if os.name == "nt" else "llama-server")

    @classmethod
    def available(cls) -> bool:
        return cls.exe().is_file()

    def loaded(self) -> bool:
        return self.proc is not None and self.proc.poll() is None

    def load(self, path: Path) -> None:
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            self.port = s.getsockname()[1]
        t, tb = _threads()
        log = self.exe().parent / "server.log"
        args = [str(self.exe()), "-m", str(path), "--host", "127.0.0.1", "--port", str(self.port),
                "-c", str(2 * _ctx()), "-np", "2", "-t", str(t), "-tb", str(tb), "--log-file", str(log)]
        args += os.environ.get("CHAT_SERVER_ARGS", "").split()      # extra llama-server flags (experiments)
        flags = 0x08000000 if os.name == "nt" else 0          # CREATE_NO_WINDOW
        self.proc = subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                     stderr=subprocess.DEVNULL, creationflags=flags, cwd=str(self.exe().parent))
        _kill_with_parent(self.proc)
        deadline = time.time() + 180
        while time.time() < deadline:
            if self.proc.poll() is not None:
                tail = log.read_text(encoding="utf-8", errors="replace")[-600:] if log.is_file() else ""
                self.proc = None
                raise RuntimeError(f"llama-server stopped while loading the model. {tail}")
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/health", timeout=2) as r:
                    if r.status == 200:
                        return
            except (urllib.error.URLError, OSError):
                pass
            time.sleep(0.25)
        self.close()
        raise RuntimeError("llama-server did not become ready within 3 minutes.")

    @staticmethod
    def _patterned(node: Any) -> Any:
        """maxLength -> an equivalent regex that also forbids a leading space (once, a model filled a string with
        spaces up to max_tokens). Only for llama-server: its converter handles patterns compactly."""
        if isinstance(node, list):
            return [ServerEngine._patterned(x) for x in node]
        if not isinstance(node, dict):
            return node
        node = {k: ServerEngine._patterned(v) for k, v in node.items()}
        if node.get("type") == "string" and "maxLength" in node and "pattern" not in node:
            n = int(node.pop("maxLength"))
            body = r'[^ "\\][^"\\]{0,%d}' % (n - 1)      # no quote/backslash: '.' would allow '"'
            node["pattern"] = f"^{body}$" if node.pop("minLength", 0) else f"^({body})?$"
        return node

    def complete(self, messages, schema, temperature, max_tokens, slot):
        body: dict[str, Any] = dict(messages=messages, temperature=temperature, max_tokens=max_tokens,
                                    cache_prompt=True, id_slot=slot, reasoning_format="none",
                                    parse_tool_calls=False, **SAMPLING)
        if schema is not None:
            body["response_format"] = {"type": "json_schema",
                                       "json_schema": {"name": "reply", "schema": self._patterned(schema)}}
        req = urllib.request.Request(f"http://127.0.0.1:{self.port}/v1/chat/completions",
                                     json.dumps(body).encode("utf-8"), {"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=180) as r:
            return json.loads(r.read().decode("utf-8"))

    def close(self) -> None:
        if self.proc is not None and self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(5)
            except subprocess.TimeoutExpired:
                self.proc.kill()
        self.proc = None


class LocalModel:
    """The 'local' backend: one GGUF model, one engine, loaded lazily and kept in memory."""

    def __init__(self) -> None:
        self.load_lock = threading.Lock()
        self.engine: Optional[Any] = None
        self.path: Optional[Path] = None
        self.load_ms: Optional[int] = None
        self.load_error: Optional[str] = None
        self.loading = False
        self.warm_key: Optional[tuple] = None
        atexit.register(self.close)

    @staticmethod
    def find_path() -> Optional[Path]:
        env = os.environ.get("CHAT_MODEL_PATH")
        if env:
            p = Path(env)
            p = p if p.is_absolute() else ROOT / p
            return p if p.is_file() else None
        p = MODELS_DIR / DEFAULT_MODEL_FILE
        if p.is_file():
            return p
        ggufs = sorted(MODELS_DIR.glob("*.gguf")) if MODELS_DIR.is_dir() else []
        return ggufs[0] if ggufs else None

    @staticmethod
    def engine_class():
        want = os.environ.get("CHAT_ENGINE", "").lower()
        order = {"python": [PythonEngine], "server": [ServerEngine]}.get(want, [ServerEngine, PythonEngine])
        return next((c for c in order if c.available()), None)

    def installed(self) -> bool:
        return self.find_path() is not None and self.engine_class() is not None

    def loaded(self) -> bool:
        return self.engine is not None and self.engine.loaded()

    def name(self) -> Optional[str]:
        p = self.path or self.find_path()
        if not p:
            return None
        return DEFAULT_MODEL_NAME if p.name == DEFAULT_MODEL_FILE else p.stem

    def ensure_loaded(self) -> None:
        if self.loaded():
            return
        with self.load_lock:
            if self.loaded():
                return
            path, cls = self.find_path(), self.engine_class()
            if path is None or cls is None:
                raise RuntimeError("The offline chat model is not installed.")
            self.loading, t0 = True, time.perf_counter()
            try:
                eng = cls()
                eng.load(path)
                self.engine, self.path, self.load_error = eng, path, None
            except Exception as e:      # bad file, unsupported architecture, out of memory...
                self.engine, self.load_error = None, f"{type(e).__name__}: {str(e)[:300]}"
                raise
            finally:
                self.loading = False
                self.load_ms = int((time.perf_counter() - t0) * 1000)

    def complete(self, messages: list[dict], *, schema: Optional[dict] = REPLY_SCHEMA, temperature: float = 0.6,
                 max_tokens: int = 200, slot: int = SLOT_REPLY) -> tuple[str, dict]:
        """Run one chat completion. Returns (text, stats)."""
        self.ensure_loaded()
        t0 = time.perf_counter()
        try:
            r = self.engine.complete(messages, schema, temperature, max_tokens, slot)
        except (urllib.error.URLError, ConnectionError) as e:
            if self.engine.loaded() or isinstance(e, urllib.error.HTTPError):
                raise
            self.close()                 # llama-server died (e.g. killed): restart it once
            self.ensure_loaded()
            t0 = time.perf_counter()
            r = self.engine.complete(messages, schema, temperature, max_tokens, slot)
        dt = time.perf_counter() - t0
        u = r.get("usage") or {}
        return (r["choices"][0]["message"].get("content") or ""), {
            "seconds": dt, "completion_tokens": u.get("completion_tokens", 0),
            "prompt_tokens": u.get("prompt_tokens", 0), "finish": r["choices"][0].get("finish_reason")}

    def warm(self, topic: Optional[dict], level: int) -> None:
        """Load the model and pre-read a topic's instructions (prompt cache), in the background."""
        key = ((topic or {}).get("id") or "translate", level if topic else 0)
        if self.loading or (self.loaded() and key == self.warm_key):
            return
        self.warm_key = key

        def run() -> None:
            try:
                self.ensure_loaded()
                if topic is not None:
                    hist = [Turn(role="bot", text=topic.get("opener_es", "")), Turn(role="user", text="Hola")]
                    self.complete(build_check(hist), schema=None, max_tokens=1, slot=SLOT_CHECK)
                    self.complete(build_messages(topic, level, hist[:1]), schema=None, max_tokens=1)
                else:   # no topic: the Think-out-loud page -> pre-read the translate prompt and the check
                    self.complete(build_translate("Hola"), schema=None, max_tokens=1, slot=SLOT_TRANSLATE)
                    self.complete(build_check([Turn(role="user", text="Hola")]), schema=None, max_tokens=1,
                                  slot=SLOT_CHECK)
            except Exception:
                pass
        threading.Thread(target=run, daemon=True).start()

    def close(self) -> None:
        if self.engine is not None:
            self.engine.close()
            self.engine = None


LOCAL = LocalModel()
LAST: dict[str, Any] = {}      # stats of the last local reply (debugging / benchmarks)


def check_local(history: list["Turn"]) -> Optional[dict]:
    msgs = build_check(history)
    if msgs is None:
        return None
    text, _ = LOCAL.complete(msgs, schema=CHECK_SCHEMA, temperature=0.0, max_tokens=140, slot=SLOT_CHECK)
    d = parse_json(text)
    if not isinstance(d, dict):
        return None
    learner = msgs[-1]["content"].split("Learner's message: ", 1)[-1]
    return make_correction(learner, _str(d.get("fixed")), _str(d.get("why_en")))


def chat_local(topic: dict, level: int, history: list["Turn"]) -> dict:
    LOCAL.warm_key = (topic.get("id"), level)
    LOCAL.ensure_loaded()
    # The grammar check runs alongside the reply (llama-server batches the two slots together).
    check: dict[str, Any] = {}

    def run_check() -> None:
        try:
            check["c"] = check_local(history)
        except Exception as e:      # a failed check must never block the reply
            check["error"] = e
    th = threading.Thread(target=run_check, daemon=True)
    th.start()

    messages = build_messages(topic, level, history)
    out = None
    LAST.clear()
    for temp in (0.6, 0.3):          # one retry if the JSON is unusable or the reply is not clean Spanish
        try:
            text, st = LOCAL.complete(messages, temperature=temp)
        except urllib.error.HTTPError as e:     # llama-server rejected its own output (rare): try again
            LAST.setdefault("attempts", []).append({"error": f"HTTP {e.code}"})
            continue
        LAST.setdefault("attempts", []).append({**st, "text": text[:400]})
        cand = validate_reply(parse_json(text), topic)
        if cand is None:
            continue
        out = cand
        if clean_reply(cand):
            break
    if out is None:
        # Last resort: plain-text reply, no JSON.
        plain = messages[:-1] + [{"role": "user", "content": messages[-1]["content"].split("\n\n(")[0] +
                                  "\n\n(Answer as Penguin with 1 or 2 short sentences in Spanish only. No JSON.)"}]
        text, _ = LOCAL.complete(plain, schema=None, temperature=0.4, max_tokens=100)
        out = {"reply_es": text.strip().strip('"')[:400] or "¿Me lo dices otra vez, por favor?", "reply_en": "",
               "correction": None, "suggestions": topic.get("starters", [])[:3]}
    out["reply_es"] = latinize(out["reply_es"])      # only matters if both attempts had a stray token
    th.join(60)
    out["correction"] = check.get("c")
    return out


# ---------------------------------------------------------------- claude backend
def claude_available() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


class ChatError(Exception):
    def __init__(self, status: int, msg: str, setup: str = ""):
        super().__init__(msg)
        self.status, self.msg, self.setup = status, msg, setup


def chat_claude(topic: dict, level: int, history: list["Turn"]) -> dict:
    import anthropic

    messages = build_messages(topic, level, history, with_check=True)
    learner_last = next((t.text for t in reversed(history) if t.role == "user"), "")
    client = anthropic.Anthropic()
    kwargs: dict[str, Any] = dict(
        model=CLAUDE_MODEL,
        max_tokens=4000,
        system=messages[0]["content"],
        messages=messages[1:],
        output_config={"effort": "low", "format": {"type": "json_schema", "schema": CLAUDE_SCHEMA}},
    )
    try:
        try:
            # Server-side refusal fallback (newer SDKs); older SDKs reject the kwarg -> plain request.
            resp = client.beta.messages.create(betas=["server-side-fallback-2026-07-01"], fallbacks="default", **kwargs)
        except TypeError:
            resp = client.messages.create(**kwargs)
    except anthropic.AuthenticationError:
        raise ChatError(503, "The Claude API key was rejected.", "Check ANTHROPIC_API_KEY and restart start.bat.")
    except anthropic.RateLimitError:
        raise ChatError(503, "Claude is busy right now. Try again in a minute.")
    except anthropic.APIStatusError as e:
        raise ChatError(503, f"Claude error ({e.status_code}). Try again in a moment.")
    except anthropic.APIConnectionError:
        raise ChatError(503, "Could not reach Claude (no internet?).", SETUP_HINT)
    if resp.stop_reason == "refusal":
        raise ChatError(503, "Claude declined to answer this one. Try saying it another way.")
    text = next((b.text for b in resp.content if getattr(b, "type", "") == "text"), "")
    data = parse_json(text)
    out = validate_reply(data, topic)
    if out is None:
        return {"reply_es": text.strip()[:400] or "¿Me lo dices otra vez?", "reply_en": "", "correction": None,
                "suggestions": topic.get("starters", [])[:3]}
    out["correction"] = make_correction(learner_last, _str(data.get("learner_fixed")), _str(data.get("why_en")))
    return out


# ---------------------------------------------------------------- think out loud: translate one sentence
# POST /api/translate (docs/CONTRACT.md "Think out loud"; docs/CHAT.md "Think out loud / translate").
#
# How a local translation is made (one model call, plus the grammar check when the input may be Spanish):
#   slot 0  TRANSLATE_SYSTEM + few-shot examples (fixed prefix, prompt-cached) + the sentence
#           -> {input_language, meaning_en, spanish, pieces: ["es words = English", ...]}
#   slot 1  CHECK_SYSTEM (the chat's grammar check, reused unchanged) on the sentence, in parallel, only when it
#           does not look English -> correction via make_correction()
#   server  align_pieces(): the pieces' Spanish must re-join to `spanish` (repairs small slips, else [])
#           make_tip(): a rule-based tip, only from patterns verified in the final Spanish + English (no model
#           text), so a tip is never wrong; "" when no rule fires.
#           Peninsular words -> one retry with a hint, then safe word swaps (coche -> carro, ...).
# Pieces are plain "es = en" strings rather than objects: about half the output tokens, so ~40% faster.
MAX_TRANSLATE_CHARS = 300
SLOT_TRANSLATE = SLOT_REPLY

TRANSLATE_SYSTEM = """You help an English speaker who is learning Mexican Spanish to think out loud. He says ONE sentence: in English, in Spanish (maybe with mistakes), or a mix of both. You say what he means in natural, simple Mexican Spanish and cut it into small pieces.

FIELDS
1. input_language: "english", "spanish" (a Spanish attempt, even with mistakes) or "mixed" (Spanish and English words together).
2. meaning_en: what he means, in clean natural English. Leave out speech fillers (um, uh, like, so, you know, I mean, or something) and false starts.
3. spanish: what a friendly Mexican would really say. Natural, simple and correct. Translate the MEANING, never word for word.
   - Use tú. Use usted only when he speaks politely to a stranger (sir, ma'am, excuse me, a waiter, a driver, an officer).
   - Mexican words: carro, celular, jugo, camión (bus), boleto, computadora, departamento, enojado, manejar, estacionar, alberca, papas, lentes, ahorita, padre or chido (cool), la cuenta.
   - NEVER use vosotros, os, or words from Spain (coche, móvil, zumo, ordenador, vale, coger, guay, conducir, aparcar, gafas, patatas, piscina, enfadado).
   - Leave out yo, tú and other subject words unless they are needed. Questions start with ¿ and exclamations with ¡.
   - Idioms by meaning: I'm hungry / thirsty / hot / cold / sleepy / scared = tengo hambre / sed / calor / frío / sueño / miedo. I'm 32 = tengo 32 años. It's hot / cold (weather) = hace calor / frío. I'm full = estoy lleno. I'm embarrassed = me da pena. I'm excited = estoy emocionado. I miss you = te extraño. I like tacos = me gustan los tacos. How do you say X? = ¿cómo se dice X? It's raining cats and dogs = está lloviendo a cántaros. My name is = me llamo. Have a good time = que te diviertas.
   - If he wrote Spanish: spanish is his sentence with the mistakes fixed and made natural, keeping his meaning and his words when they are fine.
4. pieces: the spanish sentence cut into small chunks, in Spanish order. Each piece is "Spanish words = English meaning".
   - Every word of spanish is in exactly one piece, in the same order. Add nothing, leave nothing out.
   - Pieces are 1 to 3 words, one idea each. Keep set phrases together: "por favor", "tengo que", "me gusta", "a la playa", "hace calor", "te extraño", "me da pena", "¿cómo se dice".
   - The English is what that piece means in this sentence."""

# Few-shot examples, sent as earlier turns (fixed, so they stay in the prompt cache).
TRANSLATE_EXAMPLES = [
    ("I want to go to the beach tomorrow, but I don't know how to get there.",
     {"input_language": "english",
      "meaning_en": "I want to go to the beach tomorrow, but I don't know how to get there.",
      "spanish": "Quiero ir a la playa mañana, pero no sé cómo llegar.",
      "pieces": ["Quiero = I want", "ir = to go", "a la playa = to the beach", "mañana = tomorrow", "pero = but",
                 "no sé = I don't know", "cómo llegar = how to get there"]}),
    ("um so like I'm really hungry, is there a good taco place around here or something",
     {"input_language": "english",
      "meaning_en": "I'm really hungry. Is there a good taco place around here?",
      "spanish": "Tengo mucha hambre. ¿Hay una buena taquería por aquí?",
      "pieces": ["Tengo mucha hambre = I'm really hungry", "¿Hay = is there", "una buena taquería = a good taco place",
                 "por aquí = around here"]}),
    ("Excuse me sir, where is the bathroom?",
     {"input_language": "english", "meaning_en": "Excuse me, sir, where is the bathroom?",
      "spanish": "Disculpe, señor, ¿dónde está el baño?",
      "pieces": ["Disculpe = excuse me", "señor = sir", "¿dónde está = where is", "el baño = the bathroom"]}),
    ("ayer yo voy al mercado y compro muchos frutas",
     {"input_language": "spanish", "meaning_en": "Yesterday I went to the market and bought a lot of fruit.",
      "spanish": "Ayer fui al mercado y compré mucha fruta.",
      "pieces": ["Ayer = yesterday", "fui = I went", "al mercado = to the market", "y = and", "compré = I bought",
                 "mucha fruta = a lot of fruit"]}),
    ("quiero comprar a new charger para mi phone",
     {"input_language": "mixed", "meaning_en": "I want to buy a new charger for my phone.",
      "spanish": "Quiero comprar un cargador nuevo para mi celular.",
      "pieces": ["Quiero = I want", "comprar = to buy", "un cargador = a charger", "nuevo = new",
                 "para mi celular = for my phone"]}),
    ("I really miss my family and I like Mexican food a lot",
     {"input_language": "english", "meaning_en": "I really miss my family, and I like Mexican food a lot.",
      "spanish": "Extraño mucho a mi familia y me gusta mucho la comida mexicana.",
      "pieces": ["Extraño = I miss", "mucho = a lot", "a mi familia = my family", "y = and", "me gusta = I like",
                 "mucho = a lot", "la comida mexicana = Mexican food"]}),
    ("I'm really cold, can we close the window?",
     {"input_language": "english", "meaning_en": "I'm really cold. Can we close the window?",
      "spanish": "Tengo mucho frío. ¿Podemos cerrar la ventana?",
      "pieces": ["Tengo mucho frío = I'm really cold", "¿Podemos = can we", "cerrar = close",
                 "la ventana = the window"]}),
    ("thanks a lot",
     {"input_language": "english", "meaning_en": "Thanks a lot.", "spanish": "Muchas gracias.",
      "pieces": ["Muchas gracias = thanks a lot"]}),
]

_PIECE = r'^[^ "\\=][^"\\=]{0,48} = [^ "\\=][^"\\=]{0,58}$'
TRANSLATE_SCHEMA = {
    "type": "object",
    "properties": {
        "input_language": {"type": "string", "enum": ["english", "spanish", "mixed"]},
        "meaning_en": {"type": "string", "minLength": 1, "maxLength": 300},
        "spanish": {"type": "string", "minLength": 1, "maxLength": 300},
        "pieces": {"type": "array", "items": {"type": "string", "pattern": _PIECE}, "minItems": 1, "maxItems": 24},
    },
    "required": ["input_language", "meaning_en", "spanish", "pieces"],
    "additionalProperties": False,
}
CLAUDE_TRANSLATE_SCHEMA = {
    "type": "object",
    "properties": {
        "input_language": {"type": "string", "enum": ["english", "spanish", "mixed"]},
        "meaning_en": {"type": "string"}, "spanish": {"type": "string"},
        "pieces": {"type": "array", "items": {"type": "string"}},
        "learner_fixed": {"type": "string"}, "why_en": {"type": "string"}, "tip": {"type": "string"},
    },
    "required": ["input_language", "meaning_en", "spanish", "pieces", "learner_fixed", "why_en", "tip"],
    "additionalProperties": False,
}
CLAUDE_TRANSLATE_EXTRA = """
5. learner_fixed: only if he wrote Spanish or a mix: his own sentence with ONLY its real grammar mistakes fixed, keeping his words (copy it exactly if it is correct; "" for English input).
6. why_en: one short friendly line in English about the main fix, or "".
7. tip: at most ONE short line (max 20 words) for a beginner about the biggest English-to-Spanish difference in THIS sentence (dropped subject pronoun, gustar, ser vs estar, tener for hunger/age, word order, a false friend). It must be exactly true. "" if nothing is worth saying."""

_LANG = {"english": "en", "spanish": "es", "mixed": "mixed"}


def build_translate(text: str, hint: str = "") -> list[dict]:
    msgs: list[dict] = [{"role": "system", "content": TRANSLATE_SYSTEM}]
    for said, out in TRANSLATE_EXAMPLES:
        msgs.append({"role": "user", "content": said})
        msgs.append({"role": "assistant", "content": json.dumps(out, ensure_ascii=False)})
    msgs.append({"role": "user", "content": text + (f"\n\n({hint})" if hint else "")})
    return msgs


# --- pieces: validation and repair
_OPENERS = set("¿¡\"'«“‘([")


def _tokens(es: str) -> list[tuple[str, list[str]]]:
    """Whitespace tokens of the Spanish sentence with their normalised words ('¿Dónde' -> ['donde'])."""
    return [(t, _norm(t).split()) for t in (es or "").split()]


def split_piece(p: Any) -> Optional[tuple[str, str]]:
    """'a la playa = to the beach' (or {"es", "en"}) -> ('a la playa', 'to the beach')."""
    if isinstance(p, dict):
        es, en = _str(p.get("es"), 120), _str(p.get("en"), 120)
    elif isinstance(p, str) and "=" in p:
        es, en = (x.strip() for x in p.split("=", 1))
    else:
        return None
    en = latinize(en).strip(" .;,")
    return (es, en) if es else None


def align_pieces(es: str, raw: list) -> list[dict]:
    """The pieces in contract shape, their `es` cut from `es` itself, so joined they always reproduce it.
    Exact match (ignoring case, accents, spaces, punctuation) or a small repair: up to 2 words that the pieces
    added or left out (a left-out word joins its neighbour piece; only short words, so no meaning is lost) and
    1-word spelling slips. Anything else -> [] (the page then glosses word by word itself)."""
    pieces = [sp for sp in (split_piece(p) for p in raw or []) if sp]
    toks = _tokens(es)
    words = [(ti, w) for ti, (_, ws) in enumerate(toks) for w in ws]
    if not pieces or not words or any(not en for _, en in pieces):
        return []
    pw = [(pi, w) for pi, (pes, _) in enumerate(pieces) for w in _norm(pes).split()]
    owner: list[Optional[int]] = [None] * len(words)       # es word -> piece index
    edits = 0
    sm = difflib.SequenceMatcher(None, [w for _, w in words], [w for _, w in pw], autojunk=False)
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == "equal":
            for k in range(i2 - i1):
                owner[i1 + k] = pw[j1 + k][0]
        elif op == "replace" and i2 - i1 == j2 - j1 == 1 and \
                difflib.SequenceMatcher(None, words[i1][1], pw[j1][1]).ratio() >= 0.75:
            owner[i1] = pw[j1][0]
            edits += 1
        elif op == "delete":                 # in es, missing from the pieces
            if any(len(w) > 3 for _, w in words[i1:i2]):
                return []
            edits += i2 - i1
        elif op == "insert":                 # in the pieces, not in es
            edits += j2 - j1
        else:
            return []
        if edits > 2:
            return []
    for k in range(len(owner)):              # left-out words join the piece before (or after, at the start)
        if owner[k] is None:
            owner[k] = next((owner[j] for j in range(k - 1, -1, -1) if owner[j] is not None),
                            next((o for o in owner[k + 1:] if o is not None), None))
    if any(o is None for o in owner):
        return []
    # token -> piece: a token with several words (rare) belongs to its first word's piece; punctuation-only
    # tokens join the next token if they open (¿ ¡), else the previous one.
    tok_owner: list[Optional[int]] = [None] * len(toks)
    for (ti, _), o in zip(words, owner):
        if tok_owner[ti] is None:
            tok_owner[ti] = o
    for ti, (t, ws) in enumerate(toks):
        if tok_owner[ti] is None:
            nxt = next((tok_owner[j] for j in range(ti + 1, len(toks)) if tok_owner[j] is not None), None)
            prv = next((tok_owner[j] for j in range(ti - 1, -1, -1) if tok_owner[j] is not None), None)
            tok_owner[ti] = nxt if (t[:1] in _OPENERS and nxt is not None) or prv is None else prv
    if any(tok_owner[i] > tok_owner[i + 1] for i in range(len(toks) - 1)):    # pieces out of order
        return []
    out: list[dict] = []
    for ti, (t, _) in enumerate(toks):
        o = tok_owner[ti]
        if out and out[-1]["_i"] == o:
            out[-1]["es"] += " " + t
        else:
            out.append({"_i": o, "es": t, "en": pieces[o][1]})
    for p in out:
        del p["_i"]
    return out


def pieces_ok(es: str, pieces: list[dict]) -> bool:
    """The contract check: pieces joined == es, ignoring whitespace, punctuation, accents and case."""
    return bool(pieces) and _norm(" ".join(p["es"] for p in pieces)).replace(" ", "") == _norm(es).replace(" ", "")


# --- Mexican, not Peninsular
_PENINSULAR = re.compile(
    r"\b(vosotros|vosotras|vuestros?|vuestras?|os|coches?|m[oó]vil(es)?|zumos?|ordenador(es)?|guay|"
    r"cog(er|e|es|emos|en|[ií]|i[oó]|iste|ido)|patatas?|gafas|piscinas?|melocot[oó]n(es)?|aparca(r|mos|r[eé])|"
    r"conduc(ir|zco|es|e|imos)|enfadad[oa]s?|\w+[aáeé]is)\b|(^|[¡,.]\s*)vale\s*[,.!]", re.IGNORECASE)
# Same gender and number, so a swap cannot break agreement.
_MX_SWAPS = {"coche": "carro", "coches": "carros", "móvil": "celular", "movil": "celular", "móviles": "celulares",
             "zumo": "jugo", "zumos": "jugos", "ordenador": "computadora", "patata": "papa", "patatas": "papas",
             "piscina": "alberca", "piscinas": "albercas", "melocotón": "durazno", "aparcar": "estacionar",
             "conducir": "manejar", "conduzco": "manejo", "enfadado": "enojado", "enfadada": "enojada",
             "enfadados": "enojados", "enfadadas": "enojadas", "guay": "padre"}
_SWAP_RE = re.compile(r"\b(" + "|".join(sorted(_MX_SWAPS, key=len, reverse=True)) + r")\b", re.IGNORECASE)


def peninsular(es: str) -> list[str]:
    """Spain-only forms in a sentence (vosotros, os, -áis/-éis verbs, coche, móvil, zumo, vale!...)."""
    found = []
    for m in _PENINSULAR.finditer(es or ""):
        w = m.group(0).strip(" ¡,.!").lower()
        if w in ("país", "jamás", "demás", "además", "detrás", "atrás", "más", "verás"):   # \w+[aáeé]is misses
            continue
        found.append(w)
    return found


def mexicanize(s: str) -> str:
    """coche -> carro, móvil -> celular, zumo -> jugo ... (keeps a capital letter)."""
    def sub(m: re.Match) -> str:
        w = _MX_SWAPS.get(m.group(0).lower(), m.group(0))
        return w[:1].upper() + w[1:] if m.group(0)[:1].isupper() else w
    # "ordenador" is masculine, "computadora" feminine: fix the article in front.
    s = re.sub(r"\b(el|un|mi|tu|su)\s+(ordenador)\b",
               lambda m: {"el": "la", "un": "una"}.get(m.group(1).lower(), m.group(1)) + " computadora", s or "",
               flags=re.IGNORECASE)
    return _SWAP_RE.sub(sub, s)


# --- the tip: rule based, every rule checks its pattern in the final Spanish (and usually the English)
_TENER_IDIOM = {"hambre": "hunger", "sed": "thirst", "calor": "heat", "frío": "cold", "frio": "cold",
                "sueño": "sleepiness", "miedo": "fear", "prisa": "hurry", "razón": "reason", "suerte": "luck"}
_TENER_EN = {"hambre": r"hungry|starving", "sed": r"thirsty", "calor": r"hot|warm|boiling", "frío": r"cold|freezing",
             "frio": r"cold|freezing", "sueño": r"sleepy|tired", "miedo": r"scared|afraid|frightened",
             "prisa": r"hurry|rush", "razón": r"right", "suerte": r"lucky"}
_HACER_W = {"calor": "heat", "frío": "cold", "frio": "cold", "viento": "wind", "sol": "sun",
            "buen tiempo": "good weather", "mal tiempo": "bad weather"}
_OBJ = {"me": "me", "te": "you", "le": "him/her", "nos": "us", "les": "them"}
_ADJ = {"barat": "cheap", "car": "expensive", "roj": "red", "azul": "blue", "verde": "green", "blanc": "white",
        "negr": "black", "mexican": "Mexican", "nuev": "new", "abiert": "open", "picante": "spicy",
        "fresc": "fresh", "limpi": "clean", "tranquil": "quiet|calm|peaceful", "bonit": "pretty|beautiful|nice",
        "típic": "typical", "local": "local", "grande": "big|large", "pequeñ": "small|little", "cercan": "nearby",
        "american": "American", "favorit": "favorite|favourite"}
_ADJ_RE = re.compile(r"\b(un|una|unos|unas|el|la|los|las|mi|mis|tu|tus)\s+(?!poco\b|muy\b|más\b|menos\b|tan\b|bien\b)"
                     r"([a-záéíóúñ]{3,})\s+((" + "|".join(sorted(_ADJ, key=len, reverse=True)) +
                     r")(o|a|os|as|e|es|)?)\b", re.IGNORECASE)
_OBJ_VERBS = ("extraño extrañas extraña extrañamos quiero quieres amo veo ves llamo llamas espero esperas necesito "
              "necesitas conozco entiendo entiendes traigo traes compro busco encontré vi llamé dije mandé mando "
              "recomiendas recomiendo pasas ayudas regalo invito").split()
_OBJ_RE = re.compile(r"(?<![\w])(te|lo|la|los|las|me|nos)\s+(" + "|".join(_OBJ_VERBS) + r")\b", re.IGNORECASE)
_YO_ENDING = re.compile(r"(o|oy|é|í|i|e|ía|aba|ría)$")


def _piece_with(pieces: list[dict], phrase: str) -> Optional[dict]:
    n = _norm(phrase)
    return next((p for p in pieces if n and n in _norm(p["es"])), None)


def make_tip(en: str, es: str, pieces: list[dict], said: str = "") -> str:
    """At most one short, true tip about this sentence, or "". Rules are tried from the most surprising
    (false friends, idioms) to the most general (dropped 'I'); each only fires when its Spanish pattern is in
    the final sentence, so the tip always describes what is on screen. `said` (the raw input) is also searched
    for the idiom / false-friend rules, since meaning_en may have paraphrased the idiom away."""
    en_l, es_l = (en or "").lower(), (es or "").lower()
    src = f"{en_l}\n{(said or '').lower()}"
    if not es_l:
        return ""
    if "embarrass" in src and re.search(r"\b(pena|vergüenza|verguenza)\b", es_l):
        return "Careful: 'embarazada' means pregnant. For embarrassed, Mexicans say 'me da pena'."
    if "excited" in src and "emocionad" in es_l:
        return "Say 'emocionado' for excited: 'excitado' usually means sexually aroused."
    if re.search(r"\bactually\b", src) and "en realidad" in es_l:
        return "'Actualmente' means 'currently'. 'Actually' is 'en realidad'."
    if "library" in src and "biblioteca" in es_l:
        return "A library is a 'biblioteca'. A 'librería' is a bookshop."
    if "cats and dogs" in src and "cántaros" in es_l:
        return "Idioms don't translate word for word: Spanish rains 'a cántaros' (by the jugful), not cats and dogs."
    if re.search(r"how (do|would|can) (you|i) say", src) and "se dice" in es_l:
        return "'¿Cómo se dice…?' (literally 'how is it said?') is the set phrase for 'how do you say…?'."
    m = re.search(r"\b(tengo|tienes|tiene|tenemos|tienen)\s+(\d+|[a-záéíóúñ]+(?:\s+y\s+[a-záéíóúñ]+)?)\s+años\b", es_l)
    if m and re.search(r"\bold\b|\bage\b|years", en_l):
        return f"For age Spanish uses tener: '{m.group(0)}' is literally 'have {m.group(2)} years'."
    m = re.search(r"\b(tengo|tienes|tiene|tenemos|tienen)\s+(?:(?:mucho|mucha|muchísimo|muchísima|un poco de|tanto|tanta)\s+)?"
                  r"(hambre|sed|calor|frío|frio|sueño|miedo|prisa|razón|suerte)\b", es_l)
    if m and re.search(r"\b(" + _TENER_EN[m.group(2)] + r")\b", en_l):
        return (f"Spanish uses tener (to have) here: '{m.group(0)}' is literally 'have {_TENER_IDIOM[m.group(2)]}'.")
    m = re.search(r"\bhace\s+(?:(?:mucho|muchísimo|un poco de|bastante)\s+)?(calor|frío|frio|viento|sol|buen tiempo|mal tiempo)\b",
                  es_l)
    if m and re.search(r"\b(hot|cold|warm|windy|sunny|weather|freezing|nice out|nice day)\b", en_l):
        return f"Weather uses hacer: '{m.group(0)}' is literally 'it makes {_HACER_W[m.group(1)]}'."
    m = re.search(r"\b(me|te|le|nos|les)\s+(duele|duelen)\b", es_l)
    if m:
        return f"Pain works like gustar: '{m.group(0)}' is literally 'it hurts {_OBJ[m.group(1)]}'."
    m = re.search(r"\b(me|te|le|nos|les)\s+(gusta|gustan|gustó|gustaron|gustaba|gustaría|encanta|encantan|encantó)\b", es_l)
    if m:
        pron, verb = m.group(1), m.group(2)
        if verb == "gustaría":
            return (f"'{pron.capitalize()} gustaría' (literally 'it would please {_OBJ[pron]}') is the polite "
                    f"way to say 'would like'.")
        if verb in ("gustan", "gustaron", "encantan"):
            return (f"'{pron} {verb}' is literally 'they please {_OBJ[pron]}': the liked things are the subject, "
                    f"so the verb is plural.")
        lit = "delights" if verb.startswith("encant") else "pleases"
        plural = "encantan" if verb.startswith("encant") else "gustan"
        return f"'{pron} {verb}' is literally 'it {lit} {_OBJ[pron]}'. For plural things it's '{pron} {plural}'."
    if re.search(r"\bme llamo\b", es_l) and re.search(r"\bname\b", en_l):
        return "'Me llamo…' is literally 'I call myself…'."
    m = _OBJ_RE.search(es or "")
    if m and m.group(0).lower() != "me llamo" and re.search(r"\b(you|it|him|her|them|me|us)\b", en_l):
        p = _piece_with(pieces, m.group(0))
        phrase = m.group(0).lower()
        if p and _norm(p["es"]) == _norm(m.group(0)):
            return f"Object words go before the verb: '{phrase}' = '{p['en']}'."
        return f"Object words like '{m.group(1).lower()}' go before the verb: '{phrase}'."
    m = _ADJ_RE.search(es or "")
    if m:
        eng = _ADJ[m.group(4).lower()]
        if re.search(r"\b(" + eng.lower() + r")\s+[a-z]{3,}", en_l):
            return f"Most adjectives go after the noun in Spanish: '{m.group(0).lower()}'."
    m = re.search(r"\b(estoy|estás|está|estamos|están)\s+(?:(?:muy|un poco|bien|tan|súper|super|bastante)\s+)?"
                  r"(?!de\b|por\b|para\b|a\b|que\b|en\b|aquí\b|allá\b|ahí\b|bien\b)([a-záéíóúñ]+)\b", es_l)
    if m and not re.search(r"(ando|iendo|yendo)$", m.group(2)) and \
            re.search(r"\b(i'm|i am|you're|you are|he's|she's|it's|it is|is|are|we're|feel|feeling|look)\b", en_l):
        return f"For feelings and states Spanish uses estar, not ser: '{m.group(0)}'."
    m = re.search(r"\b(tengo|tienes|tiene|tenemos|tienen)\s+que\s+[a-záéíóúñ]+", es_l)
    if m and re.search(r"\b(have to|has to|need to|must|got to|gotta|had to)\b", en_l):
        return f"'Tener que + verb' means 'have to': '{m.group(0)}'."
    m = re.search(r"\b(voy|vas|va|vamos|van)\s+a\s+[a-záéíóúñ]+(ar|er|ir)\b", es_l)
    if m and re.search(r"\b(going to|gonna|will|'ll|let's)\b", en_l):
        if "let's" in en_l and m.group(1) == "vamos":
            return f"'Vamos a + verb' also means 'let's…': '{m.group(0)}'."
        return f"Easy future: ir a + verb, just like 'going to': '{m.group(0)}'."
    if re.match(r"\s*(do|does|did)\s+(you|they|we|he|she|it)\b", en_l) and es_l.lstrip().startswith("¿") and \
            not re.search(r"\b(hacer|haces|hace|hiciste|hizo)\b", es_l):
        return "Spanish questions need no 'do': the verb alone, with ¿…?, makes the question."
    if re.match(r"\s*(i|i'm|i'd|i'll|i've|we|we're)\b", en_l) and not re.search(r"\b(yo|nosotros|nosotras)\b", es_l):
        for p in pieces[:3]:
            w = p["es"].strip("¿¡!?.,; ")
            pen = p["en"].lower()
            if " " in w or not _YO_ENDING.search(_norm(w)) or _norm(w) in _PRONOUNS | {"me", "te", "no", "se", "lo"}:
                continue
            if re.match(r"(i|i'm|i'll|i'd|i've)\s", pen):
                return f"No 'yo' needed: '{w}' already means '{p['en']}'."
            if re.match(r"we\s", pen) and _norm(w).endswith("mos"):
                return f"No 'nosotros' needed: '{w}' already means '{p['en']}'."
    m = re.search(r"\b(don't|doesn't|didn't)\b", en_l)
    if m:
        p = next((p for p in pieces if re.match(r"no\s", _norm(p["es"]) + " ") and _norm(p["es"]) != "no"
                  and "n't" in p["en"].lower()), None)
        if p:
            return f"For 'don't', just put 'no' before the verb: '{p['es'].strip('¿¡!?.,; ')}' = '{p['en']}'."
    return ""


# Idioms a small model may still translate literally: (English pattern in what he said, check on the Spanish,
# hint for the retry). Checked on the input and on meaning_en.
_IDIOM_GUARDS = [
    (r"\bi'?m\s+(?:so\s+|really\s+|very\s+|a\s+bit\s+|a\s+little\s+|super\s+)?(hot|cold|warm|freezing)\b",
     lambda es: re.search(r"\b(tengo|tenemos)\b[^.?!]*\b(calor|frío|frio)\b", es),
     "a person feeling hot / cold is 'tengo calor' / 'tengo frío' ('hace calor' is the weather)"),
    (r"\bi'?m\s+(?:so\s+|really\s+|very\s+|a\s+bit\s+|a\s+little\s+|super\s+)?(hungry|starving|thirsty|sleepy|scared|afraid)\b",
     lambda es: re.search(r"\b(tengo|tenemos|me\s+muero\s+de)\b", es),
     "hungry / thirsty / sleepy / scared use tener: tengo hambre / sed / sueño / miedo"),
    (r"\bi'?m\s+\d+(\s+years?\s+old)?\b", lambda es: re.search(r"\btengo\s+\d+\s+años\b", es),
     "age uses tener: 'tengo 32 años'"),
    (r"\bembarrass", lambda es: not re.search(r"embarazad", es), "embarrassed is 'me da pena' (embarazada = pregnant)"),
    (r"\bexcited\b", lambda es: not re.search(r"excitad", es), "excited is 'emocionado' (never excitado)"),
    (r"\b(i|we)\s+miss\s+(you|him|her|them|my|our|home|mexico)\b", lambda es: re.search(r"\bextra[ñn]", es),
     "'I miss you' is 'te extraño'"),
    (r"\bhow\s+do\s+you\s+say\b", lambda es: re.search(r"\bse\s+dice\b", es), "'how do you say X' is '¿cómo se dice X?'"),
]


def idiom_problems(said: str, en: str, es: str) -> list[str]:
    src = f"{said}\n{en}".lower()
    es_l = (es or "").lower()
    return [hint for pat, ok, hint in _IDIOM_GUARDS if re.search(pat, src) and not ok(es_l)]


def maybe_spanish(text: str) -> bool:
    """Cheap pre-check, so the grammar check only runs (in parallel) when the input may be a Spanish attempt."""
    if re.search(r"[áéíóúñ¿¡]", text.lower()):
        return True
    w = _words(text)
    es = sum(1 for x in w if x in _ES_HINT)
    en = sum(1 for x in w if x in _EN_WORDS and x not in _ES_HINT)
    return es > 0 and es >= en


def clean_spanish(es: str) -> bool:
    return bool(es) and english_score(es) < 0.15 and not odd_script(es)


def validate_translation(data: Any) -> Optional[dict]:
    """The model's JSON -> {input_lang, en, es, pieces(raw)}; None if unusable."""
    if not isinstance(data, dict):
        return None
    es = latinize(_str(data.get("spanish"), 400))
    if not es:
        return None
    lang = _LANG.get(_str(data.get("input_language")).lower(), "en")
    return {"input_lang": lang, "en": latinize(_str(data.get("meaning_en"), 400)), "es": es,
            "raw_pieces": data.get("pieces") if isinstance(data.get("pieces"), list) else []}


def finish_translation(text: str, cand: dict, correction: Optional[dict], tip: Optional[str] = None) -> dict:
    """Mexican swaps, pieces check, tip, correction -> the contract shape."""
    es = mexicanize(cand["es"])
    raw = []
    for p in cand["raw_pieces"]:
        sp = split_piece(p)
        if sp:
            raw.append({"es": mexicanize(sp[0]), "en": sp[1]})
    pieces = align_pieces(es, raw)
    if not pieces_ok(es, pieces):
        pieces = []
    en = cand["en"] or (text if cand["input_lang"] == "en" else "")
    if tip is None or not tip.strip():
        tip = make_tip(en, es, pieces, said=text)
    if cand["input_lang"] != "es":
        correction = None
    return {"input_lang": cand["input_lang"], "en": en, "es": es, "pieces": pieces, "tip": (tip or "").strip()[:200],
            "correction": correction}


def translate_local(text: str) -> dict:
    LOCAL.warm_key = ("translate", 0)
    LOCAL.ensure_loaded()
    check: dict[str, Any] = {}
    th = None
    if maybe_spanish(text):           # maybe Spanish: run the chat's grammar check alongside
        def run_check() -> None:
            try:
                check["c"] = check_local([Turn(role="user", text=text)])
            except Exception as e:
                check["error"] = e
        th = threading.Thread(target=run_check, daemon=True)
        th.start()
    LAST.clear()
    best, hint = None, ""
    for temp in (0.1, 0.5):
        try:
            out, st = LOCAL.complete(build_translate(text, hint), schema=TRANSLATE_SCHEMA, temperature=temp,
                                     max_tokens=360, slot=SLOT_TRANSLATE)
        except urllib.error.HTTPError as e:
            LAST.setdefault("attempts", []).append({"error": f"HTTP {e.code}"})
            continue
        LAST.setdefault("attempts", []).append({**st, "text": out[:600]})
        cand = validate_translation(parse_json(out))
        if cand is None:
            continue
        problems = []
        if not clean_spanish(cand["es"]):
            problems.append("spanish must be only Spanish")
        spain = [w for w in peninsular(cand["es"]) if w not in _MX_SWAPS]
        if spain:
            problems.append("Mexican Spanish, never " + ", ".join(sorted(set(spain))))
        problems += idiom_problems(text, cand["en"], cand["es"])
        cand_pieces_ok = pieces_ok(mexicanize(cand["es"]), align_pieces(
            mexicanize(cand["es"]), [{"es": mexicanize(s[0]), "en": s[1]} for s in
                                     (split_piece(p) for p in cand["raw_pieces"]) if s]))
        score = (not problems) * 2 + cand_pieces_ok
        if best is None or score > best[0]:
            best = (score, cand)
        if score == 3 or (not problems and temp > 0.1):
            break
        if problems:
            hint = "; ".join(problems)
        elif not cand_pieces_ok:
            hint = "every word of spanish in the pieces, in order"
    if th is not None:
        th.join(60)
    if best is None:
        raise ChatError(503, "Penguin could not translate that one. Try saying it another way.")
    return finish_translation(text, best[1], check.get("c"))


def _claude_json(system: str, user: str, schema: dict) -> Any:
    """One Claude request with structured JSON output (same settings as chat_claude)."""
    import anthropic
    client = anthropic.Anthropic()
    kwargs: dict[str, Any] = dict(model=CLAUDE_MODEL, max_tokens=4000, system=system,
                                  messages=[{"role": "user", "content": user}],
                                  output_config={"effort": "low", "format": {"type": "json_schema", "schema": schema}})
    try:
        try:
            resp = client.beta.messages.create(betas=["server-side-fallback-2026-07-01"], fallbacks="default", **kwargs)
        except TypeError:
            resp = client.messages.create(**kwargs)
    except anthropic.AuthenticationError:
        raise ChatError(503, "The Claude API key was rejected.", "Check ANTHROPIC_API_KEY and restart start.bat.")
    except anthropic.RateLimitError:
        raise ChatError(503, "Claude is busy right now. Try again in a minute.")
    except anthropic.APIStatusError as e:
        raise ChatError(503, f"Claude error ({e.status_code}). Try again in a moment.")
    except anthropic.APIConnectionError:
        raise ChatError(503, "Could not reach Claude (no internet?).", SETUP_HINT)
    if resp.stop_reason == "refusal":
        raise ChatError(503, "Claude declined to answer this one. Try saying it another way.")
    return parse_json(next((b.text for b in resp.content if getattr(b, "type", "") == "text"), ""))


def translate_claude(text: str) -> dict:
    examples = "\n".join(f"{said}\n-> {json.dumps(out, ensure_ascii=False)}" for said, out in TRANSLATE_EXAMPLES)
    data = _claude_json(TRANSLATE_SYSTEM + CLAUDE_TRANSLATE_EXTRA + "\n\nEXAMPLES (fields 5-7 left out)\n" + examples,
                        text, CLAUDE_TRANSLATE_SCHEMA)
    cand = validate_translation(data)
    if cand is None:
        raise ChatError(503, "Claude could not translate that one. Try saying it another way.")
    corr = make_correction(text, _str(data.get("learner_fixed")), _str(data.get("why_en")))
    return finish_translation(text, cand, corr, tip=_str(data.get("tip"), 200))


# ---------------------------------------------------------------- routes
class Turn(BaseModel):
    role: Literal["bot", "user"]
    text: str = ""


class ChatIn(BaseModel):
    topic_id: str
    level: int = Field(1, ge=1, le=3)
    history: list[Turn] = []
    backend: Optional[Literal["local", "claude"]] = None


def _default_backend() -> Optional[str]:
    if LOCAL.installed():
        return "local"
    if claude_available():
        return "claude"
    return None


def _err(status: int, msg: str, setup: str = "") -> JSONResponse:
    return JSONResponse({"error": msg, "setup": setup}, status_code=status)


@router.get("/api/chat/status")
def chat_status(warm: bool = False, topic_id: Optional[str] = None, level: int = 1) -> dict[str, Any]:
    local_ok, claude_ok = LOCAL.installed(), claude_available()
    backend = _default_backend()
    if warm and local_ok:
        LOCAL.warm(topics().get(topic_id or ""), level if level in LEVEL_RULES else 1)
    if backend == "local":
        model = LOCAL.name()
        note = ("Small open-source model running on this computer; works offline. " +
                ("Loaded and ready." if LOCAL.loaded() else "The first reply takes longer while it loads."))
    elif backend == "claude":
        model = CLAUDE_MODEL
        note = "Using Claude through the Anthropic API (needs internet). The offline model is not installed."
    else:
        model = None
        note = "Chat is not set up yet. " + SETUP_HINT
    if LOCAL.load_error:
        note += f" (The offline model failed to load: {LOCAL.load_error})"
    eng = LOCAL.engine_class()
    return {"available": backend is not None, "backend": backend, "model": model, "note": note,
            "backends": [b for b, ok in (("local", local_ok), ("claude", claude_ok)) if ok],
            "loaded": LOCAL.loaded(), "loading": LOCAL.loading,
            "engine": eng.name if eng else None,
            "claude_model": CLAUDE_MODEL if claude_ok else None,
            "disclaimer": DISCLAIMER,
            "setup": None if local_ok else SETUP_HINT}


@router.post("/api/chat")
def chat(body: ChatIn):
    topic = topics().get(body.topic_id)
    if topic is None:
        return _err(404, f"Unknown topic '{body.topic_id}'.")
    backend = body.backend or _default_backend()
    if backend is None:
        return _err(503, "Penguin's chat is not set up on this computer yet.", SETUP_HINT)
    if backend == "claude" and not claude_available():
        return _err(503, "Claude is not configured (ANTHROPIC_API_KEY is not set).", SETUP_HINT)
    if backend == "local" and not LOCAL.installed():
        return _err(503, "The offline chat model is not installed.", SETUP_HINT)
    t0 = time.perf_counter()
    try:
        out = chat_local(topic, body.level, body.history) if backend == "local" else \
            chat_claude(topic, body.level, body.history)
    except ChatError as e:
        return _err(e.status, e.msg, e.setup)
    except Exception as e:     # model failed to load, out of memory, ...
        return _err(503, f"Penguin could not answer ({type(e).__name__}: {str(e)[:200]}).", SETUP_HINT)
    out["backend"] = backend
    out["ms"] = int((time.perf_counter() - t0) * 1000)
    return out


class TranslateIn(BaseModel):
    text: str = ""
    backend: Optional[Literal["local", "claude"]] = None


@router.post("/api/translate")
def translate(body: TranslateIn):
    text = " ".join((body.text or "").split())
    if not text or not _words(text) and not re.search(r"\w", text):
        return _err(422, "Say or type a sentence first.")
    if len(text) > MAX_TRANSLATE_CHARS:
        return _err(422, f"That is too long for one go (max {MAX_TRANSLATE_CHARS} characters). "
                         "Send one sentence at a time.")
    backend = body.backend or _default_backend()
    if backend is None:
        return _err(503, "Penguin's model is not set up on this computer yet.", SETUP_HINT)
    if backend == "claude" and not claude_available():
        return _err(503, "Claude is not configured (ANTHROPIC_API_KEY is not set).", SETUP_HINT)
    if backend == "local" and not LOCAL.installed():
        return _err(503, "The offline model is not installed.", SETUP_HINT)
    t0 = time.perf_counter()
    try:
        out = translate_local(text) if backend == "local" else translate_claude(text)
    except ChatError as e:
        return _err(e.status, e.msg, e.setup)
    except Exception as e:
        return _err(503, f"Penguin could not translate ({type(e).__name__}: {str(e)[:200]}).", SETUP_HINT)
    out["backend"] = backend
    out["ms"] = int((time.perf_counter() - t0) * 1000)
    return out
