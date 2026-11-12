# Learning Spanish with Penguin 🐧🇲🇽

A click-through Spanish course for the Mexico trip (from **Oct 30, 2026**): the ~3000 most frequent Spanish words,
~620 everyday word sequences, how Mexicans *actually* say them in fast speech, grammar, responding to real
situations, writing and reading stories, a Spanish-only chat partner, a think-out-loud translator and a
chess-style rating that tracks your progress, with feedback from Penguin (he wears a sombrero).

Runs on your own computer: **Python/FastAPI + plain HTML/JS + SQLite**, the same setup as ChessPrep. No account; the
only optional network use is the AI writing coach. The chat and translator run on a small local model.

## Quick start (Windows)

Double-click **`start.bat`**. On the first run it creates `.venv` with Python 3.13 and installs `requirements.txt`.
Every time, it rebuilds the course and opens **http://localhost:8300**. Press **Continue** on Home and keep pressing it.

Without the server, `web/index.html` also works opened straight from disk (progress then lives only in the
browser).

### Audio

Audio uses the browser's built-in Spanish voices. **Use Edge or Chrome**: Edge has natural online voices (e.g.
*Microsoft Dalia Online (Natural) – Spanish (Mexico)*), Chrome has *Google español*. To get an offline Windows voice:
Settings → Time & language → Language & region → Add a language → Español (México) (with text-to-speech). Pick the
voice and the careful / slow / natural speeds in ⚙ Settings.

### Optional AI coach

Set `ANTHROPIC_API_KEY` (and optionally `COACH_MODEL`) before `start.bat` to get an **Ask Penguin** button. It
appears on prompts, stories and readings and gives gentle, beginner-level feedback on meaning. Without a key,
the built-in grader does everything.

## What's in the course

| Page | What it's for |
|---|---|
| **Home** | your rating, today's numbers, one big Continue button |
| **Course** | 33 units / 327 lessons. It opens with an 18-lesson starter path (greetings, ordering, getting around), then frequency order. Each lesson teaches a batch of words first, then tests them in different ways: recognise, hear, recall with hints, type. You are never asked to type a word you have not been taught |
| **Review** | spaced repetition (SM-2). Recall first, with a 3-step hint ladder and a *Not sure* button. `#/review?mode=listen` is listening-only |
| **Words** | all 3021 words + 618 phrases, searchable by tier, part of speech and topic, with gender chips and audio |
| **Sounds** | "How Mexicans really say it": 18 connected-speech rules (*lo que es* → "lo kes", *pues* → "ps", *para* → "pa'", *voy a* → "voya"…) with listening drills. Audio goes natural → careful → slow |
| **Grammar** | 32 units (gender o/a, ser/estar, ir a, gustar, por/para, past tenses…), 561 drills, plus verb-form drills |
| **Speak** | 80 real situations (taquería, OXXO, hotel, taxi, Día de Muertos…). Hear the local, type your reply |
| **Read** | 25 public-domain stories retold, one sentence at a time. Say what it means, reveal the English, the big idea and glosses. **Not graded**, you just mark got it / partly / missed |
| **Chat** (Charla) | talk with Penguin in Spanish only, on 10 chosen topics at 3 levels, with gentle corrections and tap-a-word help. See *Chat and Say it* below |
| **💭 Say it** | think out loud: type or speak one sentence in English (or rough Spanish) and get it in Mexican Spanish, piece by piece in Spanish word order, with a tip. Try-first mode lets you attempt it before the reveal; save results to *My phrases* and they join your reviews |
| **Story** | 17 famous short stories. Write them in Spanish beat by beat, then compare with a model version |
| **Progress** | a chess-style rating (100 = first words, ~2000 = really speaks Spanish, natives ≈ 2300–2600) with six sub-ratings: vocabulary, listening, production, grammar, reading, conversation. Daily history, forecast, badges and a check-up test. Design: [docs/RATING.md](docs/RATING.md) |
| **About** | the research behind it ([docs/RESEARCH.md](docs/RESEARCH.md)) |

### Grading: meaning first

Typed Spanish is graded on whether you **remembered it**, not on perfection:

- Missing accents/ñ, punctuation, capitals → correct, with a soft note.
- Small typos → correct, typo shown.
- Right word, wrong form (*el casa*, *bonito* for *bonita*, *hablas* for *habla*, *tres taco*, *yo gusto*, *soy 30
  años*, *es en el centro*, *voy comer*) → still counts as remembered; Penguin explains the rule.
- Missing or wrong words → marked; the answer is "close" or "missed" by how much was recalled.

## Chat and Say it (local model)

Both use **Qwen3-4B-Instruct** (Apache-2.0) run by llama.cpp on your own computer. Set it up once with
`py -3.13 scripts/setup_chat_model.py` (downloads into `models/`, which is not in the repo). If `ANTHROPIC_API_KEY`
is set, Claude is used instead and is noticeably better.

Know the limits of the small model ([docs/CHAT_EVAL.md](docs/CHAT_EVAL.md), 186 judged turns): its Spanish is
Mexican and well-formed, and it is fine for conversation practice at levels 1–2. It can get **facts about Mexico
wrong** and its grammar explanations are not always right, so treat it as a talking partner, not a reference.
Details and settings: [docs/CHAT.md](docs/CHAT.md).

## Layout

```
content/          the course content (JSON, source of truth): vocab_nouns/verbs/other, chunks, sounds,
                  grammar, prompts, stories, readings, about, chat_topics, starter_path
scripts/build_course.py   validates content/ and writes web/data/course.js (lessons, units)
server/app.py     FastAPI: serves web/, /api/state (SQLite data/progress.db), /api/health, /api/coach
server/chat.py    /api/chat and /api/translate (local model via llama-server, or Claude)
web/              the app: index.html, js/ (grader, store/SRS, speech, lesson, practice, reading, chat, say,
                  rating, progress, pages),
                  css/theme.css (design system), js/penguin.js (Penguin), styleguide.html
tests/            run_grader_tests.py and run_rating_tests.py (headless Edge), test_chat.py
docs/             CONTRACT.md (schemas + interfaces), DESIGN.md (palette, Penguin), RESEARCH.md, REVIEW.md,
                  RATING.md, CHAT.md, CHAT_EVAL.md
```

After editing anything in `content/`, run `py -3.13 scripts/build_course.py` (start.bat does it for you), then
`py -3.13 tests/run_grader_tests.py`, `py -3.13 tests/run_rating_tests.py` and
`.venv\Scripts\python.exe tests\test_chat.py`.
