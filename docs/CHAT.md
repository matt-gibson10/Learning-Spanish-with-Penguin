# Charla con Penguin: the Spanish-only conversation partner

Pick a topic (la playa, comida de playa, la vida en general, …) and chat with Penguin, a friendly Mexican penguin
with a sombrero, **only in Spanish**. Penguin keeps to the topic, answers at your level, ends every reply with a
question, gently fixes real mistakes in your last message, and offers 2–3 things you could say next. It runs on a
small open-source model **on this laptop, offline**. Claude can be used instead if an API key is set.

> **Penguin's Spanish is usually right but not perfect, and he can get facts about Mexico wrong.** It is a
> 4-billion-parameter model. Expect an occasional slip (about 1 in 20 replies in testing, e.g. *"¡El tacos de
> pescado son deliciosos!"*), now and then a loose English translation, and invented details about places,
> dishes and prices that are not on the topic's fact sheet. See docs/CHAT_EVAL.md for the full evaluation and
> "Fixes from the evaluation" below for what changed. Use the Claude backend for anything you must trust.

## Setup (once, ~2.5 GB download)

```bat
.venv\Scripts\python.exe scripts\setup_chat_model.py
```

The script is idempotent and safe to run again. It:

1. installs **llama-server** from the official llama.cpp release `b11905` (Windows x64 CPU build, ~24 MB, SHA-256
   checked) into `models\llama.cpp\`;
2. installs **llama-cpp-python** 0.3.36 (prebuilt CPU wheel, from `requirements-chat.txt`) into `.venv` as the
   fallback engine;
3. downloads **Qwen3-4B-Instruct-2507 Q4_K_M** (2.50 GB) from Hugging Face into `models\` with a progress bar,
   resume support, and a size + SHA-256 check;
4. loads the model once and asks it to say hello.

Then restart `start.bat`. `start.bat` does **not** depend on any of this: without a model the app works as before
and the Chat page shows the setup instructions (from the API's `setup` field). `models/` is git-ignored.

Options: `--list` (known models), `--model qwen2.5-1.5b|gemma3-4b|qwen3-4b`, `--engine server|python` (install
only one runtime), `--no-test`.

## How it works

```
web/js/chat.js ──POST /api/chat──▶ server/chat.py ──┬─ slot 0: the reply  (persona + topic + level rules)
                                                    │     → {reply_es, reply_en, suggestions}
                                                    └─ slot 1: the check  (a focused "Spanish teacher" prompt)
                                                          → {fixed, why_en}  → server decides → correction
```

* **Two requests at once.** Every learner message produces a *reply* request and a *check* request on the same
  model. They run in parallel: llama-server decodes both slots in one batch, so the check costs almost no extra
  time. Splitting them was the biggest quality win. When one prompt had to reply *and* correct, Qwen3-4B caught 1
  of 6 test mistakes. The dedicated check (temperature 0) catches 6/6, and in testing raised no false alarm on
  correct sentences.
* **The check rewrites, the server judges.** The check first lists the mistakes (`mistakes`: "es -> son"), then
  returns the learner's sentence with exactly those fixed (`fixed`), then one line why (`why_en`). If it named a
  mistake but copied the sentence unchanged, a second pass is asked to apply it. `make_correction` turns that into
  a `correction` only if the change is real: it ignores accents, ¿¡, punctuation, case and subject pronouns;
  rejects total rewrites, word swaps (*aguachile* → *aguacate*, *rentar* → *alquilar*) and fixes that delete a
  word (*oy ase mucho calor* → *oyen mucho calor*); never removes a Mexican word (*ahorita, carro, celular, jugo,
  camión, platicar, rentar, órale…*); drops anything with a Spain/voseo form or a `why_en` that says "correct".
  New words may be inflections (*jugué → jugaba*, *mucho → muchas*) or false-friend fixes (*embarazado →
  avergonzado*). **`why_en` is only shown when the rule it names is visible in the change** (plural/singular,
  ser/estar, gustar, tense, por/para, muy/mucho, personal *a*, tener/hacer; a gender claim needs the course
  lexicon to agree; every quoted word must be in the sentence). Otherwise it is replaced by an always-true line
  built from the diff: *"Small fix: es → son; bonito → bonitas."* or *"la → el: mar is masculine."* (lexicon
  confirmed). English messages and help requests (*no entiendo*, *¿cómo se dice…?*) are never "corrected".
* **Constrained JSON.** Both requests use JSON-schema constrained decoding (llama.cpp grammar), so the output is
  always valid JSON of the right shape (24/24 in every benchmark run). Strings are length-capped and may not start
  with a space, which once caused a run-away string. The server still validates: if JSON fails or `reply_es` is
  not clean Spanish, it retries once at a lower temperature, then falls back to a plain-text reply with
  `reply_en: ""` and `correction: null`.
* **Spanish-only guard.** `reply_es` is checked for English words and for stray non-Latin tokens (small models
  sometimes leak e.g. a Chinese or Thai character); either triggers the retry. Stray look-alike characters in
  `reply_en` are repaired.
* **Prompt.** Built from the topic's `persona_es`, `scenario_en`, `subtopics`, `vocab`, **`facts_es`** (a short
  sheet of checked, true facts per topic: "TRUE FACTS … never contradict them; if not sure, do not state it") and
  `about_es` (for "Prefiero hablar de la playa."), plus the level rules (1: present tense only, no *te gustaría*,
  1–2 sentences ≤ 10 words; 2: + *ir a*, *gustar*, simple past; 3: natural but clear). Rules: Mexican Spanish only
  (no vosotros, no voseo, Mexican words listed), react then one new question, never repeat a question, remember
  what the learner said, single quotes only, refuse off-topic kindly and always end with a question, "Aquí
  hablamos español" for jailbreaks, common slips to avoid, help requests first, faithful `reply_en` (with notes:
  camión = bus, limón = lime…), suggestions that answer the question just asked. No literal example suggestions
  (the old "Sí, me gusta mucho." was copied into a third of all sets).
* **The reminder** after the learner's last message is chosen by `detect_intent()`: *no entiendo / más despacio /
  ¿mande?* → say the last message again, simpler, no new question; *¿cómo se dice X?* → "X se dice '…'" + a
  question with the word; *¿qué significa X?* → one simple sentence; *¿y tú?* → answer about Penguin first;
  *¿te acuerdas…?* → the learner's earlier messages are quoted so the model can answer from them. Otherwise it
  lists the questions Penguin already asked ("do not ask these again") and an unused subtopic.
* **Server checks, one retry** (`reply_problems`): English in `reply_es`, a repeated question
  (`repeated_question`, ~85% the same words), a Spain/voseo form (`banned_forms`: vosotros, -áis/-éis, vos forms
  such as *tenés, jugás, llamás* found by a generic stressed -ás/-és/-ís test with a whitelist, coche, piscina,
  zumo, vale!…), a level-1 conditional/future (*¿Te gustaría…?*, *visitarás*), a sentence over 12/16 words at
  level 1/2, a `reply_en` that is still Spanish, no question at all. The retry gets the problems as a note; the
  attempt with fewer problems wins. A reply without a question gets the topic opener's question appended.
  Suggestions with a banned form, English, a hyphen, a non-Spanish word or a cut-off end are dropped;
  "me gusta" becomes "me gustan" after "¿Te gustan…?".
* **History**: the last 40 turns (was 12), trimmed 10 at a time so the cached prompt prefix survives.
* **Engines.** `server` (default when installed) runs `models\llama.cpp\llama-server.exe` as a hidden child
  process on a free localhost port. It sits in a Windows job object, so it dies with the app even on a crash or
  hard kill (tested). `python` runs llama-cpp-python in-process (one context per slot, the weights are shared via
  mmap). It is about 30% slower, because grammar sampling is slower and the two requests run one after the other.
  Pick with `CHAT_ENGINE=server|python`.
* **Lazy and warm.** The model loads on the first chat request (~3 s) and stays in memory (~4 GB RAM).
  Reading a topic's instructions the first time costs ~10 s on this CPU; after that only the new turn is read
  (prompt cache). `GET /api/chat/status?warm=1&topic_id=ch_playa&level=1` does both in the background. The page
  should call it when a topic is opened, so the first reply is as fast as the rest.

## API (contract: docs/CONTRACT.md, "Conversation API")

`GET /api/chat/status[?warm=1&topic_id=…&level=…]`

```json
{"available": true, "backend": "local", "model": "Qwen3-4B-Instruct-2507 (Q4_K_M)",
 "note": "Small open-source model running on this computer; works offline. Loaded and ready.",
 "backends": ["local"], "loaded": true, "loading": false, "engine": "server", "claude_model": null,
 "disclaimer": "Penguin's Spanish is usually right but not perfect. Penguin can get facts about Mexico wrong (places, dishes, prices) — he's a small AI model, so check before you plan your trip.",
 "setup": null}
```

`backends` lists only the usable ones (`"local"` if a model and an engine are installed, `"claude"` if
`ANTHROPIC_API_KEY` is set). `backend` is the default (local first). `setup` holds install instructions when no local
model is installed.

`POST /api/chat` `{"topic_id": "ch_playa", "level": 1, "history": [{"role": "bot"|"user", "text": "…"}], "backend": "local"|"claude"|null}`

```json
{"reply_es": "Sí, el mar de Puerto Escondido es muy bonito. ¿Te gusta ver las olas?",
 "reply_en": "Yes, the sea in Puerto Escondido is very beautiful. Do you like seeing the waves?",
 "correction": {"original": "la mar es bonito", "fixed": "el mar es bonito",
                "why_en": "Mar is masculine, so use 'el' and 'bonito' agrees with masculine noun."},
 "suggestions": ["Sí, me gusta ver olas.", "Prefiero el mar.", "Me gusta mucho el sol."],
 "backend": "local", "ms": 6888}
```

Errors: `404 {"error": "Unknown topic 'x'.", "setup": ""}`; `503 {"error": "…", "setup": "…"}` when the chosen
backend is not installed or not configured, the model fails to load, or Claude is unreachable; `422` (FastAPI)
for a malformed body (e.g. `level` outside 1–3). History may be empty (Penguin then opens the chat) and may start
with the bot's opener.

**Latency on this laptop** (i7-13620H, CPU only; measured end to end through the API):

| situation | typical |
|---|---|
| steady state, level 1–2 | **5–9 s** per reply (median 8.3 s over 24 benchmark turns) |
| level 3 (longer replies) | 9–12 s |
| first message of a topic, not pre-warmed | 14–19 s (instructions are read once) |
| very first message after app start | + ~3 s to load the model |
| a retry (rare: bad JSON or English in `reply_es`) | + 5–8 s |

Show a typing indicator, and use a client timeout of at least 120 s.

## Model choice: the benchmark

All candidates were run on the same 24 scripted learner turns: 3 conversations × 8 turns (la playa L1, comida de
playa L1, la vida L2). The turns include English messages, off-topic questions ("What's the capital of France?",
"Can you help me with my python code?", "Who will win the election?"), 6 grammar mistakes (*yo gusto la playa
mucho*, *la mar es bonito*, *me gusta los tacos*, *una agua de coco*, *el ceviche es muy rica*, *ayer yo voy al
parque*) and 12 correct sentences. All used Q4_K_M GGUF, constrained JSON, and the same first-version prompt (one
request doing reply + correction) on llama-cpp-python. Hardware ceiling, measured with `llama-bench`: Qwen3-4B
reads prompts at ~83 tok/s and writes at ~17.8 tok/s on this CPU. The Intel Arc/UHD via Vulkan was slower
(8 tok/s), so CPU it is.

| Model | Licence | GGUF size | s/reply mean (median) | JSON valid | Mistakes corrected | Off-topic refused | Quality notes |
|---|---|---|---|---|---|---|---|
| Qwen2.5-1.5B-Instruct | Apache-2.0 | 1.12 GB | 7.1 (7.1) | 24/24 | 0/6 | 0/3 | Fast but weak: repeats the same reply 3–4×, nonsense ("¿Tienes maqueta de barco?"), offered to help with the Python code, *una agua*, suggestions are questions instead of answers. |
| **Qwen3-4B-Instruct-2507** | **Apache-2.0** | 2.50 GB | 12.1 (10.8) | 24/24 | 1/6 | 2/3 | Correct, short, simple Mexican Spanish, on topic, stays in Spanish for English input. Slips: *yo también soy un poco cansado*, an odd *¡Felicitaciones!* |
| Gemma-3-4B-it | Gemma Terms of Use | 2.49 GB | 16.7 (15.6) | 24/24 | 0/6 (recasts only) | 2/3 | Warm, but verbose (4–5 sentences at level 2), slowest, more slips: *yo también me gusta cocinar*, *¡Una agua de coco es muy rica!*, *¿Entiendo?* |

Not downloaded (limit of three): Qwen2.5-3B (Qwen *Research* licence, no commercial use), Llama-3.2-3B (Llama
community licence), Phi-3.5/4-mini (MIT; not tested, reported weaker in Spanish), Salamandra-2b-instruct (Apache-2.0, weak
instruction following), SmolLM (English-centric).

**Chosen: Qwen3-4B-Instruct-2507 (Q4_K_M, `lmstudio-community/Qwen3-4B-Instruct-2507-GGUF`).** It had the best
Spanish and the best topic discipline, and it is **Apache-2.0**: commercial use is fine with attribution, which
matters if the app is sold. Gemma's terms are more restrictive and its quality was not better. The 1.5B is not good
enough to teach with.

**After tuning (final configuration, same 24 turns):** split reply/check, llama-server engine, warm-up.

| | before (single prompt, llama-cpp-python) | **final** |
|---|---|---|
| mean / median s per reply | 12.1 / 10.8 | **8.9 / 8.3** (steady state 6–9 s; first topic turn 14–15 s) |
| mistakes corrected | 1/6 | **6/6** (plus *simpático → simpática* at level 3) |
| false corrections on 18 correct/English turns | 0 | **0** |
| off-topic refused and steered back | 2/3 | **3/3** |
| valid JSON / retries | 24/24 / – | **24/24 / 0** |

Things that did *not* help, so nobody tries them again: short JSON keys (`es`, `en`, `fix`) made replies much
worse (echoing the learner, English leaking in). Hinting "start with *En español: …*" for English input made the
model echo every message. ngram speculative decoding gave no speed-up. Making the main prompt also correct was
unreliable.

The target was < 6 s per reply; this CPU gets 5–9 s with a model that is good enough. A 1.5B model would hit
~4–5 s, but its Spanish is not good enough to learn from.

## Sample transcripts (real output, final configuration, level 1)

**La playa**: English, an error, off-topic, another error

> **Penguin:** ¡Hola! Yo vivo en Puerto Escondido. ¿Te gusta la playa?
> **You:** Hola! Sí, me gusta mucho la playa.
> **Penguin:** En Puerto Escondido, el mar es muy bonito. ¿Te gustaría surfear allí?
> *(In Puerto Escondido, the sea is very beautiful. Would you like to surf there?)* · 18.7 s (cold start)
> **You:** yo gusto la playa mucho
> ✏️ *yo gusto la playa mucho* → **me gusta la playa mucho**: With gustar, say 'me gusta' (it pleases me).
> **Penguin:** En Sayulita también hay mucha arena. ¿Te gusta nadar en la playa?
> *(In Sayulita there is also lots of sand. Do you like swimming at the beach?)* · 7.1 s
> **You:** I want to learn to surf. Is it difficult?
> **Penguin:** El surf es fácil si practicas. ¿Quieres ir a Puerto Escondido?
> *(Surf is easy if you practice. Do you want to go to Puerto Escondido?)* · 5.2 s
> **You:** la mar es bonito
> ✏️ *la mar es bonito* → **el mar es bonito**: Mar is masculine, so use 'el' and 'bonito' agrees with masculine noun.
> **Penguin:** Sí, el mar de Puerto Escondido es muy bonito. ¿Te gusta ver las olas?
> *(Yes, the sea in Puerto Escondido is very beautiful. Do you like seeing the waves?)* · 6.9 s
> **You:** what's the capital of France?
> **Penguin:** Prefiero hablar de la playa. ¿Te gustaría ir a Tulum para ver el atardecer?
> *(I prefer to talk about the beach. Would you like to go to Tulum to see the sunset?)* · 7.6 s
> **You:** Quiero ver las tortugas en Mazunte.
> **Penguin:** ¡Sí! Las tortugas están en Mazunte. ¿Te gusta verlas cerca de la playa?
> *(Yes! The turtles are in Mazunte. Do you like seeing them near the beach?)* · 8.2 s
> Suggestions offered: *Sí, me gusta verlas.* · *Prefiero verlas en la arena.* · *Me encanta el mar con tortugas.*

**Comida de playa**: gustar with a plural, off-topic, adjective agreement

> **Penguin:** ¡Qué calor! ¿Tienes hambre? Aquí hay mariscos muy ricos.
> **You:** Sí! Tengo mucha hambre.
> **Penguin:** ¡Qué bueno! Como ceviche y aguachile. ¿Te gusta el chile picante?
> *(Great! I love ceviche and aguachile. Do you like spicy chili?)* · 13.4 s (first turn of the topic)
> **You:** Me gusta los tacos de pescado
> ✏️ → **Me gustan los tacos de pescado**: Tacos is plural, so it's 'me gustan'.
> **Penguin:** ¡Sí! Los tacos de pescado son ricos. ¿Te gustan los tacos de camarón también?
> *(Yes! Fish tacos are delicious. Do you like shrimp tacos too?)* · 8.0 s
> **You:** Can you help me with my python code?
> **Penguin:** Prefiero hablar de comida de playa. ¿Te gusta el ceviche?
> *(I prefer to talk about beach food. Do you like ceviche?)* · 6.5 s
> **You:** El ceviche es muy rica
> ✏️ → **El ceviche es muy rico**: Ceviche is masculine, so the adjective 'rico' agrees with it.
> **Penguin:** ¡El ceviche es rico! ¿Te gustan los cocos también?
> *(The ceviche is delicious! Do you like coconuts too?)* · 6.6 s

(Note the slip "Como ceviche" → "I love ceviche": the translation is a little loose. That is the kind of
imperfection to expect.)

## Fixes from the evaluation (docs/CHAT_EVAL.md)

The evaluation (186 judged turns) found: 55% of direct questions about Mexico answered wrongly, repeated
questions in 22% of turns, "no entiendo" ignored, everything older than 6 exchanges forgotten, 29% of correction
reasons false and 15% of shown corrections wrong (*ahorita → ahora*), two voseo forms, level-1 *¿te gustaría?*.
What was implemented (R-numbers are the evaluation's):

| | what | where |
|---|---|---|
| R1 | `facts_es` per topic (50 short, checked facts; fewer and certain: no prices, no exact heights) + `about_es`, the content fixes of §9 (*e ir*, *futbol/beisbol*, *las luchas*, places with their states, no mountains in Yucatán, more weekend variety, Penguin already lives in Mexico), *El Santo* has a silver mask | `content/chat_topics.json`, `build_system` |
| R2 | `detect_intent`: no entiendo / más despacio / ¿mande?, ¿cómo se dice X?, ¿qué significa X?, ¿y tú?, ¿te acuerdas…? → a specific reminder; no grammar check on help requests | `detect_intent`, `reminder`, `build_check` |
| R3 | questions already asked + an unused subtopic in the reminder; retry on a repeated question, and on a third question in a row with the same opening (*¿Te gustaría saber…* ×7) | `repeated_question`, `same_question_stem`, `reply_problems` |
| R4 | 40 turns of history, trimmed 10 at a time; the memory intent quotes what the learner said about himself | `_window`, `reminder` |
| R5 | `banned_forms`: vosotros, -áis/-éis, voseo (list + generic stressed -ás/-és/-ís test), Spain words, Portuguese/Italian → retry the reply, drop the suggestion, drop the correction; Mexican words are protected in corrections | `banned_forms`, `PROTECTED_MX` |
| R6 | **filter v2** (the v2 "mistakes first" check prompt was built and A/B tested, and lost — see below — so the evaluated check prompt stays; the second pass for a named-but-unapplied mistake only runs if a `mistakes` field is ever returned); filter v2 (keeps all 60 ideal fixes of the evaluation's error sentences, rejects word swaps, deletions, person changes, fixes that break gender agreement by the lexicon, *es los…*); `why_en` kept only when verifiable, else a neutral line from the diff | `CHECK_SYSTEM`, `check_local`, `make_correction`, `_why_claims_ok`, `neutral_why`, `breaks_agreement` |
| R7 | the new reply prompt (+ sympathy, natural reactions, translation notes) | `build_system` |
| R8 | level-1 check (conditional, future, perfect; sentence length per level) → retry; then *te gustaría → quieres* swapped on the server | `level_problems`, `present_tense_l1` |
| R9 | suggestion filter (banned forms, English, hyphens, k/w/th/sh words, -ity/-tion words, cut-offs), *me gusta → me gustan* after *¿Te gustan…?*, final period | `suggestion_ok`, `fix_suggestion` |
| R10 | `reply_en` must be English (no ¿¡ñ, no *se dice*, ≤ 1/3 Spanish words) and complete; *Claro.* → *Sure.* | `reply_en_ok`, `fix_reactions` |
| R11 | off-topic: always end with a question (the opener's, or *¿Qué más te gusta de …?*) | `chat_local` |
| R12 | single quotes only in prompts and reminders; JSON strings must end with . ! ? (a quote-fused token used to cut words: *cempasúch*) | `REPLY_SCHEMA`, `reminder` |
| R14 | default `CHAT_THREADS` 6 (no priority change) | `_threads` |
| R15 | the evaluation's 60 scripted errors as a model-free regression test of the filter; the live script is kept outside the default test run | `tests/fixtures/chat_errors.json`, `tests/test_chat.py` |
| — | *¡Felicidades!* only for real news; the disclaimer says Penguin can get facts wrong | `fix_reactions`, `DISCLAIMER` |

Skipped: R13 (sampling change, untested, so left as it was).

**Before / after** (before = the evaluation's judged numbers; after = a targeted live run of 59 turns on the same
model and machine, judged the same way: 11 fact questions, 5 help requests, 12 correction probes, 3 voseo/vosotros
baits, and the evaluation's two 14-turn conversations c01 (playa L1) and c10 (deportes L3)). The live run used
the code as it was then; the fixes added after it (marked ‡) are covered by unit tests on the exact failing
outputs, not by a second live run.

| | before (evaluation) | after (live run) |
|---|---|---|
| direct fact questions answered truly | 14 of 31 (45%) | **12 of 14 (86%)**; the 2 misses were not on a fact sheet (*El Santo's* "red and white" mask ‡ now on the sheet; "the best Mexico player") |
| "no entiendo" / "más despacio" handled | 0 of 3 | **2 of 3** (the third rephrased but changed the question) |
| "¿cómo se dice X?" good | 1 of 5 | **2 of 3** (one came back as just *towel* ‡: quotes removed from the reminder, a 1-word reply now retries) |
| "¿qué significa X?" good | 5 of 6 | **2 of 2** |
| memory after many exchanges | 0 of 3 | **1 of 2** (name + country right; the team said 9 turns earlier forgotten ‡: the memory reminder now quotes personal messages first) |
| repeated question (same question again; automatic count on c01 + c10) | 4 of 28 (14%) | **1 of 28 (4%)**; but c10 opened 7 questions with *¿Te gustaría saber…* ‡ (now retried) |
| voseo / vosotros / Spain words in replies and suggestions | 3 of 186 | **0 of 59** (incl. the *los sabado* and *¿cómo te llamas?* baits) |
| level 1 conditional / future | 13 of 67 (19%) | **2 of 29 (7%)** ‡ the remaining *te gustaría* is now swapped to *quieres* |
| corrections shown that are wrong or harmful | 8 of 52 (15%) | 3 of 13 live (*mucha → mucho sed*, *son → es los Canucks*, *vosotros vais → yo voy*) ‡ all 3 now rejected by the filter → **0 of 10** |
| correction reasons (`why_en`) false | 13 of 45 (29%) | 1 of 13 live (*jugaba* called "past simple") ‡ now replaced by a neutral line → **0 of 10** |
| *ahorita* "corrected" to *ahora* | yes | **no** (protected word) |
| errors caught (recall) | 45 of 61 (74%) | 9 of 16 (56%) live with the v2 check prompt; **12 of 14** with the kept prompt + new filter (A/B below) |
| off-topic refused | 4 of 5 | **2 of 2** (*2+2*, *World Cup in English*), but without a question ‡ (now appended) |
| latency (busy machine, not representative) | median 24.6 s (8 threads, raised priority) | median 89 s (6 threads, normal priority, 100% CPU from other jobs) |

**Recall is the open problem.** In the conversations the check missed *la agua es muy frío*, *Voy nadar
mañana*, *espero que mi equipo gana* and *me gusta las calaveras*; replayed directly, the model returned
*"frío -> frío"* for the first, and for *la playa es en Oaxaca* it also "corrected" the place (*Oaxaca →
Sayulita*, rejected by the filter). The check is unstable at temperature 0 (the evaluation saw this too: the
calaveras case is caught on some runs and not others). See the A/B below.

**A/B of the check prompt** (same model, temperature 0, same new filter; 14 beginner errors taken from the live
misses and the evaluation, plus 6 correct sentences with Mexican words and traps):

| check prompt | errors fixed right | false alarms shown |
|---|---|---|
| **evaluated prompt (fixed → why_en): kept** | **12 / 14** | **0 / 6** |
| R6 v2 "mistakes first" prompt | 9 / 14 | 1 / 6 (*el agua → el aguas*) |
| R6 v2 without the "Penguin asked" context | 9 / 14 | 0 / 6 |

The v2 prompt often wrote *"frío -> frío"* or *"none"* and left the error; its long rule list seems to distract the
4B model. So `CHECK_SYSTEM` is the evaluated prompt again, and the gains come from the filter: on this sample it
blocked *rentar → alquilar* and *son → es los Canucks*. The live 9-of-16 recall was measured with the v2 prompt;
the kept prompt was not re-run live (CPU limit), only on this sample.

## Think out loud / translate

The owner's request: *"a way for me to think out loud then it gets translated word by word for me"*. The `#/say`
page sends what he says or types, **one sentence per request**, to `POST /api/translate` (contract:
docs/CONTRACT.md, "Think out loud"). Input may be English, attempted Spanish or a mix (*"quiero ir to the beach
mañana"*), including speech-recognition fillers (*"um so like…"*).

```
POST /api/translate {"text": "I'm hungry, is there a taco place around here?", "backend": "local"|"claude"|null}
→ {"input_lang": "en", "en": "I'm hungry. Is there a taco place around here?",
   "es": "Tengo hambre. ¿Hay una taquería por aquí?",
   "pieces": [{"es": "Tengo hambre.", "en": "I'm hungry"}, {"es": "¿Hay", "en": "is there"},
              {"es": "una taquería", "en": "a taco place"}, {"es": "por aquí?", "en": "around here"}],
   "tip": "Spanish uses tener (to have) here: 'tengo hambre' is literally 'have hunger'.",
   "correction": null, "backend": "local", "ms": 5200}
```

Errors: `422 {"error", "setup"}` for empty text or more than 300 characters; `503 {"error", "setup"}` as for chat.
Warm-up: `GET /api/chat/status?warm=1` **without** `topic_id` loads the model and pre-reads the translate prompt
(the Chat page always passes a `topic_id`, so it warms its topic instead). There is no separate status route.

### How it works (prompt structure, for future tuning)

All of it is in `server/chat.py`, section "think out loud".

* **One model call, slot 0.** `TRANSLATE_SYSTEM` (rules: Mexican Spanish, tú vs usted, Mexican words / Spain
  words to avoid, an idiom list, how to cut pieces) + `TRANSLATE_EXAMPLES` (8 few-shot pairs sent as earlier
  user/assistant turns: English, fillers, formal *usted*, a Spanish attempt with errors, mixed, gustar/extrañar,
  tener + feeling, a two-word phrase) + the sentence. The system prompt and examples never change, so they sit
  in llama-server's prompt cache and only the new sentence is read (~10–30 tokens). Temperature 0.1.
* **Constrained JSON** (`TRANSLATE_SCHEMA`): `input_language` (enum), `meaning_en`, `spanish`, `pieces`.
  Descriptive keys, as in chat. **Pieces are strings `"a la playa = to the beach"`**, not objects: roughly half
  the output tokens of `{"es": …, "en": …}`, which is most of the latency on this CPU. A regex pattern forces the
  `"… = …"` shape.
* **Grammar check in parallel, slot 1.** If the input may be Spanish (`maybe_spanish`: accents/¿¡ or Spanish
  function words), the chat's own `CHECK_SYSTEM` request runs alongside; `make_correction` (unchanged filters:
  ignores accents/punctuation/pronouns, rejects rewrites and word swaps) turns it into `correction`. Only kept when
  the model says the input was Spanish (`input_lang == "es"`); a mixed sentence is not "corrected".
* **Server checks, one retry** (temperature 0.5, with a hint appended to the sentence): Spanish leaking English,
  Spain-only forms (`peninsular()`: vosotros, os, -áis/-éis verbs, coche, móvil, zumo, vale!, coger…), idioms
  translated literally (`_IDIOM_GUARDS`: *I'm hot* → must be *tengo calor*, *I'm 32* → *tengo 32 años*,
  *embarrassed* ≠ *embarazada*, *excited* ≠ *excitado*, *I miss you* → *extrañar*, *how do you say* → *se dice*),
  pieces that do not fit. The better of the two attempts wins. Safe same-gender swaps (`mexicanize`: coche→carro,
  móvil→celular, zumo→jugo, ordenador→la computadora…) are applied to whatever is left.
* **Pieces are cut from `es` itself** (`align_pieces`). The model's piece texts are matched word by word against
  the final sentence, ignoring case, accents and punctuation; the returned `es` of each piece is the exact text of
  the sentence (punctuation included), so joined they always reproduce `es`. Small slips are repaired: up to 2
  words added or left out (a left-out word must be short, ≤ 3 letters, and joins its neighbour piece) and 1-word
  spelling slips. Anything else (wrong order, missing content words, a piece without English) → `pieces: []`, and
  the page falls back to its own lexicon gloss.
* **The tip is rule-based, not model text** (`make_tip`). ~20 rules, most surprising first: false friends
  (embarazada, excitado, actualmente, librería), idioms (a cántaros, ¿cómo se dice?), tener + age/hunger/heat…,
  hacer + weather, doler, gustar/encantar (singular vs plural), *me llamo*, object pronoun before the verb, adjective
  after the noun, estar for states, tener que, ir a + infinitive, questions without "do", dropped *yo*, *no* before
  the verb. Each rule fires only if its Spanish pattern is in the final `es` (and usually its English trigger in
  `en` or the input), and quotes the words on screen, so a tip cannot be false about the sentence; `""` when no
  rule fits. The model's own tips were not trusted: "no tip is better than a wrong tip".
* **Claude backend**: one request, same system prompt plus `learner_fixed` / `why_en` / `tip` fields, the
  examples inlined, structured JSON output, effort low, server-side refusal fallback (as in chat). Its tip is used
  if non-empty, else the rule-based tip. Pieces, Mexican checks and correction filters are the same.
* Chat and translate share the one llama-server (2 slots, prompt cache saved to RAM when a slot switches
  prompts, so going back to Chat does not re-read the topic).
* Pure-function tests (no model): `.venv\Scripts\python.exe tests\test_chat.py` (pytest also works if installed).

### Results

Test set: 69 sentences a beginner traveller/engineer would think out loud (needs, feelings, past/future,
questions, 15 idioms, 5 mixed, 8 Spanish attempts with and without errors, short phrases, speech-recognition
fillers). Because the laptop was at 100% CPU from other jobs, a stratified 41 were run (all idioms, mixed and
Spanish attempts, plus 13 of the rest), then the failures and a regression sample were re-run after the fixes.
Every output was judged by hand (correct and natural Mexican Spanish; pieces; tip true and useful).

| | first run (41) | after fixes (failures + regressions re-run) | target |
|---|---|---|---|
| translation correct and natural | 34 / 41 (83%) | **40 / 41 (98%)** | ≥ 90% |
| Peninsular / voseo forms | 0 (1 *alquilar*, not wrong but not Mexican) | **0** (*alquilar* → *rentar* swap) | 0 |
| pieces valid (else `[]`) | 41 / 41 | **41 / 41** (16 / 16 in the re-run) | ≥ 85% |
| tips shown / wrong | 29 / **2** (*'está el'* on *¿Dónde está el baño?*) | 10 of 16 / **0** | 0 wrong |
| corrections on Spanish attempts | 3 of 5 errors (2 lost: model said "English") | **5 of 5**, all fixes right | |
| latency (not representative) | median 34 s, mean 44 s | median 34 s | ≤ 6–8 s |

What the fixes were (all in `server/chat.py`): idiom lines and guards for *I'm hot* (→ *tengo calor*, was *hace
calor*), *nervous* (→ *nervioso*, was *tengo miedo*), *last night* (→ *anoche*, was *ayer*), *can I have the bill*
(→ *¿Me trae la cuenta?*, was *¿Puedo tener la cuenta?*), *my phone is dead* (→ *se me acabó la pila*, was *está
muerto*), *how do you say 'spoon'* (keep the English word; it had answered *¿Cómo se dice cuchara?*); the server
decides `input_lang` itself (the model called *me gusta los tacos* English, so no correction was shown); a Spanish
attempt must keep the learner's content words (*yo soy cansado* had become *Yo tengo sueño*); *me gusta los* →
*me gustan los* fixed on the server; the estar tip no longer fires on articles or *¿dónde está…?*.

