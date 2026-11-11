# Learning review: does the app improve understanding and word-finding?

*Reviewed 2026-11-11 by the review agent (language-acquisition + product lens). Scope: lessons u01l01–u01l03 played in
full, a Review session, grammar `g_pronunciation` (in lesson) and `g_present_ar` (Grammar page), sound rules
`s_vowel_devoicing` (in lesson) and `s_sinalefa` (Sounds page), Speak `p_order_tacos`, Read `rd_la_liebre_y_la_tortuga`,
Story `st_bella_durmiente`, Words search; code in `web/js/*.js`, `scripts/build_course.py`; the generated lesson plan.
Not reviewed: Chat, Think out loud (`say.js`), the rating tracker.*

The owner asked whether anything can "improve my understanding or trying to come up with words". Two lenses:
**comprehension** (fast Mexican speech; he understands once he knows how it is written) and **retrieval / production**
(getting the Spanish word out when he needs it).

## Verdict

The app is a polished, kind, well-written **recognition trainer** with unusually good Mexican content (586 chunks, 18
connected-speech rules, 32 grammar units, a forgiving grader). But what the learner actually *does* is mismatched with
both of his goals. For **word-finding**, production almost disappears after the lesson: in lesson 1 only 3 of 11 items
were asked English → Spanish without options (4 of 11 in an error-free run), and in Review a learner who answers everything correctly first meets
a typed "say it in Spanish" card on review #8, about seven years later, because every correct multiple-choice answer is
auto-rated *Easy* and intervals grow without a cap. For **comprehension**, listening practice is single words and short
phrases read by a text-to-speech voice, answered by four-option multiple choice whose distractors come from the whole
3,600-item corpus (so they are solvable by elimination), the Spanish text is on screen before the audio in Speak and
Read, and a correct listening answer never shows the written form, which is the one link this learner says unlocks
understanding. Verb forms (what he actually hears: *voy, tienes, fui*) are never drilled although every verb carries a
full conjugation table. The first three hours also spend time on *permitir, ganar, ofrecer, acercarse* and isolated
*el / la / de / que* while numbers arrive at lessons 20–92 and *baño, taco, cerveza, izquierda* at lessons 81–269.
Almost all of this is fixable in code in one pass, without new content; the ordering and input-volume problems need
content work.

## How it was tested

- Isolated server on port 8303 with its own data folder; the owner's `data/progress.db` and port 8300 were not touched.
- Lessons were played through a logging wrapper around `App.exercise` so every exercise (type, prompt, options,
  answer, audio text, feedback) was recorded, with 10–15% deliberate wrong answers to exercise the retry paths.
- Time was simulated by setting card due dates in the test store.
- **Audio was not heard**: the preview browser has no Spanish voice. Audio findings come from the text handed to
  `Speech.speak` and from `web/js/speech.js`. Anything that depends on how a respelling actually sounds is marked
  "verify by ear".
- Other agents were editing `web/js/` during the review (My phrases / `say.js`). Specs below name functions, not line
  numbers, and keep the new `it.cat === "mine"` guard in `reviewExercise` intact.

## Measurements

**Lesson u01l01 (11 items), as played**

| What | Count |
|---|---|
| Learn cards (English shown at once) | 11 (+ 6 refresher cards after misses) |
| Multiple choice, Spanish → English (read, then listen) | 22 + 4 retries |
| Multiple choice, English → Spanish | 11 + 3 retries |
| "Fast speech" multiple choice | 3 |
| Typed: English → Spanish | **3 of 11 items** (4 of 11 in an error-free run) |
| Typed: fill the gap (English sentence and gloss shown) | 2 |
| Typed: type the single word you hear | 2 |
| Tile sentences | 4 |

54 exercises, 43 of them multiple choice, for about 120 clicks. The run included deliberate misses on about one answer
in eight.

**Review schedule for a learner who is always right and accepts the suggested rating** (simulated on `c_por_favor`,
`v_venir`, `v_aqui`; identical for all three)

| Review | Day | Card | Next interval |
|---|---|---|---|
| 1 | 0.25 | listen → meaning (flash) | 1 d |
| 2 | 1 | listen → meaning (multiple choice, suggested *Easy*) | 6 d |
| 3 | 7 | read → meaning (flash) | 16 d |
| 4 | 23 | listen → meaning (flash) | 42 d |
| 5 | 65 | type the word you hear | 153 d |
| 6 | 218 | fill the gap | 588 d |
| 7 | 805 | listen → meaning (flash) | 1,733 d |
| 8 | 2,538 | **first "type it in Spanish"** | 6,759 d |

The first review session after three lessons was 33 cards, **all** listen → meaning.

**Where beginner essentials land in the 328-lesson plan** (lesson number)

| Item | Lesson | Item | Lesson |
|---|---|---|---|
| dos / uno / tres | 20 / 22 / 29 | cuatro, cinco, diez | 45, 54, 63 |
| seis, ocho, siete, nueve | 65, 74, 77, 92 | veinte, cien | 87, 79 |
| no | 6 | yo | 15 |
| querer | 21 | hablar, entender, necesitar | 26, 41, 46 |
| ¿cuánto? / ¿quién? / ¿cuál? | 61 / 35 / 55 | hoy, mañana, ayer | 34, 37, 61 |
| baño (word) | 81 | izquierda, derecha, cuadra | 116, 108, 245 |
| taco, cerveza, café | 269, 150, 114 | tarjeta, efectivo, boleto | 153, 267, 232 |
| caro, barato | 128, 216 | hambre, sed | 121, 237 |
| first Speak prompt | 17 | first Read story | 29 |
| present -ar grammar | 29 | preterite grammar | 111 |

Meanwhile lessons 1–14 teach *permitir* (4), *ganar* (7), *aceptar* (7), *hacia* (8), *ofrecer* (9), *económico* (10),
*valer*, *acercarse* (11), *internacional* (12), *indicar* (13), *señalar*, *desear* (14).

**Content totals that matter here**

- Readings: 25 stories, 286 sentences, **3,887 words** in total; 17 sentences have a fast-speech version.
- Transparent English cognates in the vocab (crude string match): **about 755 of 3,022**; 24 notes mention cognates or
  false friends; no cognate handling in the app.
- Verbs: 658, all with conjugation tables; forms are shown in a collapsed "Conjugation peek" and never tested.
- Circumlocution phrases: *¿Cómo se dice ___?* and *¿Qué significa ___?* (lesson 10), *O algo así* (rank 1440). Nothing
  for "it's like…", "the thing for…", "I forgot the word".
- 39 chunk/word pairs are the same text taught twice as separate cards (*Gracias* lesson 1 and *gracias* lesson 6).

## What already works

