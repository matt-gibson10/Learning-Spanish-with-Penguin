"""Charla con Penguin: a Spanish-only conversation partner.

API (see docs/CONTRACT.md, "Conversation API"; details in docs/CHAT.md):
  GET  /api/chat/status   -> {"available", "backend", "model", "note", "backends": [...], "loaded", ...}
                             ?warm=1[&topic_id=ch_playa&level=1] loads the local model in the background and
                             pre-reads that topic's instructions, so the first reply is fast.
  POST /api/chat          -> {"reply_es", "reply_en", "correction", "suggestions", "backend", "ms"}
                             errors: 4xx/503 {"error": "...", "setup": "..."}

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
        key = ((topic or {}).get("id"), level)
        if self.loading or (self.loaded() and (topic is None or key == self.warm_key)):
            return
        if topic is not None:
            self.warm_key = key

        def run() -> None:
            try:
                self.ensure_loaded()
                if topic is not None:
                    hist = [Turn(role="bot", text=topic.get("opener_es", "")), Turn(role="user", text="Hola")]
                    self.complete(build_check(hist), schema=None, max_tokens=1, slot=SLOT_CHECK)
                    self.complete(build_messages(topic, level, hist[:1]), schema=None, max_tokens=1)
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