**Latency.** Not representative: every run shared the CPU with other analysis jobs at 100% load, with 6 threads at
normal priority. Short idioms took 17–33 s, longer sentences 30–60 s, the first request after a restart ~100–170 s.
A short sentence is about 40 output tokens, a long one about 100; at the ~15–18 tokens/s this model reaches on a
quiet machine (chat benchmark above) that would be roughly 3–7 s. Not measured on a quiet machine.

**Ten real outputs** (local model, final code; pieces shown as `es = en`):

| he said | `es` | `pieces` | `tip` |
|---|---|---|---|
| I'm looking for a pharmacy that's still open. | Busco una farmacia que aún esté abierta. | Busco = I'm looking for · una farmacia = a pharmacy · que aún esté abierta. = that's still open | No 'yo' needed: 'Busco' already means 'I'm looking for'. |
| Can I have the bill, please? | ¿Me trae la cuenta, por favor? | ¿Me trae = can I have · la cuenta, = the bill · por favor? = please | — |
| My phone is dead, can I charge it here? | Se me acabó la pila. ¿Puedo cargarlo aquí? | Se me acabó la pila. = my phone is dead · ¿Puedo = can I · cargarlo = charge it · aquí? = here | — |
| I'm hot. | Tengo calor. | Tengo calor. = I'm hot | Spanish uses tener (to have) here: 'tengo calor' is literally 'have heat'. |
| I'm embarrassed. | Me da pena. | Me da pena. = I'm embarrassed | Careful: 'embarazada' means pregnant. For embarrassed, Mexicans say 'me da pena'. |
| It's raining cats and dogs. | Está lloviendo a cántaros. | Está lloviendo = it's raining · a cántaros. = cats and dogs | Idioms don't translate word for word: Spanish rains 'a cántaros' (by the jugful), not cats and dogs. |
| I'm 32 years old. | Tengo 32 años. | Tengo = I have · 32 años. = 32 years old | For age Spanish uses tener: 'tengo 32 años' is literally 'have 32 years'. |
| quiero ir to the beach mañana | Quiero ir a la playa mañana. | Quiero = I want · ir = to go · a la playa = to the beach · mañana. = tomorrow | No 'yo' needed: 'Quiero' already means 'I want'. |
| yo soy cansado | Estoy cansado. (+ correction *estoy cansado*: "Use estar for how you feel") | Estoy = I am · cansado. = tired | For feelings and states Spanish uses estar, not ser: 'estoy cansado'. |
| um so I think like maybe we could go to the beach or something | Creo que tal vez podamos ir a la playa. | Creo = I think · que = that · tal vez = maybe · podamos = we could · ir = to go · a la playa. = to the beach | No 'yo' needed: 'Creo' already means 'I think'. |