- **Learn → check in groups of four**, immediate feedback, misses return once in the same round after a refresher card.
- **"Not sure"** as a first-class answer, which discourages guessing.
- **The grader**: accent-, typo- and slip-tolerant, with specific notes (*buenos tardes* → "tardes is feminine plural →
  buenas"). This is the right philosophy for a beginner.
- **Chunk-first Mexican content**: *¿mande?, ahorita, ¿me cobra?, ¿me da ___?*, frames with slots, good usage notes.
  No Spain-only forms were found in a sweep of the content.
- **Sound rules**: the explanations are excellent (the *sinalefa* card is a model), and the "what did they say?" drills
  use real minimal sets (*¿Qué pasó? / ¿Qué piso? / ¿Qué paso?*).
- **Grammar units**: short, Mexican examples, mostly typed drills, a "why" on every answer.
- **Speak prompts** are personal (Matt, Houston, engineer) and accept several model answers.
- **Read**: one sentence at a time with a gist line, self-marking, "Read again (Spanish only)", a listen-first toggle.
- Keyboard flow (Enter, 1–4), accent bar, drafts saved, export/import, local-first sync.

## Ranked improvements

Sizes: S = under half a day, M = about a day, L = several days. "Code" items need no new content.

| # | Improvement | Lens | Kind | Size |
|---|---|---|---|---|
| 1 | Recall-first review and lesson: typed/said production with a hint ladder | production | code | M |
| 2 | Repair the scheduler: no auto-Easy, production gate, interval cap, leeches, shuffle, daily gate | both | code | M |
| 3 | Listening-first: text after audio, natural speed first, sentence dictation, whole-story playback | comprehension | code | M |
| 4 | Verb forms: drill them from the existing tables; make them searchable; fair verb gaps | both | code | M |
| 5 | Exercise-quality bundle: distractors, wrong fast audio, answer leaks, function words, scoring | both | code | M |
| 6 | Error-driven review: mistakes from grammar, sounds, Speak and Read come back, spaced and mixed | both | code | M |
| 7 | Reorder the first 20 lessons | both | content + code | M |
| 8 | Dialogue input at volume (replace fables with Mexican dialogues, 10× the words) | comprehension | content | L |
| 9 | Cognate fast-track and word-family patterns | production | code + content | M |
| 10 | Circumlocution kit: "when you can't find the word" | production | content + code | S–M |
| 11 | Guess-first learn cards and "make it yours" sentences | production | code | S |
| 12 | Speak: hints before models, retry from memory, prompts come back | production | code | S |
| 13 | Voice variety and honest audio | comprehension | code | S |
| 14 | Sound-rule order and a dialect audit of the fast-speech respellings | comprehension | content | M |
| 15 | Leech aid: the learner's own memory hook | production | code | S |

### Top 5 to build now (code only, one pass)

#### 1. Recall-first review and lesson (M)

**Problem.** Production from meaning is rare and late. In `learnFlow` (`web/js/lesson.js`) the mixed round asks
every item as English → Spanish *multiple choice*, then rotates typed formats (`typedFor`: `produce-type`, `cloze`,
`listen-type`), so one item in three is typed from English. In `reviewExercise` (`web/js/pages.js`) typed production
exists only for "survival" items at `seen % 6 === 1` and only after `Store.canProduce`; with the current intervals that
is review #8. There is no hint between "know it" and "Not sure", so a near-miss becomes a give-up.

**Why it matters.** Receptive knowledge runs ahead of productive knowledge (Webb 2008, cited in `RESEARCH.md` §4.3),
and the gap closes only by practising recall of the form. Five to seven retrievals in a session beat one to three
(Nakata 2017).
Short-answer practice with feedback beats multiple choice for later retention (Kang, McDermott & Roediger 2007).
Diminishing cues keep retrieval both effortful and successful (Finley et al. 2011; Fiechter & Benjamin 2017). For a
beginner, meaning-recall first is right (Terai et al. 2021), so keep the first check receptive; the fault is that
production never follows.

**Spec.**

1. `web/js/widgets.js`: add `App.hintLadder(answer)` returning three cues:
   - level 1: first letter of each word, the other letters as `·` (`p·· f····`); punctuation and `___` slots unchanged;
   - level 2: the first half (round up) of each word's letters;
   - level 3: `{audio: true}`: play the answer at careful speed (the item becomes a dictation).
2. `makeExercise`: new type `produce-recall`, `mode: "type"`, title "From memory: say it out loud, then type it".
   Prompt: `it.en` (nouns keep "(with el/la)"); when the item has an example, a muted line "as in: " + `it.ex_en`. No
   Spanish on screen. `answers` as in `produce-type`. Set `hints: App.hintLadder(disp)`, `hintAudio: {text: it.es,
   item: it}`, `production: true`.
3. `App.exercise`, type mode: when `ex.hints` exists, add a ghost button "Hint" in `.ex-secondary` before "Not sure".
   Each click appends the next cue to a `div.hint-line` (`aria-live="polite"`) or plays the audio; the button disables
   after the last cue. Count `hintsUsed` and copy it onto the grader result (`res.hintsUsed`) before `finish(res)`.
   On any graded `production` exercise, play the answer once at careful speed and add an audio row (careful, natural)
   to the feedback.
4. `reviewExercise` (keep the `it.cat === "mine"` guard first). Replace the direction logic:
   - `fn` = function word: `pos` in det / prep / conj / pron and `rank <= 150`.
   - first review (`(card.ok || 0) < 1`): `fn ? "cloze" : "hear"`.
   - afterwards: `dirs = fn ? ["cloze", "dictation"] : ["recall", "hear", "cloze", "recall", "dictation", "read"]`,
     `dir = dirs[(seen - 1) % dirs.length]` (after item 2 below, `seen` counts real reviews only).
   - `recall` → `produce-recall`. `cloze` without `App.clozeOf(it)` → `recall`. `dictation` → see improvement 3; when no
     sentence qualifies → `listen-natural` if the item has a valid respelling, else `listen-type`.
   - remove the `isSurvival` condition here; set `Store.PRODUCTION_AFTER = 1`.
   - call `Store.rate(id, rating, {recognition: …, production: ["recall", "cloze", "dictation", "listen"].includes(dir),
     hints: res.hintsUsed})`.
5. `learnFlow` mixed round: replace `pick` and `typed` with
   - `recall`: every item not in `struggled`, as `produce-recall` (shuffled);
   - `pick`: only the `struggled` items, as `produce-choice` (unchanged fallback);
   - `fast`: unchanged;
   - `extra`: up to three items with a fair `cloze` (see improvement 4).
   Add `"produce-recall"` to `TYPED`. A missed recall shows the refresher card and returns once at the end of the round
   as `produce-recall` again, not downgraded to multiple choice.

**Acceptance.**

- In u01l01 each of the 11 items is asked once as English → Spanish typed recall with a working three-step Hint;
  "How do you say it in Spanish?" multiple choice appears only for items missed in a quick check.
- Simulated perfect learner: review #2 is `recall`; at least three of the first six reviews are production.
- *el, la, de, que, y, a, en, los* never appear as a listen flash card or isolated recall, only in a sentence.
- "My phrases" cards behave as before.

#### 2. Repair the scheduler (M)

**Problem** (`web/js/store.js`, seen in the Review session).

- `Store.suggest` returns *Easy* for any perfect answer, including a four-option multiple choice. Screenshot case:
  "Listen — what does it mean?" → "Hello" → "Suggested: Easy (Enter)", 3 days.
- **Inversion**: `learnFlow.finish()` calls `Store.rate(id, "again", {practice: true})` for items missed in the lesson,
  which increments `seen`. Their first review is therefore the multiple-choice card (suggested *Easy*, 3 d) while items
  answered perfectly get the flash card (default *Good*, 1 d). The items he struggled with are pushed out further.
- No interval cap: 588 d → 1,733 d → 60,832 d.
- No leech handling: `lapses` is counted and never used.
- Sessions run in learn order (`dueCards` sorts by due time), so lesson order primes the answers.
- The new-items goal is cosmetic: after 33 new items in one sitting (goal 20) Continue still offered lesson 4. Words
  auto-added by Read count toward it ("42/20").

**Why it matters.** Spacing only works if the interval tracks what he can actually retrieve (Cepeda et al. 2008, in
`RESEARCH.md` §4.2). Durable learning needs several successful recalls across separate sessions (Rawson & Dunlosky
2011). Mixed practice across sessions beats blocked practice for Spanish verb forms (Pan et al. 2019), and a fixed
order lets position cue the answer. Anki's defaults are a useful sanity check: a new card graduates at 1 day, *Easy*
gives 4 days and must be chosen by the learner, leeches are flagged after repeated lapses.

**Spec.**

1. `Store.suggest(res)`:
   `unsure` / `miss` → `again`; `close`, or `res.hintsUsed >= 2`, or `res.slowUsed` → `hard`; otherwise `good`.
   Never suggest `easy`; the button stays available.
2. `Store.rate(id, rating, opts)`:
   - increment `c.seen` only when `!opts.practice`;
   - `if (q > 0 && opts.production) c.prod = (c.prod || 0) + 1`;
   - first success (`reps === 0`): hard 0.5 d, good 1 d, easy 2 d; second: hard 1.5, good 3, easy 5; later:
     `ivl × 1.2 | ef | ef × 1.15`;
   - `if (c.missedInLesson && c.reps === 0) ivl = Math.min(ivl, 1)`; then clear the flag;
   - **production gate**: `if ((c.prod || 0) < 2) ivl = Math.min(ivl, 7)`;
   - cap: `ivl = Math.min(120, ivl)`; then a deterministic ±5% spread from a hash of `id + reps` (so `Store.preview`
     still matches);
   - leech: when `c.lapses >= 4` set `c.leech = true`; clear it after three consecutive successes.
3. `learnFlow.finish()`: after the practice "again", set `Store.state.cards[id].missedInLesson = true`.
4. Review page: `queue = App.shuffle(Store.dueCards().slice(0, 40))`. When a leech comes up, first show
   `App.itemCard(it)` under "Let's relearn this one", then a `produce-recall` exercise (improvement 15 adds the memory
   hook). Add "Tricky" to the Words page `learned` filter (`c.leech`).
5. `App.continueTarget()`: when `Store.day().new >= settings.newPerDay`, do not offer the next lesson as the main
   button. Offer Review if anything is due, otherwise the 5-minute listening session (improvement 3), otherwise Speak.
   Sub-line: "Today's new-word goal is done. More new words are on the Course map if you want them." `Store.learn`
   gets `opts.countNew` (default true); `reading.js` passes `false`.

**Acceptance.**

- A correct multiple-choice answer shows "Suggested: Good".
- Simulated perfect learner: no interval above 7 d before two successful production reviews; none above 120 d ever.
- An item missed in its lesson gets a first interval of at most 1 d whatever is tapped.
- Four lapses mark a leech; the relearn card shows; three straight successes clear it.
- Two openings of the same due set give different orders.
- With goal 20 and 22 learned today, Home's main button is not "Next lesson".

#### 3. Listening-first (M)

**Problem.**

- A correct listening answer shows no Spanish text. `App.feedback` prints the answer only when the outcome is not
  `good`, so after "Listen — what does it mean?" he never sees *Hola, buenos días*. Seen on review card 1.
- Speak (`promptView` in `web/js/practice.js`) prints `prompt_es` above the audio buttons and autoplays at *careful*
  speed; the "Word help" row shows the target words before he has tried.
- Read (`web/js/reading.js`) shows the sentence first; "Listen first (hide the text)" is off by default.
- Every listening item is one word or a short chunk. "Type what you hear" asks for *sí*, *los*, *venir*.
- Careful speed (0.9) is the default everywhere; natural (1.25) is opt-in.
- Example sentences and reading sentences are never used for listening, although every item has one.

**Why it matters.** His gap is decoding: segmenting connected speech into words he already knows. Field (2003) treats
this as a perception problem to be trained directly, with dictation-type exercises; pairing the sound with its text is
what makes the mapping stick (reading-while-listening, `RESEARCH.md` §4.4). Listening before reading
forces the decoding attempt; text before audio removes it.

**Spec.**

1. **Text after audio, always.** In `App.exercise.finish`, when `ex.audio` is set and the prompt is the listen icon,
   pass `alwaysAnswer: true` so the feedback shows `display` ("Hola, buenos días — Hello, good morning"), the
   respelling when one was played ("said fast: *porfa*"), and careful + natural replay buttons. Applies to
   `listen-meaning`, `listen-natural-meaning`, `listen-choice`, `hear-flash` (already on the back) and the sound drills.
2. **Natural speed first, ramp on replay.** Listening exercises set `audio.ramp = true`: autoplay at natural speed; the
   single "Play again" button steps natural → careful → slow and shows the current speed. `res.slowUsed = true` when
   slow was used. Applies in lessons and Review for items with `reps >= 1`; brand-new items in "Quick check" keep
   careful speed.
3. **Sentence dictation from existing examples.** `App.dictationOf(it)` returns `it.ex_es` when it has 3–9 words and
   `App.unknownWords(it.ex_es, {except: new Set([it.id])}).length <= 1`. New type `dictation`: listen icon, ramped
   audio of the sentence, typed answer graded with `Grader.gradeAnswer(val, [it.ex_es])`; feedback shows the marked
   diff, `ex_en`, and word help. Used by `reviewExercise` (improvement 1) and by:
4. **"5-minute listening"** (`#/review?mode=listen`, linked from Home): ten items, alternating `dictation` and
   gist (`listen-natural-meaning` on a sentence: hear the example, pick its English among three other learned items'
   `ex_en`). Sources: learned items with a qualifying example, plus sentences of readings already finished. No effect
   on intervals except that a miss on the item's own word is logged for improvement 6.
5. **Speak**: hide `prompt_es` (reuse the reader's hidden style) behind "Show what they said"; autoplay at natural
   speed; reveal the text after Check. Move the "Word help" row into the Hints `<details>`.
6. **Read**: default `settings.listenFirst` to `true` in `fresh()` (`store.js`). Add "▶ Play the whole story" at the
   top and on the finish card: queue every sentence with `Speech.speak(text, "natural", {queue: true})`, using
   `s.natural` when present.

**Acceptance.**

- After any correct listening answer the Spanish text and its English are visible, with replay buttons.
- A Speak prompt opens with no Spanish text on screen; the text appears on demand and after Check.
- A new user's Read opens with the sentence hidden and audio playing.
- Review contains sentence dictations for items whose example is fully known; the Home link opens a ten-item
  listening session.
- Using slow replay turns the suggested rating to *Hard*.

#### 4. Verb forms: drill, search, fair gaps (M)

**Problem.**

- Verbs are learned as infinitives (*ir = to go*). The forms he hears and needs are in `conj` and are only displayed
  (`App.conjTable`, collapsed). Present -ar grammar is lesson 29, preterite lesson 111.
- Verb gaps ask for forms never taught: lesson 2 "_____ derecho dos cuadras. (follow)" expects *Siga*; *pedir*'s
  example is *¿Ya pidieron?*, *ganar*'s is *¿Quién ganó?*. 103 verb examples are preterite, 33 subjunctive.
- Words search cannot find a form: "fui" → 0 items; "quiero", "tengo", "voy" → chunks only, not the verb.

**Why it matters.** Verb forms carry who and when; a listener who knows *tener* but not *tuve* loses the sentence.
Conjugation responds to retrieval practice, and mixing tenses across sessions beats blocked practice (Pan et al. 2019,
Spanish preterite vs imperfect). Looking up what he heard is this learner's stated route to understanding.

**Spec.**

1. `App.verbForms(it)` (`widgets.js`): `[{key: "pres1s", form, tense, person}]` from `it.conj`. Reflexive lemmas get
   the pronoun (*me voy, te vas, se va, nos vamos, se van*). Unlocked forms: present yo and él/usted from the start;
   all present persons once `g_present_ar` is done; preterite once `g_preterite_regular` is done.
2. New types in `makeExercise(it, type, opts)` with `opts.formKey`:
   - `conj-hear`: listen icon, ramped audio of the form (use the example sentence when it contains that form), choices
     "yo", "tú", "él / ella / usted", "nosotros", "ellos / ustedes". Feedback: the written form, infinitive, meaning,
     and the five-form row with the target highlighted.
   - `conj-produce`: prompt "**tener** — to have" plus a chip "yo · present"; typed; accepts the form with or without
     the subject pronoun; hint ladder as in improvement 1; same feedback row.
3. Lesson: in the mixed round add one `conj-hear` for each verb (the person used in its example when that is present
   tense, otherwise yo). After `g_present_ar` is done add one `conj-produce`.
4. Review: for verb cards with `ok >= 2`, every third review is a form card. Keep `card.forms[key] = {ok, miss}`;
   choose the unlocked form with the most misses, then the fewest `ok`; `conj-hear` until that form has one success,
   then `conj-produce`. A miss on a form records `miss++` and rates the lemma at worst *Hard*.
5. Fair gaps: in the `cloze` case, when the blank is a verb form, show "(pedir · ustedes · past)" from the lexicon
   entry (prefer the entry whose `form` matches with accents; see bug 11). If the form's tense is not unlocked, do not
   build a gap; fall back to `produce-recall`.
6. Words search (`App.pages.words.apply`): for a one-word query also take `Grader.lookup(q)`; put the lemma items first
   with a tag "fui = ir · yo · past" (export `PERSON_LABEL` / `TENSE_LABEL` from `grader.js` if needed). Prefer
   accent-exact matches when the query has an accent.

**Acceptance.**

- Searching *fui* lists *ir* and *ser* with the form label; *quiero* → *querer*; *siga* → *seguir*.
- Lesson 1's mixed round contains a `conj-hear` for *ir* and *llegar*.
- No gap asks for a preterite, command or subjunctive form before its grammar unit is done.
- A verb card in Review shows a form card on every third review after two successes, rotating forms.

#### 5. Exercise-quality bundle (M in total; each part S)

| Part | Problem (where seen) | Change | Acceptance |
|---|---|---|---|
| a. Distractors | `distractors()` in `widgets.js` draws from all 3,600 items: *ir* → negotiate / draw / try / go; *Por favor* → ¿Qué te pareció? / Valer la pena / Fíjate que… . Answerable by elimination, and unknown options are noise. | Pool in priority: learned items with the same pos (or chunk kind) and topic; learned items with the same pos; items from lessons within ±3; then nearest rank. For Spanish options prefer similar form (same first letter, or edit distance ≤ 3, or length within 30%); for chunks similar word count. Drop options whose English equals the answer's. | In u01l03 at least two of three distractors per question come from lessons 1–3. |
| b. Truncated glosses | `shortEn` cuts at the first comma: *Hola, buenos días* → "Hello"; *Más despacio, por favor* → "slower"; *Buenas noches* → "good evening". | For chunks use the text up to `;` or `(`, not the first comma. | "slower, please" is the option text. |
| c. Wrong fast audio | `Speech.speakNatural` and `listen-natural-meaning` play `natural[0]`. For words that field often holds a related phrase: *ser* → "osea", *ir* → "voya", *haber* → "quiubo", *saber* → "nosé", *ver* → "aver", *querer* → "¿quiés?", *irse* → "vámonos", *esperar* → "'pérame", *estar* → "'toy", *de* → "d'aquí". Seen in u01l03: "Fast speech — what does it mean?" plays "osea", answer "be", note "Said fast, *ser* can sound like *osea*". | `App.naturalOf(it)`: for words, accept a respelling only if its letters (folded, letters only) are a subsequence of the lemma's letters or within edit distance 1; otherwise play `it.es` at natural speed. For chunks, skip a respelling shared by another item (*¡buenas!* for both *Buenas tardes* and *Buenas noches*). Use it in `speakNatural`, `listen-natural*` and the fast round filter. On the learn card label rejected respellings "You'll also hear" instead of "Sounds like". | *ser* fast audio is "ser"; *para* still plays "pa'"; *todo* "to'o"; tardes and noches no longer share audio. |
| d. Misleading "why" | "Said fast, *Gracias* can sound like *grasias*" (it always does). | Suppress the note when respelling and spelling are equal after mapping `c/z → s`, `ll → y`, dropping `h`. | No note on *gracias*. |
| e. Answer leak in grammar | `grammarDrillExercises` passes the answer to `App.wordHelp`: "Ustedes _____ mucho. (trabajar)" shows the chip "trabajan — work (trabajar)"; "We work in Houston." shows "trabajamos". 313 fill/translate drills are exposed. | No word help on `fill`. On `translate`, chips show the dictionary form only ("trabajar — to work"); add `opts.lemma` to `App.wordHelp`. | No chip contains the expected answer's inflected form. |
| f. Inflated grammar score | `/grammar/g_present_ar` with two misses reported "17/17 on the first try"; `best` stored as 100%. The retry answers are counted. | Count only first attempts (`!ex.retry`) in the `onAnswer` callbacks in `grammarStep` and `App.pages.grammar`. | Two first-try misses of 17 → "15/17". |
| g. Function words as flashcards | *el, la, de, que, y, a* get "What does it mean?" → "the / of / that" and an audio-only card. | In quick checks give these one `cloze-choice` in their example ("___ cuenta, por favor" → el / la / los / las) instead of the two meaning questions. | No isolated meaning question for det / prep / conj / pron with rank ≤ 150. |
| h. Read adds wrong or rare cards | Marking "Partly" on the hare story added nine cards with no learn step, including `v_gana` ("desire, urge") for the gloss "gana — wins (ganar)", plus *tortuga, bosque, meta*. | In `vocabFor`, try the lemma in the gloss's parentheses before the surface match. In `mark`, auto-add only items with `rank <= 1500` or already learned; offer the rest through the existing "+ review" button. | The *gana* gloss maps to `v_ganar`; *tortuga* is not auto-added. |
| i. Grader gaps | "la favor" for *el favor* scores 1.00 with no note in a "(with el/la)" exercise; "porfavor" scores 0; notes mislabel forms ("ganó (yo)", "siga (yo, subjunctive)"). | When an accepted answer includes the article and the typed article is the wrong gender, score 0.85 with the gender note. Treat a missing space between two expected words as a typo. For form labels prefer the accent-exact lexicon entry; label `cmd` forms "usted, command". | The three cases grade as described. |
| j. Tile giveaways | Capitalised first tile and attached dashes ("—Gracias", "—De") give the order; "Sí, claro" is two tiles. | Lower-case tiles except proper nouns, strip dashes, require at least four tiles, three distractors from learned items. | No capital reveals the first tile. |

### Remaining improvements

#### 6. Error-driven review (M, code)

**Problem.** His specific mistakes do not come back outside word cards. Grammar drills run once (8 of ~17 in a
lesson) and are never scheduled; sound drills likewise (`Store.state.sounds[id]` is a timestamp); a Speak prompt with
missed targets queues nothing and a prompt marked good never returns; tile and gap errors on other words are dropped.

**Why.** An error followed at once by the answer is a good learning event (Kornell et al. 2009), but it lasts only if
the item is recalled again in later sessions (Rawson & Dunlosky 2011). Mixed grammar practice across sessions beats one
blocked pass (Pan et al. 2019).

**Spec.** `Store.state.errors[key] = {kind, ref, n, last, due}` with keys such as `g:g_ser:7`, `s:s_sinalefa:3`,
`p:p_order_tacos`, `w:v_tener:pres1s`. Write from `runExercises` (grammar and sound drills), `promptView` (outcome not
good: the prompt, plus its `targets` that map to items), and the tile and dictation exercises. Review starts with "Fix
my mistakes": up to eight due error items, mixed across kinds; a success moves `due` to 1 → 3 → 7 → 21 days and then
deletes the entry; a miss resets it to tomorrow. Separately, each completed grammar unit contributes two random drills
to a mixed "grammar warm-up" every third day. **Acceptance:** a missed grammar drill reappears in the next day's
review; missing *tres* in a prompt schedules `v_tres`.

#### 7. Reorder the first 20 lessons (M, content + code)

See "Content ordering" below. **Spec.** Add `content/starter_path.json`: an ordered list of lessons, each a list of
item ids plus optional `sounds` / `grammar` ids. `build_plan` in `scripts/build_course.py` uses it for the first N
lessons, removes those ids from the later queues, and continues as now. Also: dedupe a word against a chunk with the
same folded text (keep the chunk); move the Día de Muertos set out of the main path into an optional unit; sort the
trip queue with concrete nouns of `TRIP_FLAG_TOPICS` first. **Acceptance:** numbers 1–20, the eight question words,
*no / yo / tú / usted*, and yo + usted forms of *ser, estar, tener, querer, poder, ir* all appear by lesson 8; no item
of rank > 1,000 appears in lessons 1–10 unless it fills a frame taught there.

#### 8. Dialogue input at volume (L, content)

**Problem.** 3,887 words of reading in total, as fables and fairy tales (*liebre, tortuga, cigarra, zorro, lechera*),
first met at lesson 29. Nation (2014) estimates about **171,000 running words** to meet the second thousand words a
dozen times each and about **300,000** for the third; the app supplies roughly 1–2% of the first figure. Fables also
have the wrong register: his target is two people talking in a taquería.

**Spec.** Replace or supplement with 120–150 short Mexican **dialogues** (60–120 words; taxi, OXXO, hotel desk, market,
small talk, being asked where he is from), written inside the vocabulary learned so far, each with a `natural` version
for every line, from lesson 3 onward and one every two lessons. Group them in narrow sets (five taxi dialogues in a
row) so the same words and reductions recur. Each dialogue runs listen-first → gist question → text → shadow line by
line → listen again without text (shadowing mainly helps lower-level listeners with bottom-up decoding; Hamada 2019). Keep the existing stories as optional reading. Outside the app, the daily habit in
`RESEARCH.md` recommendation 8 (10–15 min of captioned Mexican video) remains the only realistic source of volume and
of real voices; surface it on Home as a daily checkbox.

#### 9. Cognate fast-track and word families (M, code + small content)

**Problem.** About a quarter of the vocabulary is transparent to an English speaker (*problema, posible, importante,
internacional, situación*), yet each gets the full card and five exercises; `RESEARCH.md` recommendation 4 ("treat
transparent cognates as quick recognition cards") was not implemented. The families are large: 107 *-mente*, 68
*-ción / -sión*, 38 *-dad / -tad*, 38 *-oso*, 19 *-ble*.

**Why.** English and Spanish share on the order of 10,000–15,000 cognates, and most fall into a few regular spelling
patterns (Lubliner & Hiebert 2011). A pattern lets him *generate* a word he was never taught, which is exactly "coming
up with words".

**Spec.** In `build_course.py` flag `cognate: true` when the folded Spanish is within normalised edit distance 0.34 of
an English gloss and no note mentions a false friend. In lessons, cognates skip the meaning checks: one card that
states the cue ("same word, Spanish stress: *im-por-TAN-te*"), then one `produce-recall` and one listening item (the
sound is what differs). Add eight pattern cards as content (*-tion → -ción, -ty → -dad, -ly → -mente, -ous → -oso,
-ble → -ble, -ic → -ico, -ist → -ista, -ment → -mento*) with a generative drill: given an English word not yet
taught, type the Spanish guess; plus the common false friends (*embarazada, actual, sensible, éxito, asistir, ropa*).

#### 10. Circumlocution kit (S content, S code)

**Problem.** Nothing trains what to do when the word will not come. **Why.** Communication strategies such as
circumlocution and fillers are teachable and improve with focused practice (Dörnyei 1995).

**Spec.** Add about 25 chunks at ranks 30–60: *¿Cómo se llama…?*, *No me acuerdo de la palabra*, *Es como…*, *Es una
cosa para…*, *Es un lugar donde…*, *Es lo contrario de…*, *Es parecido a…*, *algo así*, *la cosa esa*, *¿Cómo se dice
"…" en español?*, *¿Me entiende?*, *O sea…*, *Este…*, *Es que…*, *A ver…*, *¿Cómo te explico?*, plus the generic verbs
and nouns that carry a description (*cosa, lugar, persona, tipo, usar, servir para, poner, hacer*). New exercise
"Describe it": show an English word outside his vocabulary (*corkscrew, charger, towel*) and ask for a Spanish
description; `Grader.gradeFree` with targets such as `["cosa", "para"]`; show a model, then the real word. Move the
fillers (*este…, o sea, pues, a ver*) from lesson 26 to the first five lessons.

#### 11. Guess-first cards and "make it yours" (S, code)

**Problem.** The learn card shows the English at once (`settings.showEnglish` defaults to true), so the first
exposure involves no thinking. The Story page offers fairy tales (*princesa, castillo, torre*), not his life.

**Why.** An attempt before the answer improves later memory when feedback is immediate (Kornell et al. 2009, in
`RESEARCH.md` §4.1). Material he generates and that is about him is remembered better; the in-progress "My phrases"
work is the right vehicle.

**Spec.** Learn card: hide the gloss by default behind "Guess, then tap" with the example sentence visible and
playable; for cognates the guess is usually right, which is its own lesson. After a frame (`kind: "frame"`) is
learned, one optional step: "Finish it your way: *Necesito ___*", free text, saved as a My-phrases card. Rename Story
to "Retell a story" and add six "Your trip" goals (what you ate, where you went, something that went wrong, someone
you met) as content.

#### 12. Speak: hints before models, retry, return (S, code)

**Problem.** After one attempt with 1 of 4 key words, all three model answers appear; "Try again" is then copying.
*un coca* passed without a note. A prompt marked good never returns. No prompt is unlocked before lesson 17, so the
Speak page shows no Start button to a beginner.

**Spec.** On `close` or `miss`, show only the missed-target chips and first-letter cues and keep the models behind
"Show a model answer". After a model is shown, clear the box and ask once more from memory ("now without looking").
Schedule the prompt again at 2, 7 and 21 days (`Store.state.prompts[id].due`); the Speak page's Start button picks due
prompts first. Unlock the tier-1 prompts whose `targets` are all learned, regardless of `after_grammar`.

#### 13. Voice variety and honest audio (S, code)

**Problem.** One synthetic voice at one rate is not "fast Mexican speech"; respellings such as "pscado frito" or
"¿qué psó?" may be spelled out or garbled by the engine (verify by ear). **Why.** Perceptual learning generalises
better with several talkers than with one (high-variability training; cited from memory, see Sources).

**Spec.** In `speech.js`, when two or more Spanish voices score within 40 points of the best, rotate among them for
listening exercises (`opts.vary`). In Settings show which voice is in use and warn when it is not a neural / online
voice. Add a "this sounded wrong" button on fast-audio items that stores the item id in `Store.state.audioFlags` so bad
respellings can be fixed from real use.

#### 14. Sound-rule order and respelling audit (M, content)

**Problem.** Rules are ordered by first use in chunks, not by value: *vowel devoicing* (the rule TTS cannot render) is
lesson 2, *seseo* lesson 6, *clipping* 10, *d-loss* 14, and the two that matter most, *sinalefa* and *linking*, are
lessons 18 and 22. `RESEARCH.md` recommendation 7 gives the opposite order. Sixty respellings delete /d/ (*de na'a,
to'o derecho, ¿pue'o ___?, 'toy cansa'o, no pasa na'a*); `RESEARCH.md` §3 itself says /d/ weakening should be presented
as casual and less common in Mexico than in Spain, and central Mexican speech is better known for keeping consonants
and weakening vowels. Training his ear on *pue'o* prepares him for the wrong dialect.

**Spec.** Set an explicit `order` on sound rules: linking, sinalefa, same-letters/seseo, aphaeresis (*'tá*), apocope
(*pa'*), numbers, markers, clitics, fusion, clipping, soft consonants, d-loss, devoicing, the rest. In `chunks.json`,
make the first respelling a linking / aphaeresis version and demote /d/-deletion variants to second place or remove
them. Have a Mexican speaker check the 60.

#### 15. Leech aid: his own memory hook (S, code)

**Spec.** `Store.state.notes[id]`: a one-line "your hook" field on the relearn card (improvement 2) and on the Words
detail card, shown on the back of that item's cards. Offer a starter only for leeches. The keyword method helps
recall of hard items in the short term but is slow to apply across a whole deck, so keep it for the stubborn few.

## Pedagogy audit

| Topic | Status in the app | Action |
|---|---|---|
| Retrieval practice | Present, but mostly recognition by elimination; English shown before any attempt | 1, 5a, 11 |
| Production vs recognition | Receptive-first ladder is right for a beginner; production is then almost absent | 1, 2 |
| Cued recall steps | Only "Not sure"; no first-letter cue; gaps show the English sentence and the gloss; no "say it, then reveal" | 1 |
| Interleaving | Within a lesson yes; Review runs in learn order and its first session is one format; grammar is blocked | 2, 6 |
| Spacing parameters | 6 h → 1 d → 3 d → ×EF is reasonable; auto-Easy, no cap, no leeches and the lesson-miss inversion are not | 2 |
| Daily caps | Goal shown, not enforced; 40-card session cap only | 2 |
| Listening: dictation | Single words and chunks only | 3 |
| Listening: minimal pairs | Good inside sound rules; none elsewhere | keep; 5a brings confusable options |
| Listening: speed ramp | Three manual buttons; careful is the default | 3 |
| Listening: shadowing | None (a mic button on learn cards grades one item) | 8 |
| Listening before text | Optional in Read (off); absent in Speak; text never shown after a correct listen | 3 |
| Input volume | 3,887 words; fables | 8 |
| Chunks vs single words | Strong: 586 chunks, frames | 7 (frames need slot fillers early) |
| Cognates | Not exploited | 9 |
| Word families | Not taught | 9 |
| Mnemonics | None | 15 (leeches only) |
| Conjugation practice | Tables shown, never drilled; grammar units once | 4, 6 |
| Error-driven review | Word cards only | 6 |
| Personal relevance | Prompts yes; stories are fairy tales; My phrases in progress | 11 |
| Circumlocution | Two phrases at lesson 10 | 10 |

## Content ordering: the first 20 lessons

**What the builder does.** `build_plan` fills lessons 1–20 with four survival chunks, four "trip words" and three
core words each. The chunk stream is good. The trip-word stream is the problem: it takes words whose *topic tag* is a
travel topic, sorted by corpus rank, so it yields mid-frequency abstract verbs tagged `directions` or `money`
(*seguir, permitir, ganar, aceptar, ofrecer, valer, acercarse, indicar, señalar, incluir*) and never reaches the
concrete nouns (*taco* rank 3200, *boleto* 2600, *cuadra* 2800). The core stream teaches bare function words as cards.

**Consequences.**

- Frames arrive without fillers: *¿Dónde está ___?* (lesson 4), *¿Me da ___?* (11), *Quiero ___* (15), *¿Tiene ___?*
  (17), while *baño, cuenta, taco, cerveza, boleto* as words come much later.
- He can ask *¿Cuánto cuesta?* at lesson 6 and cannot understand the answer: numbers start at lesson 20 and reach
  *nueve* at lesson 92; the "numbers at speed" sound rule is lesson 62.
- *donde* (relative, "not a question") is lesson 2; *dónde* is lesson 3. Teach the question word first.
- Lesson 5 is Día de Muertos (*tumba, cementerio, calavera, panteón, catrina*; ranks 600–6000). The date has passed.
- The repair phrases are split: *no entiendo, más despacio* (3), *¿cómo se dice?* (10), *¿me lo puede repetir?* (11),
  *otra vez* (45).
- Grammar that makes sentences comes late: *ser* 17, *estar* 23, *hay* 26, present -ar 29, *tener* 41, *ir a* 44,
  *querer / poder / necesitar* + infinitive 47, preterite 111. He has just been to Mexico and will want to say what he
  did; a chunk-level past (*fui, comí, estuvo, me gustó*) belongs in the first 40 lessons.
- First Speak prompt at lesson 17, first story at 29.

**Proposed first three hours** (about ten items a lesson; verbs enter as the forms he will say and hear)

| Lesson | Content | With |
|---|---|---|
| 1 | hola, buenos días / tardes / noches, por favor, gracias, de nada, sí, no, perdón, disculpe, con permiso | pronunciation unit |
| 2 | Repair kit: no entiendo, ¿mande?, más despacio, ¿me lo puede repetir?, otra vez, ¿cómo se dice ___?, ¿qué significa ___?, hablo poquito español, no sé | sound: linking |
| 3 | uno–diez, ¿cuánto cuesta?, ¿cuánto es?, pesos | price listening |
| 4 | ¿me da ___?, quiero ___, quisiera ___, la cuenta, para llevar, para aquí, con / sin + agua, café, cerveza, taco | first Speak prompt |
| 5 | 11–20, tens, cien, *y*; prices at speed | sound: numbers |
| 6 | qué, dónde, cuándo, cómo, cuánto, quién, por qué, cuál; ¿dónde está ___?; aquí, allí, cerca, lejos; baño | sound: sinalefa |
| 7 | soy / es, estoy / está, tengo / tiene (as chunks: soy de…, estoy bien, tengo hambre) | ser + estar, short |
| 8 | quiero / quiere, puedo / puede, voy / va, necesito; ¿puedo ___?, voy a ___ | first dialogue |
| 9 | yo, tú, usted; me llamo ___, ¿cómo te llamas?, mucho gusto, ¿de dónde eres? | Speak: introduce yourself |
| 10 | derecha, izquierda, derecho, cuadra, esquina, ¿cómo llego a ___? | sound: aphaeresis (*'tá*) |
| 11 | pues, bueno, este…, o sea, entonces, a ver, ¿verdad?, órale | sound: markers |
| 12 | hoy, mañana, ayer, ahora, ahorita, ¿qué hora es?, a las ___ | |
| 13 | hay, ¿hay ___?, no hay, me gusta ___, tengo que ___ | gender + articles |
| 14 | efectivo, tarjeta, cambio, caro, barato, ¿aceptan tarjeta? | |
| 15 | hotel, cuarto, llave, reservación, noche; tengo una reservación | present -ar |
| 16 | Past as chunks: fui a ___, comí ___, estuvo ___, me gustó, ¿ya ___? | Speak: what did you do? |

**Cut or move later:** the Día de Muertos set (optional unit); *permitir, ganar, ofrecer, acercarse, indicar,
señalar, desear, internacional, económico, hacia, valer, fondo, incluir, preparar*; isolated *el, la, los, las, de,
que, y, a, en, se, lo, le* (teach inside chunks and the articles unit); the duplicate word cards for texts already
taught as chunks.

**Migration note.** The owner has one lesson done and 22 items learned, so reordering now is cheap. After the rebuild,
mark a lesson done when all its learn items are already in `Store.state.learned`.

## Bugs and papercuts

| # | What | Repro |
|---|---|---|
| 1 | Fast audio plays a different word for some verbs and *de* (see 5c) | u01l03 → "Mix it up" → "Fast speech — what does it mean?" for *ser*; or press Natural on the *ir* learn card |
| 2 | *Buenas tardes* and *Buenas noches* play the same fast audio "¡buenas!" with different answers | u01l02 mixed round |
| 3 | Items missed in a lesson get a longer first interval than items answered correctly | Miss one item in a lesson, advance the clock 6 h, review: missed item is multiple choice with "Suggested: Easy, 3 days", clean items "Good, 1 day" |
| 4 | Any correct multiple choice suggests *Easy* | First Review card |
| 5 | Intervals are unbounded (60,832 days reached in simulation) | Keep accepting the suggested rating |
| 6 | Grammar result counts retries as first tries: "17/17 on the first try" after two misses; `best` = 100% | `#/grammar/g_present_ar`, miss two drills |
| 7 | Grammar "Word help" shows the answer (*trabajan*, *trabajamos*, *hablo*, *necesito*, *pagan*) | Same page, any fill or translate drill |
| 8 | Read → "Partly" adds a wrong-sense card (`v_gana`, "desire") and rare words, with no learn step, counted as "new today" (42/20) | `#/read/rd_la_liebre_y_la_tortuga`, mark sentence 9 "Partly", then Home |
| 9 | Words search does not find verb forms | Search *fui* → "0 items" |
| 10 | Speak has no Start button and every tile looks locked until lesson 17 (tiles still open) | `#/speak` as a beginner |
| 11 | Grader: *la favor* scores 1.00 with no note; *porfavor* scores 0; "ganó (yo)", "siga (yo, subjunctive)" labels | Console: `Grader.gradeAnswer("la favor", ["el favor", "favor"])` |
| 12 | Story beat: headline "¡Muy bien! That's exactly it." above two corrections; *de el* not flagged; key word ✓ *está dormida* for "es dormida" | `#/story/st_bella_durmiente`, beat 2: "Ella es dormida en un torre de el castillo" |
| 13 | Speak: *un coca* not flagged; all models revealed after a 1/4 attempt | `#/speak/p_order_tacos`, answer "tacos" |
| 14 | A correct listening answer never shows the Spanish text | Any "Listen — what does it mean?" |
| 15 | Chunk options are truncated glosses ("Hello", "slower", "good evening") | u01l01 quick check |
| 16 | "SOUNDS LIKE" label on alternates (*hola, buen día*; *¡buenas!*) | First learn card of u01l01 |
| 17 | Review runs in learn order | Open Review after two lessons |
| 18 | New-words goal not enforced: 33 new in one sitting, Continue → lesson 4 | Play three lessons |
| 19 | Completion lines contradict the next button: "Daily goal reached. Go enjoy your day" beside "Next: … →" | End of any lesson or review |
| 20 | Word-help glosses pick the wrong sense or repeat: "derecho — right / right" for *siga derecho*; "español — Spanish / Spanish"; "tacos — taco (taco)" | u01l02 build step; `g_present_ar` drills |
| 21 | Tile order given away by capitals and dashes; two-tile sentences | u01l01 / u01l02 build steps |
| 22 | Auto lesson titles: "Hello & go", "How are you & oh", "The right & turn" | Course map |
| 23 | Home still shows "¡Buen viaje! Keep practising while you're there." | Home, after the trip dates |
| 24 | Nav wraps at about 800 px with ⚙ alone on a second row; header + banner use about 200 px before content | Narrow the window |
| 25 | Read: Reveal is the Enter action and the explanation box is optional, so the story can be clicked through | Any reading |
| 26 | Lexicon-based verb gap asks for an untaught form (*Siga*, *pidieron*, *ganó*) | u01l02 "Fill the gap" for *seguir* |

## Content errors

| File | Id | Problem | Fix |
|---|---|---|---|
| `vocab_verbs.json` | `v_ser` | `natural: ["osea", "eske"]` are other phrases | Remove; they belong to `c_o_sea` and an *es que* chunk |
| `vocab_verbs.json` | `v_ir`, `v_haber`, `v_saber`, `v_ver`, `v_querer`, `v_irse`, `v_esperar`, `v_estar` | `natural` holds forms or phrases (*voya, quiubo, nosé, aver, ¿quiés?, vámonos, 'pérame, 'toy*), not the infinitive's sound | Move to the matching chunks or a new `forms_natural` field; leave `natural` empty |
| `vocab_other.json` | `v_de` | `natural: ["d'aquí", "d'eso"]` | Same |
| `vocab_nouns.json` | `v_senor` | `natural: ["señó", "siñor"]` and the note "In fast speech often 'señó'": final /r/ loss is Caribbean / Andalusian, not Mexican | Remove both |
| `chunks.json` | `c_hola_buenos_dias` | `natural: ["hola, buen día", "¡buenas!"]` are alternative greetings | Move to `note`; add a chunk *¡Buenas!* ("hi", any time of day) |
| `chunks.json` | `c_buenas_tardes`, `c_buenas_noches` | first respelling "¡buenas!" for both | Put "buenas tard's" / "buenas noch's" first |
| `chunks.json` | `c_de_nada`, `c_todo_derecho`, `c_con_todo`, `c_es_todo_gracias`, `c_puedo_x`, `c_se_puede_x`, `c_me_lo_puede_repetir`, `c_no_pasa_nada`, `c_estoy_cansado`, `c_al_lado_de_x`, `c_tener_miedo`, `c_que_pedo` and about 45 more; `v_todo`, `v_nada` | /d/-deletion respellings (*na'a, to'o, pue'o, pue', -a'o, la'o, mie'o, pe'o*) presented as the normal fast form; not typical of central Mexico (and contradicts `RESEARCH.md` §3, rule 5) | Demote or remove; verify with a Mexican speaker |
| `chunks.json` / `vocab_nouns.json` / `vocab_other.json` | `c_agua_natural`, `v_agua_natural`, `v_natural` | Three different glosses: "still water (not cold)", "(not flavored)", "room temperature" | One gloss: "plain still water (not sparkling or flavoured); for temperature say *al tiempo* / *fría*"; drop `v_agua_natural` (duplicate, rank 5000) |
| `chunks.json` | `c_y_para_tomar` | Example "¿Una agua fresca?" while `c_me_da_x_por_favor` and `v_agua_natural` use *un agua* | "¿Un agua fresca?" |
| `vocab_nouns.json` | `v_cuidado` | Gloss "care" with the example *¡Cuidado con el escalón!* | "care; ¡cuidado! = careful!, watch out!" |
| `vocab_*.json` | `v_donde` (rank 90) vs `v_donde_2` (rank 140) | The relative *donde* is taught before the question word | Swap the ranks |
| `vocab_*.json` | `v_derecho` (rank 470, "right (entitlement); law") vs `v_derecho_2` (rank 1500, straight) | The travel sense comes 75 lessons after the legal one | Swap the ranks |
| `vocab_other.json` | `v_barato` rank 2400, `v_caro` rank 1300, while `v_economico` ("cheap") is rank 410 | Everyday price words land at lessons 216 and 128 | Rank about 800–900, or place via the starter path |
| `vocab_nouns.json` | `v_taco` 3200, `v_efectivo` 3200, `v_farmacia` 3000, `v_cuadra` 2800, `v_boleto` 2600, `v_sed` 2600 | Corpus rank is honest but puts trip essentials at lessons 230–270 | Place via the starter path |
| `sounds.json` | `s_vowel_devoicing` | `mexico` text shows an internal id "(see s_s_aspiration)"; drills "buenas noches" and "muchas grasias" contain no devoicing; `say` strings "pscado frito", "¿qué psó?", "nessito" may be unreadable for TTS | Use the rule's name; replace those drills; verify by ear in Edge |
| many | 39 chunk/word pairs (`c_gracias` / `v_gracias`, `c_pues` / `v_pues`, `c_mande` / `v_mande`, `c_bueno` / `v_bueno`, `c_ahorita` / `v_ahorita`, …) | Same text, two cards | Dedupe in the build (keep the chunk) |

Not errors: `conducir`, `autobús`, `billete` (banknote) and `piso` (floor) are fine for Mexico; the one *vosotros* in
`grammar.json` is the answer to "Which is NOT used in Mexico?".

## Sources

Opened or returned by search in this session:

- Nakata (2017), within-session repeated retrieval, *SSLA* 39(4):
  https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/does-repeated-practice-make-perfect-the-effects-of-withinsession-repeated-retrieval-on-second-language-vocabulary-learning/F14BA8A576CD2563D14CEA46E35D842E
- Kang, McDermott & Roediger (2007), test format and feedback, *Eur. J. Cognitive Psychology* 19:
  https://www.gwern.net/docs/spaced-repetition/2007-kang.pdf
- Finley, Benjamin, Hays, Bjork & Kornell (2011), accumulating vs diminishing cues, *J. Memory and Language* 64:
  https://bjorklab.psych.ucla.edu/wp-content/uploads/sites/13/2016/07/Finley_Benjamin_Hays_RBjork_Kornell_2011.pdf
- Fiechter & Benjamin (2017), diminishing-cues retrieval practice, *Psychonomic Bulletin & Review*:
  https://link.springer.com/10.3758/s13423-017-1366-9
- Terai, Yamashita & Pasich (2021), learning direction and proficiency, *SSLA* 43(5):
  https://www.cambridge.org/core/product/159EE50F4B8835207764FB1B11077F29
- Pan, Lovelett, Tajran, Osuna & Rickard (2019), interleaving Spanish verb conjugation, *J. Educational Psychology*
  (accepted manuscript): https://sc-pan.github.io/pdf/PTLOR_2019W.pdf
- Rawson & Dunlosky (2011), how much retrieval practice is enough, *JEP: General*: https://doi.org/10.1037/a0023956
- Nation (2014), "How much input do you need to learn the most frequent 9,000 words?", *Reading in a Foreign Language*
  26(2), Table 3 (171,411 tokens for the 2nd 1,000; 300,219 for the 3rd): https://files.eric.ed.gov/fulltext/EJ1044345.pdf
- Field (2003), "Promoting perception: lexical segmentation in L2 listening", *ELT Journal* 57(4):
  https://doi.org/10.1093/elt/57.4.325 (abstract and secondary summaries only; full text not opened)
- Hamada (2019), review of shadowing research, *RELC Journal*: https://journals.sagepub.com/doi/10.1177/0033688218771380
- Dörnyei (1995), "On the teachability of communication strategies", *TESOL Quarterly* 29(1):
  https://search.worldcat.org/title/425764080 (abstract only)
- Lubliner & Hiebert (2011), English–Spanish cognates, *Bilingual Research Journal* 34:
  https://textproject.org/wp-content/uploads/2022/07/Lubliner-Hiebert.pdf

Already cited in `docs/RESEARCH.md` and relied on here: Karpicke & Roediger (2008); Kornell, Hays & Bjork (2009);
Cepeda et al. (2008); Webb (2008); Nakata & Suzuki (2019); Webb & Chang (2015); the Anki manual.

Cited from memory, not checked in this session (verify before quoting): Little, Bjork, Bjork & Angello (2012),
*Psychological Science* 23, on multiple-choice questions with competitive alternatives; Dunlosky et al. (2013),
*Psychological Science in the Public Interest*, on the limited utility of the keyword mnemonic; Logan, Lively & Pisoni
(1991) on high-variability phonetic training. The claim about /d/ retention in central Mexican Spanish is from general
dialectology and from `RESEARCH.md` §3; it was not re-sourced here.
