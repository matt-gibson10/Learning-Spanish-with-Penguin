# Learning Spanish with Penguin 🐧🇲🇽

A click-through Spanish course for the Mexico trip (from **Oct 30, 2026**): the ~3000 most frequent Spanish words,
~590 everyday word sequences, how Mexicans *actually* say them in fast speech, grammar, responding to real
situations, writing goal stories and reading stories, with feedback from Penguin (he wears a sombrero).

Runs on your own computer: **Python/FastAPI + plain HTML/JS + SQLite**, the same setup as ChessPrep. No account; the
only optional network use is the AI writing coach.

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
| **Home** | trip countdown, today's numbers, one big Continue button |
| **Course** | 33 units / 328 lessons. Units 1–2 are a trip pack (survival phrases, ordering, getting around, a Día de Muertos lesson), then frequency order. Every lesson: learn → practise → build sentences, plus grammar, sound rules, prompts, stories and readings as they unlock |
| **Review** | spaced repetition (SM-2). Main card: hear it → recall the meaning. Typing mostly for survival items |
| **Words** | all 3022 words + 586 phrases, searchable by tier, part of speech and topic, with gender chips and audio |
| **Sounds** | "How Mexicans really say it": 18 connected-speech rules (*lo que es* → "lo kes", *pues* → "ps", *para* → "pa'", *voy a* → "voya"…) with listening drills |
| **Grammar** | 32 units (gender o/a, ser/estar, ir a, gustar, por/para, past tenses…), 561 drills |
| **Speak** | 80 real situations (taquería, OXXO, hotel, taxi, Día de Muertos…). Hear the local, type your reply |
| **Story** | 16 goal stories. Write them in Spanish beat by beat, then compare with a model story |
| **Read** | 24 stories, one sentence at a time. Say what it means, reveal the English, the big idea and glosses. **Not graded**, you just mark got it / partly / missed |
| **About** | the research behind it ([docs/RESEARCH.md](docs/RESEARCH.md)) |

### Grading: meaning first

Typed Spanish is graded on whether you **remembered it**, not on perfection:

- Missing accents/ñ, punctuation, capitals → correct, with a soft note.
- Small typos → correct, typo shown.
- Right word, wrong form (*el casa*, *bonito* for *bonita*, *hablas* for *habla*, *tres taco*, *yo gusto*, *soy 30
  años*, *es en el centro*, *voy comer*) → still counts as remembered; Penguin explains the rule.
- Missing or wrong words → marked; the answer is "close" or "missed" by how much was recalled.

## Layout

```
content/          the course content (JSON, source of truth): vocab_nouns/verbs/other, chunks, sounds,
                  grammar, prompts, stories, readings, about
scripts/build_course.py   validates content/ and writes web/data/course.js (lessons, units)
server/app.py     FastAPI: serves web/, /api/state (SQLite data/progress.db), /api/health, /api/coach
web/              the app: index.html, js/ (grader, store/SRS, speech, lesson, practice, reading, pages),
                  css/theme.css (design system), js/penguin.js (Penguin), styleguide.html
tests/            grader tests: py -3.13 tests/run_grader_tests.py (headless Edge)
docs/             CONTRACT.md (schemas + interfaces), DESIGN.md (palette, Penguin), RESEARCH.md
```

After editing anything in `content/`, run `py -3.13 scripts/build_course.py` (start.bat does it for you), then
`py -3.13 tests/run_grader_tests.py`.