### Limits

* **One failure left in the judged set:** *I don't like crowded places* → *No me gusta el lugar con mucha gente*
  ("the place with lots of people": singular, too specific). The first attempt had *No me gusta los lugares* (now
  repaired on the server) and a garbled `en` (*"I don-than crowded places"*; a garbled `en` now triggers the retry).
* 28 of the 69 sentences (mostly everyday needs, opinions and questions) were not run on the final code because
  of the CPU limit; the 41 run cover every category.
* Piece glosses are the model's and can be loose (*Tengo = I have* inside *tengo un poco de miedo*; *Ayer = last
  night* before the *anoche* guard). The Spanish of each piece is always exactly the sentence's.
* `es` is natural but sometimes not the most Mexican choice (*aún* where *todavía* is more common, *¿Puedo…?*
  where *¿Me deja…?* is more polite). The guards cover the idioms in the test set, not every idiom.
* Tips are rule-based: about 70% of sentences get one; whole areas (subjunctive, por/para, reflexives) have no rule
  yet, so those sentences get none rather than a guess.
* `input_lang` is the server's guess from word lists; an English sentence with a Spanish name may come back
  "mixed". It only matters for whether a `correction` is shown.
* Corrections in translate come from the same grammar check as chat (same filters and `why_en` rules).
* Latency on this busy laptop is 20–60 s per sentence; on a quiet machine it should be a few seconds (estimate).

