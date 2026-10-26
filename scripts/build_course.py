"""Build web/data/course.js from content/*.json (docs/CONTRACT.md).

    python scripts/build_course.py                       # content/ -> web/data/course.js
    python scripts/build_course.py --content DIR --out FILE [--quiet] [--strict] [--force]

Loads whatever content exists (vocab_*.json, chunks, sounds, grammar, prompts, stories, about), validates every
entry against the contract (problems are reported, a bad entry is skipped or repaired, never fatal), merges the vocab
files (dedupe by id, sort by rank), generates units -> lessons -> steps, and writes `window.COURSE = {...};` as compact
JSON. Deterministic: same input -> byte-identical output (the file is only rewritten when it changes).
Files whose names start with "_" (work-in-progress parts) are ignored.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOPICS = set("""people family body health food drink home city places travel transport money shopping time weather nature
animals work school emotions communication clothing numbers colors description actions abstract leisure technology
function courtesy directions hotel restaurant emergency""".split())
POS = {"noun", "verb", "adj", "adv", "pron", "prep", "conj", "det", "num", "interj"}
CHUNK_KINDS = {"phrase", "collocation", "frame", "filler", "question", "reply"}
TENSES = ["pres", "pret", "imp", "fut", "subj"]
TRAVEL_TOPICS = {"courtesy", "food", "drink", "restaurant", "hotel", "directions", "transport", "travel", "numbers", "money",
                 "shopping", "emergency", "places", "city", "time", "communication"}
GRAMMAR_DRILLS = {"choice", "fill", "transform", "translate"}
SOUND_DRILLS = {"hear_pick", "hear_type"}

ITEMS_PER_LESSON = 11
LESSONS_PER_UNIT = 10
GRAMMAR_EVERY = 3        # at most one grammar unit every N lessons
SOUND_EVERY = 4          # one connected-speech rule every N lessons
BUILD_MAX = 4            # sentences per build step
TRIP_UNITS = 2           # units at the start that form the "trip pack"
SURVIVAL_CHUNK_RANK = 270
DDM_LESSON = 5           # position of the Día de Muertos lesson
TRIP_PACK_TOPICS = {"travel", "hotel", "restaurant", "food", "drink", "transport", "directions", "money", "emergency",
                    "courtesy", "shopping"}
TRIP_FLAG_TOPICS = {"food", "drink", "hotel", "restaurant", "transport", "emergency"}
DDM_WORDS = ["dia de muertos", "dia de los muertos", "ofrenda", "cempasuchil", "catrina", "pan de muerto", "calavera",
             "calaverita", "vela", "veladora", "altar", "panteon", "cementerio", "tumba", "copal", "papel picado", "calaca",
             "difunto", "muerto", "alma", "flor"]

TOPIC_TITLES = {
    "people": "People", "family": "Family", "body": "The body", "health": "Health", "food": "Food", "drink": "Drinks",
    "home": "Home", "city": "The city", "places": "Places", "travel": "Travel", "transport": "Getting around",
    "money": "Money", "shopping": "Shopping", "time": "Time", "weather": "Weather", "nature": "Nature", "animals": "Animals",
    "work": "Work", "school": "School", "emotions": "Feelings", "communication": "Talking", "clothing": "Clothes",
    "numbers": "Numbers", "colors": "Colours", "description": "Describing things", "actions": "Everyday actions",
    "abstract": "Ideas", "leisure": "Free time", "technology": "Tech", "function": "Core words", "courtesy": "Courtesy",
    "directions": "Directions", "hotel": "At the hotel", "restaurant": "Eating out", "emergency": "Emergencies",
}


class Report:
    def __init__(self) -> None:
        self.problems: dict[str, list[str]] = defaultdict(list)

    def add(self, where: str, msg: str) -> None:
        self.problems[where].append(msg)

    def count(self) -> int:
        return sum(len(v) for v in self.problems.values())


def strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def expected_tier(rank: int) -> int:
    return 1 if rank <= 500 else 2 if rank <= 1000 else 3 if rank <= 1500 else 4 if rank <= 2000 else 5 if rank <= 2500 else 6


def load_json(path: Path, rep: Report) -> list:
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
    except json.JSONDecodeError as e:
        rep.add(path.name, f"invalid JSON ({e.msg} at line {e.lineno}) — file skipped")
        return []
    except OSError as e:
        rep.add(path.name, f"unreadable ({e}) — file skipped")
        return []
    if isinstance(data, dict):
        rep.add(path.name, "top level is an object, expected an array (using its list values)")
        lists = [v for v in data.values() if isinstance(v, list)]
        data = [x for v in lists for x in v]
    if not isinstance(data, list):
        rep.add(path.name, "top level is not an array — file skipped")
        return []
    return [x for x in data if isinstance(x, dict)]


def clean(o):
    """Drop None / empty values recursively (keeps 0 and False) to keep course.js small."""
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items() if v is not None and v != "" and v != [] and v != {}}
    if isinstance(o, list):
        return [clean(v) for v in o]
    return o


# ---------------------------------------------------------------- validation
def check_vocab(e: dict, where: str, rep: Report) -> dict | None:
    eid = e.get("id")
    for k in ("id", "es", "en"):
        if not isinstance(e.get(k), str) or not e.get(k).strip():
            rep.add(where, f"{eid or e.get('es') or '?'}: missing '{k}' — skipped")
            return None
    if not eid.startswith("v_"):
        rep.add(where, f"{eid}: id should start with v_")
    pos = e.get("pos")
    if pos not in POS:
        rep.add(where, f"{eid}: unknown pos {pos!r}")
    rank = e.get("rank")
    if not isinstance(rank, (int, float)):
        rep.add(where, f"{eid}: missing/non-numeric rank (set to 5000)")
        e["rank"] = 5000
    else:
        e["rank"] = int(rank)
    if e.get("tier") not in (1, 2, 3, 4, 5, 6):
        e["tier"] = expected_tier(e["rank"])
    elif abs(e["tier"] - expected_tier(e["rank"])) > 1:
        rep.add(where, f"{eid}: tier {e['tier']} doesn't match rank {e['rank']}")
    if e.get("topic") not in TOPICS:
        rep.add(where, f"{eid}: unknown topic {e.get('topic')!r}")
    if pos == "noun":
        if e.get("gender") not in ("m", "f", "mf"):
            rep.add(where, f"{eid}: noun without gender m/f/mf")
        if e.get("article") not in ("el", "la", "el/la"):
            rep.add(where, f"{eid}: noun article should be el / la / el/la")
            e["article"] = {"m": "el", "f": "la", "mf": "el/la"}.get(e.get("gender"), "el")
    if pos == "verb":
        c = e.get("conj")
        if not isinstance(c, dict):
            rep.add(where, f"{eid}: verb without conj")
        else:
            for t in TENSES:
                v = c.get(t)
                if v is None:
                    rep.add(where, f"{eid}: conj.{t} missing")
                elif not (isinstance(v, list) and len(v) == 5 and all(isinstance(x, str) for x in v)):
                    rep.add(where, f"{eid}: conj.{t} must be 5 strings — dropped")
                    c.pop(t, None)
    for k in ("ex_es", "ex_en"):
        if not e.get(k):
            rep.add(where, f"{eid}: missing {k}")
    if e.get("ex_es") and len(e["ex_es"].split()) > 12:
        rep.add(where, f"{eid}: example longer than 10 words")
    if "natural" in e and not (isinstance(e["natural"], list) and all(isinstance(x, str) for x in e["natural"])):
        rep.add(where, f"{eid}: natural must be an array of strings — dropped")
        e.pop("natural")
    return e


def check_chunk(e: dict, where: str, rep: Report) -> dict | None:
    eid = e.get("id")
    for k in ("id", "es", "en"):
        if not isinstance(e.get(k), str) or not e.get(k).strip():
            rep.add(where, f"{eid or '?'}: missing '{k}' — skipped")
            return None
    if not eid.startswith("c_"):
        rep.add(where, f"{eid}: id should start with c_")
    if not isinstance(e.get("rank"), (int, float)):
        rep.add(where, f"{eid}: missing rank (set to 999)")
        e["rank"] = 999
    e["rank"] = int(e["rank"])
    if e.get("tier") not in (1, 2, 3, 4, 5, 6):
        e["tier"] = 1
    if e.get("kind") not in CHUNK_KINDS:
        rep.add(where, f"{eid}: unknown kind {e.get('kind')!r}")
    if e.get("topic") not in TOPICS:
        rep.add(where, f"{eid}: unknown topic {e.get('topic')!r}")
    if e.get("kind") == "frame" and not e.get("slot"):
        rep.add(where, f"{eid}: frame without slot")
    if not e.get("ex_es"):
        rep.add(where, f"{eid}: missing ex_es")
    return e


def check_sound(e: dict, where: str, rep: Report) -> dict | None:
    eid = e.get("id")
    if not eid or not e.get("name"):
        rep.add(where, f"{eid or '?'}: missing id/name — skipped")
        return None
    for k in ("summary", "explain"):
        if not e.get(k):
            rep.add(where, f"{eid}: missing {k}")
    exs = [x for x in e.get("examples") or [] if isinstance(x, dict) and x.get("written")]
    if not exs:
        rep.add(where, f"{eid}: no examples")
    for x in exs:
        x.setdefault("slow", x.get("written"))
        x.setdefault("fast", x.get("sounds") or x.get("written"))
    e["examples"] = exs
    drills = []
    for i, d in enumerate(e.get("drills") or []):
        if not isinstance(d, dict) or d.get("type") not in SOUND_DRILLS or not d.get("say") or not d.get("answer"):
            rep.add(where, f"{eid}: drill {i} malformed — dropped")
            continue
        if d["type"] == "hear_pick":
            opts = d.get("options") or []
            if d["answer"] not in opts:
                rep.add(where, f"{eid}: drill {i} answer not among options (added)")
                d["options"] = list(opts) + [d["answer"]]
        drills.append(d)
    e["drills"] = drills
    return e


def check_grammar(e: dict, where: str, rep: Report) -> dict | None:
    eid = e.get("id")
    if not eid or not e.get("title"):
        rep.add(where, f"{eid or '?'}: missing id/title — skipped")
        return None
    if not isinstance(e.get("order"), (int, float)):
        rep.add(where, f"{eid}: missing order (put last)")
        e["order"] = 999
    if e.get("tier") not in (1, 2, 3, 4, 5, 6):
        e["tier"] = 1
    if not e.get("explain"):
        rep.add(where, f"{eid}: missing explain")
    drills = []
    for i, d in enumerate(e.get("drills") or []):
        if not isinstance(d, dict) or d.get("type") not in GRAMMAR_DRILLS or not d.get("q") or not d.get("answer"):
            rep.add(where, f"{eid}: drill {i} malformed — dropped")
            continue
        if d["type"] == "choice" and d["answer"] not in (d.get("options") or []):
            rep.add(where, f"{eid}: drill {i} answer not among options (added)")
            d["options"] = list(d.get("options") or []) + [d["answer"]]
        drills.append(d)
    if len(drills) < 12:
        rep.add(where, f"{eid}: only {len(drills)} drills (contract: ≥ 12)")
    e["drills"] = drills
    return e


def check_prompt(e: dict, where: str, rep: Report, grammar_ids: set) -> dict | None:
    eid = e.get("id")
    if not eid or not e.get("prompt_en"):
        rep.add(where, f"{eid or '?'}: missing id/prompt_en — skipped")
        return None
    if e.get("after_grammar") and e["after_grammar"] not in grammar_ids:
        rep.add(where, f"{eid}: after_grammar {e['after_grammar']!r} not a grammar unit (treated as none)")
        e["after_grammar"] = None
    if not e.get("models"):
        rep.add(where, f"{eid}: no model answers")
    if not e.get("targets"):
        rep.add(where, f"{eid}: no targets")
    if e.get("tier") not in (1, 2, 3, 4, 5, 6):
        e["tier"] = 1
    return e


def check_reading(e: dict, where: str, rep: Report, grammar_ids: set) -> dict | None:
    eid = e.get("id")
    if not eid or not e.get("title"):
        rep.add(where, f"{eid or '?'}: missing id/title — skipped")
        return None
    if not str(eid).startswith("rd_"):
        rep.add(where, f"{eid}: id should start with rd_")
    if e.get("after_grammar") and e["after_grammar"] not in grammar_ids:
        rep.add(where, f"{eid}: after_grammar {e['after_grammar']!r} not a grammar unit (treated as none)")
        e["after_grammar"] = None
    sents = []
    for i, s in enumerate(e.get("sentences") or []):
        if not isinstance(s, dict) or not s.get("es") or not s.get("en"):
            rep.add(where, f"{eid}: sentence {i} needs es + en — dropped")
            continue
        s["words"] = [w for w in s.get("words") or [] if isinstance(w, dict) and w.get("es")]
        if s.get("natural") is not None and not isinstance(s["natural"], str):
            s["natural"] = s["natural"][0] if isinstance(s["natural"], list) and s["natural"] else None
        sents.append(s)
    if not sents:
        rep.add(where, f"{eid}: no usable sentences — skipped")
        return None
    e["sentences"] = sents
    if e.get("tier") not in (1, 2, 3, 4, 5, 6):
        e["tier"] = 1
    return e


def check_chat_topic(e: dict, where: str, rep: Report) -> dict | None:
    eid = e.get("id")
    if not eid or not e.get("title") or not e.get("opener_es"):
        rep.add(where, f"{eid or '?'}: needs id, title and opener_es — skipped")
        return None
    if not str(eid).startswith("ch_"):
        rep.add(where, f"{eid}: id should start with ch_")
    if e.get("tier") not in (1, 2, 3):
        e["tier"] = 1
    for k in ("subtopics", "vocab", "starters"):
        if k in e and not (isinstance(e[k], list) and all(isinstance(x, str) for x in e[k])):
            rep.add(where, f"{eid}: {k} must be a list of strings — dropped")
            e.pop(k)
    return e


def check_story(e: dict, where: str, rep: Report, grammar_ids: set) -> dict | None:
    eid = e.get("id")
    if not eid or not e.get("title"):
        rep.add(where, f"{eid or '?'}: missing id/title — skipped")
        return None
    if e.get("after_grammar") and e["after_grammar"] not in grammar_ids:
        rep.add(where, f"{eid}: after_grammar {e['after_grammar']!r} not a grammar unit (treated as none)")
        e["after_grammar"] = None
    beats = [b for b in e.get("beats") or [] if isinstance(b, dict) and b.get("en")]
    if not beats:
        rep.add(where, f"{eid}: no beats")
    e["beats"] = beats
    if not e.get("model_es"):
        rep.add(where, f"{eid}: missing model_es")
    if e.get("tier") not in (1, 2, 3, 4, 5, 6):
        e["tier"] = 1
    return e


# ---------------------------------------------------------------- lesson plan
def fold(s: str) -> str:
    return strip_accents(str(s or "").lower()).strip(" ¿?¡!.…")


def is_trip_word(v: dict) -> bool:
    if v.get("topic") not in TRIP_PACK_TOPICS:
        return False
    return v["rank"] <= 1500 or "mexic" in (v.get("note") or "").lower() or v.get("topic") in TRIP_FLAG_TOPICS


def is_ddm(x: dict) -> bool:
    es = fold(x.get("es"))
    if es in DDM_WORDS:
        return x.get("pos") in (None, "noun") or es == "muerto"
    return "muertos" in es or "muerto" in es.split()


def interleave(items: list) -> list:
    """Order a lesson so chunks and words alternate (chunks first)."""
    cs = [x for x in items if x["id"].startswith("c_")]
    ws = [x for x in items if not x["id"].startswith("c_")]
    out = []
    while cs or ws:
        if cs:
            out.append(cs.pop(0))
        if ws:
            out.append(ws.pop(0))
    return out


def short_en(item: dict) -> str:
    en = re.split(r"[;,(/]", item.get("en", ""))[0].strip()
    en = re.sub(r"^(to|the|a|an) ", "", en)
    en = re.sub(r"\s*_{2,}\s*", "… ", en).strip()
    return en.rstrip("?.! ")


def build_plan(vocab: list, chunks: list, sounds: list, grammar: list, prompts: list, stories: list, readings: list | None = None) -> list:
    readings = readings or []
    # --- new-item sequence -------------------------------------------------------------------------
    # 1) "Trip pack" (first TRIP_UNITS units): survival chunks (rank <= SURVIVAL_CHUNK_RANK), trip-topic words
    #    (rank <= 1500, or Mexico/trip-flagged) and the most frequent core words, interleaved 4 : 4 : 3 per lesson,
    #    plus a Día de Muertos lesson at DDM_LESSON (the trip overlaps Nov 1–2).
    # 2) Everything else: words and chunks merged in frequency order (chunk ranks share the vocab scale).
    by_rank = lambda x: (x["rank"], x["id"])
    pack_size = TRIP_UNITS * LESSONS_PER_UNIT * ITEMS_PER_LESSON
    used: set = set()
    ddm, seen_es = [], set()
    for x in sorted(vocab + chunks, key=by_rank):
        if is_ddm(x) and fold(x["es"]) not in seen_es and len(ddm) < ITEMS_PER_LESSON:
            seen_es.add(fold(x["es"]))
            ddm.append(x)
    if len(ddm) < 4:
        ddm = []
    used.update(x["id"] for x in ddm)
    surv = [c for c in sorted(chunks, key=by_rank) if c["rank"] <= SURVIVAL_CHUNK_RANK]
    trip = sorted([v for v in vocab if v["id"] not in used and is_trip_word(v)],
                  key=lambda v: (0 if v["rank"] <= 1500 else 1, v["rank"], v["id"]))
    core = [v for v in sorted(vocab, key=by_rank) if v["id"] not in used]
    queues = [surv, trip, core]
    quota = [4, 4, 3]
    pos = [0, 0, 0]
    pack_lessons: list = []
    budget = pack_size - (len(ddm) if ddm else 0)
    taken = 0
    while taken < budget:
        lesson, progress = [], False
        for q, n in zip(range(3), quota):
            k = 0
            while k < n and pos[q] < len(queues[q]):
                x = queues[q][pos[q]]
                pos[q] += 1
                if x["id"] in used:
                    continue
                used.add(x["id"])
                lesson.append(x)
                k += 1
                progress = True
        if not progress:
            break
        # top up short lessons (small queues) with the next most frequent items
        if len(lesson) < ITEMS_PER_LESSON:
            for x in sorted(vocab + chunks, key=by_rank):
                if len(lesson) >= ITEMS_PER_LESSON:
                    break
                if x["id"] not in used:
                    used.add(x["id"])
                    lesson.append(x)
        # interleave sources within the lesson: chunk, word, core, chunk, ...
        pack_lessons.append(interleave(lesson))
        taken += len(lesson)
    lessons_items: list = [(items, None) for items in pack_lessons]
    if ddm:
        at = min(DDM_LESSON - 1, len(lessons_items))
        lessons_items.insert(at, (ddm, "Día de Muertos"))
    rest = [x for x in sorted(vocab + chunks, key=by_rank) if x["id"] not in used]
    for k in range(0, len(rest), ITEMS_PER_LESSON):
        lessons_items.append((rest[k:k + ITEMS_PER_LESSON], None))
    lesson_titles = [t for _, t in lessons_items]
    lessons_items = [items for items, _ in lessons_items]

    # --- sound rules in order of first use by the chunks being learned, then file order
    sound_ids = [s["id"] for s in sounds]
    first_use: dict[str, int] = {}
    for li, items in enumerate(lessons_items):
        for it in items:
            for r in it.get("sound_rules") or []:
                if r in sound_ids and r not in first_use:
                    first_use[r] = li
    sound_queue = sorted(sound_ids, key=lambda s: (first_use.get(s, 10_000), sound_ids.index(s)))
    gram_queue = sorted(grammar, key=lambda g: (g["order"], g["id"]))
    placed_grammar: set = set()
    prompt_pool = sorted(prompts, key=lambda p: (p.get("tier", 1), prompts.index(p)))
    story_pool = sorted(stories, key=lambda s: (s.get("tier", 1), stories.index(s)))
    used_prompts: set = set()
    used_stories: set = set()
    reading_pool = sorted(readings, key=lambda r: (r.get("tier", 1), readings.index(r)))
    used_readings: set = set()

    units, last_grammar, last_sound = [], -99, -99
    unit_lessons: list = []
    for li, items in enumerate(lessons_items):
        steps = [{"type": "learn", "items": [x["id"] for x in items]}]
        cur_tier = max(1, round(sum(x.get("tier", 1) for x in items) / len(items)))
        if sound_queue and li - last_sound >= SOUND_EVERY and li >= 1:
            steps.append({"type": "sounds", "rule": sound_queue.pop(0)})
            last_sound = li
        if gram_queue and li - last_grammar >= GRAMMAR_EVERY and li >= 1 and gram_queue[0].get("tier", 1) <= cur_tier + 1:
            g = gram_queue.pop(0)
            steps.append({"type": "grammar", "unit": g["id"]})
            placed_grammar.add(g["id"])
            last_grammar = li
        steps.append({"type": "drill", "items": [x["id"] for x in items]})
        buildable = [x["id"] for x in items if x.get("ex_es") and x.get("ex_en") and 2 <= len(x["ex_es"].split()) <= 9]
        if buildable:
            steps.append({"type": "build", "items": buildable[:BUILD_MAX]})
        if li >= 1:
            p = next((p for p in prompt_pool if p["id"] not in used_prompts and
                      (not p.get("after_grammar") or p["after_grammar"] in placed_grammar)), None)
            if p:
                used_prompts.add(p["id"])
                steps.append({"type": "prompt", "id": p["id"]})
        unit_lessons.append({"id": None, "title": lesson_titles[li], "steps": steps, "_items": items})
        end_of_unit = len(unit_lessons) == LESSONS_PER_UNIT or li == len(lessons_items) - 1
        if end_of_unit:
            rd = next((r for r in reading_pool if r["id"] not in used_readings and
                       (not r.get("after_grammar") or r["after_grammar"] in placed_grammar)), None)
            if rd:
                used_readings.add(rd["id"])
                target = unit_lessons[-2] if len(unit_lessons) >= 2 else unit_lessons[-1]
                target["steps"].append({"type": "read", "id": rd["id"]})
            s = next((s for s in story_pool if s["id"] not in used_stories and
                      (not s.get("after_grammar") or s["after_grammar"] in placed_grammar)), None)
            if s:
                used_stories.add(s["id"])
                unit_lessons[-1]["steps"].append({"type": "story", "id": s["id"]})
            units.append(unit_lessons)
            unit_lessons = []

    # leftovers (more grammar/sounds/prompts/stories than lessons to carry them): spread over the last unit's lessons
    if units:
        last = units[-1]
        k = 0

        def nxt():
            nonlocal k
            l = last[k % len(last)]
            k += 1
            return l["steps"]

        def insert_before_drill(steps, step):
            i = next((i for i, s in enumerate(steps) if s["type"] == "drill"), len(steps))
            steps.insert(i, step)

        for s in sound_queue:
            insert_before_drill(nxt(), {"type": "sounds", "rule": s})
        for g in gram_queue:
            insert_before_drill(nxt(), {"type": "grammar", "unit": g["id"]})
            placed_grammar.add(g["id"])
        for p in prompt_pool:
            if p["id"] not in used_prompts:
                nxt().append({"type": "prompt", "id": p["id"]})
        for s in story_pool:
            if s["id"] not in used_stories:
                last[-1]["steps"].append({"type": "story", "id": s["id"]})
        for r in reading_pool:
            if r["id"] not in used_readings:
                nxt().append({"type": "read", "id": r["id"]})

    # --- ids and titles
    out = []
    used_titles: Counter = Counter()
    overall = Counter(x.get("topic") for l in (l for u in units for l in u) for x in l["_items"] if x.get("topic"))
    for ui, lessons in enumerate(units, 1):
        all_items = [x for l in lessons for x in l["_items"]]
        topics = Counter(x.get("topic") for x in all_items if x.get("topic") and x.get("topic") not in ("function",))
        # distinctive topics: frequent in this unit relative to the whole course (keeps "Ideas & …" from repeating)
        ranked = sorted(topics.items(), key=lambda kv: (-(kv[1] / (overall[kv[0]] ** 0.6)), kv[0]))
        top = []
        for t, _ in ranked:
            name = TOPIC_TITLES.get(t, t.title())
            if " & ".join(top + [name]) not in used_titles or len(top) == 0:
                top.append(name)
            if len(top) == 2:
                break
        if ui == 1:
            title = "Survival basics"
        elif ui <= TRIP_UNITS:
            title = "Trip essentials"
        else:
            title = " & ".join(top) if top else f"Unit {ui}"
        used_titles[title] += 1
        if used_titles[title] > 1:
            title = f"{title} {used_titles[title]}"
        tiers = sorted(x.get("tier", 1) for x in all_items) or [1]
        unit = {"id": f"u{ui:02d}", "title": title, "tier": tiers[len(tiers) // 2], "lessons": []}
        for lj, l in enumerate(lessons, 1):
            its = l["_items"]
            named = [x for x in its if x.get("pos") not in ("det", "prep", "conj", "pron") and short_en(x)]
            names = [short_en(x) for x in (named or its)[:2]]
            ltitle = l.get("title") or (" & ".join(names).capitalize() if names else f"Lesson {lj}")
            unit["lessons"].append({"id": f"u{ui:02d}l{lj:02d}", "title": ltitle[:48], "steps": l["steps"]})
        out.append(unit)
    return out


# ---------------------------------------------------------------- main
def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--content", default=str(ROOT / "content"))
    ap.add_argument("--out", default=str(ROOT / "web" / "data" / "course.js"))
    ap.add_argument("--quiet", action="store_true", help="only print the one-line summary")
    ap.add_argument("--strict", action="store_true", help="exit 1 if there are validation problems")
    ap.add_argument("--force", action="store_true", help="write even when no vocab was found")
    ap.add_argument("--max-problems", type=int, default=12, help="problems to list per file")
    args = ap.parse_args(argv)
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    cdir = Path(args.content)
    rep = Report()
    if not cdir.is_dir():
        print(f"No content directory at {cdir}; nothing built.")
        return 0

    files = {p.name: p for p in sorted(cdir.glob("*.json")) if not p.name.startswith("_")}
    vocab_files = [files[n] for n in sorted(files) if n.startswith("vocab_")]
    raw = {k: load_json(files[f"{k}.json"], rep) if f"{k}.json" in files else []
           for k in ("chunks", "sounds", "grammar", "prompts", "stories", "readings", "about", "chat_topics")}

    # vocab: merge, dedupe by id (first file wins, but report), sort by rank
    vocab, seen = [], {}
    for vf in vocab_files:
        for e in load_json(vf, rep):
            e = check_vocab(e, vf.name, rep)
            if not e:
                continue
            if e["id"] in seen:
                rep.add(vf.name, f"{e['id']}: duplicate id (also in {seen[e['id']]}) — kept the first")
                continue
            seen[e["id"]] = vf.name
            vocab.append(e)
    vocab.sort(key=lambda v: (v["rank"], v["id"]))

    def dedupe(lst, name, check, *extra):
        out, ids = [], set()
        for e in lst:
            e = check(e, f"{name}.json", rep, *extra)
            if not e:
                continue
            if e["id"] in ids:
                rep.add(f"{name}.json", f"{e['id']}: duplicate id — kept the first")
                continue
            if e["id"] in seen:
                rep.add(f"{name}.json", f"{e['id']}: id clashes with a vocab id — skipped")
                continue
            ids.add(e["id"])
            out.append(e)
        return out

    chunks = sorted(dedupe(raw["chunks"], "chunks", check_chunk), key=lambda c: (c["rank"], c["id"]))
    sounds = dedupe(raw["sounds"], "sounds", check_sound)
    grammar = sorted(dedupe(raw["grammar"], "grammar", check_grammar), key=lambda g: (g["order"], g["id"]))
    gids = {g["id"] for g in grammar}
    prompts = dedupe(raw["prompts"], "prompts", check_prompt, gids)
    stories = dedupe(raw["stories"], "stories", check_story, gids)
    readings = dedupe(raw["readings"], "readings", check_reading, gids)
    chat_topics = dedupe(raw["chat_topics"], "chat_topics", check_chat_topic)
    about = [a for a in raw["about"] if isinstance(a, dict) and (a.get("title") or a.get("body"))]

    sids = {s["id"] for s in sounds}
    for c in chunks:
        bad = [r for r in c.get("sound_rules") or [] if r not in sids]
        if bad and sounds:
            rep.add("chunks.json", f"{c['id']}: unknown sound_rules {bad}")
    # homograph sanity: same es+pos twice
    dup_es = Counter((v["es"].lower(), v.get("pos")) for v in vocab)
    for (es, pos), n in dup_es.items():
        if n > 1:
            rep.add("vocab", f"'{es}' ({pos}) appears {n}× — homographs need distinct meanings")

    if not vocab and not chunks and not args.force:
        print(f"No vocab or chunks found in {cdir}; leaving {args.out} unchanged.")
        return 0

    units = build_plan(vocab, chunks, sounds, grammar, prompts, stories, readings)
    n_lessons = sum(len(u["lessons"]) for u in units)
    step_counts = Counter(s["type"] for u in units for l in u["lessons"] for s in l["steps"])

    course = {
        "meta": {
            "version": 1, "trip": "2026-10-30",
            "counts": {"vocab": len(vocab), "chunks": len(chunks), "sounds": len(sounds), "grammar": len(grammar),
                       "prompts": len(prompts), "stories": len(stories), "readings": len(readings),
                       "chat_topics": len(chat_topics), "units": len(units), "lessons": n_lessons},
            "sources": sorted(p.name for p in [*vocab_files, *[files[f"{k}.json"] for k in raw if f"{k}.json" in files]]),
        },
        "vocab": vocab, "chunks": chunks, "sounds": sounds, "grammar": grammar,
        "prompts": prompts, "stories": stories, "readings": readings, "chatTopics": chat_topics, "about": about, "units": units,
    }
    course = clean(course)
    body = json.dumps(course, ensure_ascii=False, separators=(",", ":"), sort_keys=False)
    digest = hashlib.sha1(body.encode("utf-8")).hexdigest()[:12]
    text = f"/* generated by scripts/build_course.py from content/*.json ({digest}) — do not edit */\nwindow.COURSE = {body};\n"
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    changed = not out.exists() or out.read_text(encoding="utf-8") != text
    if changed:
        out.write_text(text, encoding="utf-8")

    summary = (f"course.js {'written' if changed else 'unchanged'} ({len(text) / 1024:.0f} KB): {len(vocab)} words, {len(chunks)} chunks, "
               f"{len(sounds)} sound rules, {len(grammar)} grammar units, {len(prompts)} prompts, {len(stories)} stories, {len(readings)} readings, {len(chat_topics)} chat topics, "
               f"{len(about)} about cards -> {len(units)} units / {n_lessons} lessons "
               f"(steps: {', '.join(f'{k} {v}' for k, v in sorted(step_counts.items()))}); {rep.count()} problems")
    if not args.quiet:
        print(f"content: {cdir}")
        print("files:   " + ", ".join(course["meta"]["sources"]))
        for where, msgs in sorted(rep.problems.items()):
            print(f"  {where}: {len(msgs)} problem(s)")
            for m in msgs[: args.max_problems]:
                print(f"    - {m}")
            if len(msgs) > args.max_problems:
                print(f"    … and {len(msgs) - args.max_problems} more")
        for u in units[:3]:
            print(f"  {u['id']} {u['title']} (tier {u['tier']}): " + "; ".join(l["title"] for l in u["lessons"][:4]) + " …")
    print(summary)
    return 1 if args.strict and rep.count() else 0


if __name__ == "__main__":
    sys.exit(main())
