# Charla con Penguin: the Spanish-only conversation partner

Pick a topic (la playa, comida de playa, la vida en general, …) and chat with Penguin, a friendly Mexican penguin
with a sombrero, **only in Spanish**. Penguin keeps to the topic, answers at your level, ends every reply with a
question, gently fixes real mistakes in your last message, and offers 2–3 things you could say next. It runs on a
small open-source model **on this laptop, offline**. Claude can be used instead if an API key is set.

> **Penguin's Spanish is usually right but not perfect.** It is a 4-billion-parameter model. Expect an occasional
> slip (about 1 in 20 replies in testing, e.g. *"¡El tacos de pescado son deliciosos!"*) and once in a while an odd
> English translation. The corrections of *your* Spanish are the most reliable part (see the benchmark).

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
* **The check rewrites, the server judges.** The check returns the learner's sentence with only grammar fixed
  (copied unchanged if it is already right). `server/chat.py` turns that into a `correction` only if the change is
  real. It ignores accents, ¿¡, punctuation, case and subject pronouns, rejects total rewrites, and rejects word
  swaps (a "fix" of *aguachile* → *aguacate* is dropped; *rica → rico*, *voy → fui*, *soy → estoy* pass). English
  messages are never "corrected".
* **Constrained JSON.** Both requests use JSON-schema constrained decoding (llama.cpp grammar), so the output is
  always valid JSON of the right shape (24/24 in every benchmark run). Strings are length-capped and may not start
  with a space, which once caused a run-away string. The server still validates: if JSON fails or `reply_es` is
  not clean Spanish, it retries once at a lower temperature, then falls back to a plain-text reply with
  `reply_en: ""` and `correction: null`.
* **Spanish-only guard.** `reply_es` is checked for English words and for stray non-Latin tokens (small models
  sometimes leak e.g. a Chinese or Thai character); either triggers the retry. Stray look-alike characters in
  `reply_en` are repaired.
* **Prompt.** Built from the topic's `persona_es`, `scenario_en`, `subtopics` and `vocab` plus the level rules
  (1: present tense, 1–2 sentences ≤ 10 words, common words, one question; 2: + *ir a*, *gustar*, simple past;
  3: natural but clear). It also says: Mexican Spanish, Spanish only, stay in character, refuse off-topic questions
  kindly and steer back, reply in Spanish to English messages. History is cut to the last 12 turns.
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
 "disclaimer": "Penguin's Spanish is usually right but not perfect.", "setup": null}
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

## Switching models

* Any instruct-tuned GGUF works: put it in `models\` and set `CHAT_MODEL_PATH=models\your-model.gguf` before
  `start.bat`. The setup script knows three: `--model qwen2.5-1.5b` (fast, weak) and `--model gemma3-4b`. Without
  `CHAT_MODEL_PATH`, the app uses `Qwen3-4B-Instruct-2507-Q4_K_M.gguf`, or else the first `.gguf` in `models\`.
* A bigger model (e.g. Qwen3-8B or Qwen2.5-7B, both Apache-2.0) would be noticeably better but about 2× slower on
  this CPU (~15–20 s per reply).
* Tuning env vars: `CHAT_ENGINE=server|python`, `CHAT_THREADS` (generation threads, default 8),
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