## Switching models

* Any instruct-tuned GGUF works: put it in `models\` and set `CHAT_MODEL_PATH=models\your-model.gguf` before
  `start.bat`. The setup script knows three: `--model qwen2.5-1.5b` (fast, weak) and `--model gemma3-4b`. Without
  `CHAT_MODEL_PATH`, the app uses `Qwen3-4B-Instruct-2507-Q4_K_M.gguf`, or else the first `.gguf` in `models\`.
* A bigger model (e.g. Qwen3-8B or Qwen2.5-7B, both Apache-2.0) would be noticeably better but about 2× slower on
  this CPU (~15–20 s per reply).
* Tuning env vars: `CHAT_ENGINE=server|python`, `CHAT_THREADS` (generation threads, default 6 = the performance cores; 8 was
  far slower whenever the laptop was busy),
  `CHAT_THREADS_BATCH` (prompt threads, default cores−2), `CHAT_CTX` (context per slot, default 4096),
  `CHAT_LLAMA_SERVER` (path to another llama-server build, e.g. a Vulkan or CUDA one on another PC),
  `CHAT_SERVER_ARGS` (extra llama-server flags).
* The prompt and schemas are at the top of `server/chat.py`. The benchmark scripts live outside the repo; rerun a
  conversation through `POST /api/chat` to compare.

## The Claude option

If `ANTHROPIC_API_KEY` is set before `start.bat`, `"claude"` appears in `backends`, and the page can offer a
picker. Claude becomes the default only when no local model is installed. It uses the Anthropic SDK (already in
`requirements.txt`), model `claude-opus-5-5` by default (override with `CHAT_CLAUDE_MODEL`), low effort,
structured JSON output, and the server-side refusal fallback. One request does reply and correction together (the
same prompt plus `learner_fixed` / `why_en`), validated the same way. It needs internet and costs a little per
message. Its Spanish is excellent. Errors come back as 503 with a friendly `error`.

## Licences

* **Qwen3-4B-Instruct-2507**: Apache-2.0 (Alibaba Qwen team). Commercial use and redistribution are allowed;
  keep the licence notice and attribution. The GGUF conversion by lmstudio-community is under the same licence.
* **llama.cpp / llama-server**: MIT. Its Windows build bundles LLVM OpenMP (`LICENSE-LLVM-OpenMP`, Apache-2.0
  with LLVM exception), copied into `models\llama.cpp\`.
* **llama-cpp-python**: MIT.
* If the app is sold with the model bundled, ship these notices. If the app downloads the model at setup (as now),
  the user gets it straight from Hugging Face.

## Limits

* Small model: an occasional grammar slip or loose translation in Penguin's own replies. Corrections of the
  learner are conservative: they fix grammar, not style, and a mistake may now and then go unnoticed.
* Topic discipline is good but not absolute: Penguin may answer a clever off-topic question a little before
  steering back.
* Level rules are followed loosely at level 1 (sometimes 2 sentences of ~12 words).
* Memory: ~4 GB RAM while loaded. CPU: a reply keeps 8 cores busy for a few seconds.
* One learner at a time. Requests from two tabs queue behind each other.

## Troubleshooting

* *Chat page says "not set up"*: run the setup command. Check that `models\Qwen3-4B-Instruct-2507-Q4_K_M.gguf`
  and `models\llama.cpp\llama-server.exe` exist.
* *"failed to load" in the status note*: look at `models\llama.cpp\server.log`. If antivirus blocks
  `llama-server.exe`, use `set CHAT_ENGINE=python`.
* *llama-cpp-python will not install*: the wheel index in `requirements-chat.txt` serves prebuilt CPU wheels. The
  server engine does not need it.
