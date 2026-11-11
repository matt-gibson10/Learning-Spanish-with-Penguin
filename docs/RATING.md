# Penguin Rating — a chess-style Spanish rating

Design and research for the Progress tracker. Design only: no app code is in this file's scope. Section 6 is
the contract a coding agent implements; sections 1–5 and 7 explain and justify it.

**In one paragraph.** Every scored answer is a game between you and an item. Items carry a rating on the same
scale as you (100 = first words, 2000 = really speaks, 2500 = educated native). You gain when you beat an item
you were not expected to beat and lose when you miss one you should have had. Six sub-ratings (Vocabulary,
Listening, Production, Grammar, Reading, Conversation) are tracked like chess time controls, and the overall
rating is their weighted mean pulled toward the weaker of Listening and Production. The number is capped at
**1400** because nothing in this course is hard enough to prove more than that.

---

## 1. The scale

### 1.1 Bands

| Rating | Band | CEFR-ish | What you can do | Words you know (receptive lemmas) | Chess analogy |
|---|---|---|---|---|---|
| 100–299 | **Primeras palabras** (first words) | pre-A1 | Greet, thank, count, recognise a few dozen words and set phrases | under ~140 | Just learned how the pieces move |
| 300–599 | **Turista** | A1 | Order food, ask prices and directions, introduce yourself; understand slow, careful speech about concrete things | ~140–400 | Knows the rules, still hangs pieces every game |
| 600–899 | **Viajero** (traveller) | A2 | Get through a trip in Spanish with patient people: routine exchanges, simple descriptions, first past-tense sentences | ~400–900 | Beginner who has stopped hanging the queen |
| 900–1199 | **Platicador** (chatty) | B1 (lower) | Hold a real, slow conversation on familiar topics; tell a short story in the past; follow clear speech | ~900–1,950 | Casual player with a couple of openings |
| 1200–1499 | **Independiente** | B1 (upper) | Handle most travel situations unaided, explain opinions and plans, follow everyday talk with context | ~1,950–4,000 | Steady club player |
| 1500–1799 | **Fluido** | B2 | Talk with native speakers without strain on either side, follow TV and news, argue a point | ~4,000–8,100 | Strong club player |
| 1800–2099 | **Avanzado** | C1 | "Really speaks": spontaneous, flexible, funny, can work in Spanish. **Your 2000 lives here** | ~8,100–16,300 | Expert, then candidate master at 2000 |
| 2100–2399 | **Maestro** | C2 | Understands practically everything, expresses fine shades of meaning | ~16,300–32,600 | Master (FM / IM) |
| 2400+ | **Nativo** | educated adult native speaker | Talks about anything, at speed, with slang, wordplay and regional colour. **Your 2500 lives here** | ~32,600 and up | Grandmaster |

The vocabulary column comes from one rule, used everywhere in this document:

```
rating  = 1000 * log10(words + 120) - 2115          words = 10^((rating + 2115) / 1000) - 120
```

Roughly **+300 points for every doubling of vocabulary** (1,000 words ≈ 934, 2,000 ≈ 1211, 4,000 = 1500,
8,000 ≈ 1795, 16,000 ≈ 2092). It is a convention fitted to the anchors in §1.5, not a law of nature.

### 1.2 Where native speakers sit (your 1500–2000 guess)

Kindly: too low, by about a master's worth of points. **An adult native speaker is the top of the scale, about
2300–2600**, and that is on vocabulary alone.

- An average 20-year-old native speaker of American English knows about **42,000 lemmas**; the lowest 5% know
  about 27,000 and the highest 5% about 52,000
  ([Brysbaert et al. 2016](https://pmc.ncbi.nlm.nih.gov/articles/PMC4965448/)). I found no equivalent count for
  Spanish, so treat these as the right order of magnitude rather than Spanish figures. On the rule above, 27,000
  → 2318, 42,000 → 2509, 52,000 → 2602.
- So the player you described at 2500, "insane, can literally talk about anything, far above the typical 3000
  words", **is the ordinary adult native**. In their own language, everybody who grew up in it is a grandmaster.
  It is as if a whole country had played chess ten hours a day since birth.
- **1500–2000 is where a native *child* sits, and where a very good foreign speaker sits.** Six-year-old native
  English speakers average about 5,200 root words (Biemiller & Slonim, as reported in
  [Coxhead, Nation & Sim](https://vuw-web.matrix.squiz.cloud/lals/resources/paul-nations-resources/paul-nations-publications/publications/documents/coxhead-secondary-school-vocab-size.pdf)),
  which is about 1600 on the vocabulary rule. I found a figure for age 6 but not for age 5. That child's listening
  and conversation would still rate far above a 1600 learner's (full speed, no effort, perfect accent) and their
  reading far below.
- Natives are also beyond the scale in ways it does not measure: speed, accent, idiom, humour, register. A C2
  learner (2100–2399) can match a native's range of topics and still be audibly foreign.

### 1.3 Where "knows the app's 3,000 words" sits

**About 1380 on the Vocabulary sub-rating, upper B1, and that is the ceiling, not the expectation.**

- The course has 3,022 lemmas plus 586 phrases. On the rule, 3,022 words → **1382**.
- Independent check: on Milton & Alexiou's X-Lex yes/no test of the 5,000 most frequent lemmas, English learners
  score 2,750–3,250 at B1 and 3,250–3,750 at B2
  ([Milton & Alexiou 2010, Table 2](https://www.enl.auth.gr/gala/14th/Papers/English%20papers/Milton&Alexiou.pdf)).
  3,000 recognised words is B1 there too.
- 3,000 Spanish lemmas cover about 94% of the words in speech and about 88–90% of written text
  ([Davies 2005](https://www.mark-davies.org/articles/davies_26.pdf), detail in [RESEARCH.md](RESEARCH.md) §1.3).
  Enough to follow everyday talk with context, not enough to read a newspaper comfortably.
- That 1380 is for *recognising* them. Your overall only gets there if you can also catch them at natural
  speed and produce them. A learner who recognises all 3,000 but can type 300 will sit several hundred points
  lower, and the sub-ratings will say exactly where the gap is.

### 1.4 The ceiling: "measured up to 1400"

The overall rating is capped at **1400** and each sub-rating at **1600**. The Progress page shows the cap as a
line on the chart with its reason:

> **Measured up to 1400.** This course's vocabulary stops at about 3,000 words, its grammar at the past tenses
> and a first taste of the subjunctive (no future, conditional or perfect tenses), its readings at about 270
> words, and its conversation partner is a patient penguin. Nothing here is hard enough to tell a 1400 from a
> 2000, so the number stops where the evidence stops.

Two smaller honesty rules:

- **B1 gate.** The overall cannot pass **899** until you have at least 20 scored free-production answers
  (Speak prompts, story beats or chat turns). B1 means you can hold a conversation; without any evidence of
  that, the app does not award it.
- **Floor.** Ratings never go below 100.

### 1.5 Anchors used to place the bands

| Anchor | Figure | Used for |
|---|---|---|
| CEFR global scale (A1: everyday expressions and basic phrases … C2: understands practically everything heard or read) | level descriptors, [Council of Europe](https://www.coe.int/en/web/common-european-framework-reference-languages/table-1-cefr-3.3-common-reference-levels-global-scale) (page refused my fetch; wording paraphrased from the standard scale, also in this [can-do sheet](https://www.kcl.ac.uk/language-centre/assets/can-do-statements-cefr.pdf)) | the "what you can do" column |
| X-Lex vocabulary by CEFR level, of the top 5,000 lemmas | English: A1 <1,500 · A2 1,500–2,500 · B1 2,750–3,250 · B2 3,250–3,750 · C1 3,750–4,500 · C2 4,500–5,000. French means: 1,160 · 1,650 · 2,422 · 2,630 · 3,212 · 3,525 ([Milton & Alexiou 2010](https://www.enl.auth.gr/gala/14th/Papers/English%20papers/Milton&Alexiou.pdf)) | checks that 3,000 words ≈ B1 |
| Rule-of-thumb doubling (≈500 → 1,000 → 2,000 → 4,000 → 8,000 → 16,000 for A1 → C2) | third-party, approximate (e.g. [Memrise](https://www.memrise.com/blog/spanish-fluency)) | the +300 per doubling slope |
| Instituto Cervantes *Plan Curricular* | gives word **lists** per level, not counts, and the vocabulary of C1–C2 is described as impossible to delimit ([Word lists in Reference Level Descriptions](https://iris.unito.it/retrieve/e27ce426-f168-2581-e053-d805fe0acbaa/Word%20lists%20in%20Reference%20Level%20Descriptions.pdf)) | why the upper vocabulary numbers are soft |
| Native adults | 42,000 lemmas at age 20, range 27,000–52,000 ([Brysbaert et al. 2016](https://pmc.ncbi.nlm.nih.gov/articles/PMC4965448/)) | top of the scale |
| Native children | ~5,200 root words at age 6 (Biemiller & Slonim, via [Coxhead, Nation & Sim](https://vuw-web.matrix.squiz.cloud/lals/resources/paul-nations-resources/paul-nations-publications/publications/documents/coxhead-secondary-school-vocab-size.pdf)) | the 1500–2000 answer |
| FSI | Spanish is Category I: about 24–30 weeks, 600–750 class hours, to ILR 3 "professional working proficiency" ([state.gov](https://www.state.gov/national-foreign-affairs-training-center/foreign-language-training); the page refused my fetch and secondary sources disagree on 24 vs 30 weeks for Spanish). ILR 3 is usually aligned with C1, sometimes B2 ([ILR scale](https://en.wikipedia.org/wiki/ILR_scale)) | 1800–2000 is a 600–750 class-hour project, more with homework |
| Duolingo Score | 0–29 A1 · 30–59 A2 · 60–99 B1 · 100–129 B2 · 130–160 C1–C2; content currently ends at 129 ([Duolingo](https://blog.duolingo.com/duolingo-score/), [B2 ceiling](https://blog.duolingo.com/courses-teach-advanced-content/)) | sanity check; note Duolingo also stops its number where its content stops |

Caveats that belong next to this table: CEFR publishes no vocabulary counts; the X-Lex figures are measured
means for particular learner groups, noticeably higher at A1–A2 than the doubling rule; and every vocabulary
figure depends on what "knowing a word" means (Brysbaert's is as loose as recognising that the word exists).

---

## 2. The model

### 2.1 Expected score

```
sigma(r, d)        = 9 / (9 + 10^((d - r) / 400))
expected(r, d, k)  = 1/k + (1 - 1/k) * sigma(r, d)      for a k-option multiple choice
                   = sigma(r, d)                        for typed, tiles, flash, free answers (k = 0)
```

- `r` is your rating in the item's skill, `d` the item's rating.
- This is the Elo formula against an opponent rated `d − 382`. Put the other way round: **an item's rating is
  the level at which it is mastered (90% expected), not the level at which it is a coin flip.** A 500 player
  scores 90% on a 500 item, 47% on a 900 item, 99% on a 100 item.
- Why 90% and not chess's 50%: a chess server can pair you with equals; this app cannot. It teaches a fixed
  course and then tests what it taught, with spaced repetition holding recall near 90%. With a 50% par, a
  learner who reliably knows everything shown would be rated about 380 points above the hardest thing they had
  ever seen. With a 90% par, "you are rated 800" means "you have mastered the 800-level material", which is the
  claim the band table makes. (Easier practice also teaches better: in a Math Garden experiment comparing 60%,
  75% and 90% target success rates, the easiest condition led to the most learning, as summarised in
  [Pelánek et al. 2017](https://www.fi.muni.cz/~xpelanek/publications/umuai-adaptive-practice.pdf).)
- The `1/k` term is the standard guessing correction for multiple choice, the "shifted logistic" of
  [Pelánek 2016](https://www.fi.muni.cz/~xpelanek/publications/CAE-elo.pdf) §2.2. Four options → you are expected
  to get at least 25% by luck, so a lucky guess on a hard item earns less than a typed answer would.

### 2.2 Item difficulty

Every scorable thing gets `d` from data the course already has. All values are rounded to integers.

**Words and phrases** (`COURSE.vocab`, `COURSE.chunks`):

```
p       = number of course vocabulary words whose rank <= min(item.rank, tierCap)     (at least 1)
base(p) = 1000 * log10(p + 120) - 1965
d       = base(p) + OFFSET[exType] + lengthBonus
```

- `p` is a position, not the raw rank: "if you know this word and every more frequent course word, you know
  `p` words". Raw rank would over-credit the sparse top of the list (the course has 3,022 words spread over
  ranks 1–6,000). Phrase ranks sit on the same scale (the build interleaves them with vocabulary by rank), so
  phrases use the same lookup.
- `tierCap` = 500 × the tier of the unit that teaches the item (tier 6: no cap). Unit 1 teaches a few rare
  trip words early; without the cap a beginner would bank B2-level points for a word learned on day one.
- `base(p)` is the vocabulary rule of §1.1 plus 150. The +150 is what makes the two agree: a learner who gets
  90% of delayed tests right on the first N course words settles within about 60 points of the rating the rule
  gives for N words (§2.7).
- `lengthBonus` = 30 per word after the first, at most 120, and only where you must type the whole string
  (`produce-type`, `listen-type`, `listen-natural`, `build-type`). `___` slots do not count as words.

| exType (where it appears) | Skill | Offset | Guess `k` |
|---|---|---|---|
| `recognise-choice` — see Spanish, pick the meaning | Vocabulary | 0 | options (4) |
| `recognise-flash` — see Spanish, recall, self-rate | Vocabulary | +25 | 0 |
| `produce-choice` — see English, pick the Spanish | Vocabulary | +150 | options (4) |
| `listen-choice` — hear it, pick the written Spanish | Listening | +25 | options (4) |
| `listen-meaning` — hear it (careful), pick the meaning | Listening | +50 | options (4) |
| `hear-flash` — hear it, recall, self-rate | Listening | +75 | 0 |
| `listen-natural-meaning` — hear it at natural speed, pick the meaning | Listening | +125 | options (4) |
| `listen-type` — dictation, careful speed | Listening | +200 + length | 0 |
| `listen-natural` — dictation, natural speed | Listening | +300 + length | 0 |
| `gender` — el or la | Grammar | +150 | options (2–3) |
| `tiles` — build the example sentence | Production | +175 | 0 |
| `cloze` — type the word into its sentence | Production | +200 | 0 |
| `produce-type` — see English, type the Spanish | Production | +250 + length | 0 |
| `build-type` — type the whole example sentence | Production | +250 + length of `ex_es` | 0 |

The order is the one the brief asked for: recognise < listen careful < listen natural < pick-the-Spanish <
cloze < typed production. The +250 for typing is a calibration choice: it makes Production equal Vocabulary
for a learner who can type about half the words they recognise (§2.7). If your own numbers drift apart, that
difference is the information: "Listening 640 · Production 310" means your production is behind what your
listening would predict.

**Everything else**, with `G(order) = 150 + 22 * order` for the grammar unit's `order` (1–32; 0 when
`after_grammar` is null):

| Item | Skill | Difficulty | Guess `k` |
|---|---|---|---|
| Grammar drill `choice` / `fill` / `transform` / `translate` | Grammar | `G(order)` + 0 / 100 / 150 / 200 | options / 0 / 0 / 0 |
| Sound drill `hear_pick` | Listening | `280 + 15 * ruleIndex` | options (3) |
| Sound drill `hear_type` | Listening | `480 + 15 * ruleIndex` + length | 0 |
| Speak prompt | Production | `G(order of after_grammar) + 175 + clamp(5 * (words in models[0] - 5), 0, 75)` | 0 |
| Story, one beat | Production | `G(order of after_grammar) + 225` | 0 |
| Story, all at once | Production | `G(order of after_grammar) + 300` | 0 |
| Reading sentence | Reading | `150 + 200 * tier + clamp(8 * (words - 12), -50, 80)` | 0 |
| Chat turn at level 1 / 2 / 3 | Conversation | 700 / 925 / 1150 | 0 |

`ruleIndex` is the rule's index in `COURSE.sounds` (0–17). Chat level is the page's level setting
(`settings.chatLevel`), not the topic's tier.

**Worked table** (current `course.js`; `p` in brackets):

| Task | d |
|---|---|
| Recognise *Gracias* (phrase, rank 3) [p 3] | **125** |
| Hear *Gracias*, pick the meaning | 175 |
| Type *Gracias* | 375 |
| Hear *La cuenta, por favor*, pick the meaning (rank 41) [p 44] | 300 |
| Type *La cuenta, por favor* | 590 |
| Recognise *casa* (rank 120) [p 134] | 440 |
| *el* or *la* casa | 590 |
| Type *la casa* | 690 |
| Recognise *¿Qué onda?* (rank 139) [p 144] | 457 |
| Natural speed "¿kionda?" → pick the meaning | **582** |
| Natural speed "¿kionda?" → type *¿Qué onda?* | 787 |
| Sound drill, "¿kionda?" → pick the written form (rule 0) | 280 |
| Type *Me gustaría ___* (rank 188) [p 187] | **802** |
| Recognise *desarrollo* (rank 650) [p 552] / type it | 862 / 1112 |
| Recognise *perro* (rank 900) [p 718] / type it | 958 / 1208 |
| Recognise *herramienta* (rank 2800) [p 2135] / type it | 1388 / 1638 |
| Hardest word in the course (rank 6000) [p 3022]: recognise / type | 1532 / 1782 |
| Grammar: *el/la* choice (g_gender, order 2) | 194 |
| Grammar: fill a *ser* form (order 6) | 382 |
| Grammar: fill a regular preterite (order 27) | 844 |
| Grammar: translate a subjunctive phrase (order 32) | 1054 |
| Speak prompt "say your name and where you're from" (after g_ser, 7-word model) | 467 |
| Speak prompt "get well soon" (after the subjunctive, 9-word model) | 1049 |
| Story beat, *Sleeping Beauty* (after g_hay) | 573 |
| **Preterite story** (*Icarus*): one beat / whole story | **969 / 1044** |
| Hardest story (*Pandora's box*), whole | 1154 |
| Reading sentence, tier 1 (*La liebre y la tortuga*) | 302–366 |
| Reading sentence, tier 4 (*El regalo de los Reyes Magos*) | 942–1030 |
| Chat turn, level 1 / 2 / 3 | 700 / 925 / 1150 |

The 80 prompts run from 457 to 1054 (median 707).

### 2.3 Outcome → score `S`

| What happened | `S` | Weight multiplier |
|---|---|---|
| `good` | 1.0 | 1 |
| `good` with a grammar slip flagged by the grader (right word, wrong form) | 0.9 | 1 |
| `close` | the grader's `score`, clamped to 0.5–0.7 | 1 |
| `miss` | 0 | 1 |
| `unsure` ("Not sure 🤷") | `1/k` on multiple choice, 0 otherwise | 0.75 |
| Flash card self-rating: easy or good / hard / again | 1.0 / 0.6 / 0 | 0.5 (self-rated) |
| Reading mark: got it / partly / missed | 1.0 / 0.5 / 0 | 0.5 (self-rated) |
| Chat turn | 1.0 clean Spanish · 0.7 Spanish with a correction or grammar note · 0.4 mixed Spanish and English · 0 mostly English | 1 |

- Accent, punctuation and small typo notes do not reduce `S`. The grader already treats them as correct.
- **Why "Not sure" scores `1/k` rather than 0.** On a four-option question a blind guess is worth 25% on
  average. Scoring "Not sure" at exactly that, with a smaller weight, means admitting you don't know never
  costs more than guessing would, so there is no reason to gamble. This departs from the brief's "unsure = 0"
  for multiple choice only; for typed answers it is 0 with the same 0.75 weight.
- Chat scoring needs only what the page already has: the learner's text, the model's `correction`, and the
  grader's notes. "Spanish" = at least 80% of tokens found by `Grader.lookup`; "mixed" = 50–80%. Turns shorter
  than three words, and turns that are an unedited suggestion chip, are not scored.

### 2.4 K-factor and uncertainty

Each sub-rating carries an uncertainty `u` between 0 and 1, starting at 1.

```
K(u) = 8 + 32 * u                      40 when brand new (FIDE's K for new players), 8 once settled
before an answer:  idle = whole days since this skill's last scored answer
                   if idle >= 2:  u = min(1, u + (idle - 1) / 30)
after an answer:   u = max(0, u - w / 40)          w = the answer's evidence weight (§2.5)
```

- This is Math Garden's rule, uncertainty starting at 1 and updated by −1/40 per answer and +1/30 per day
  since the previous attempt, as quoted in
  [Pelánek 2016](https://www.fi.muni.cz/~xpelanek/publications/CAE-elo.pdf) §2.3 from Klinkenberg et al. 2011.
  The only change is that a one-day gap is free, so studying every other day does not unsettle the rating.
- Pelánek reviews the alternatives: a count-based decay `U(n) = a / (1 + b·n)` (a = 1, b = 0.05 in his
  geography system) and the Bayesian [Glicko](https://en.wikipedia.org/wiki/Glicko_rating_system), whose rating
  deviation grows with inactivity as `RD = min(sqrt(RD0² + c²·t), 350)`. He notes Glicko is hard to combine
  with the guessing-corrected formula and that simple uncertainty functions do about as well. I kept the
  Math Garden form because it has the one property the count-based form lacks: **a break makes the rating
  move faster again**, which is what a rusty learner needs.
- Inactivity raises `u` only. It never lowers the rating by itself, because not practising is not evidence of
  how much you forgot. The first few answers after a break decide that, at a higher K.
- K never falls below 8, so the rating can always follow real learning. At K = 8 the rating of a learner whose
  ability is not changing wobbles with a standard deviation of about 22 points (simulation, §2.7). Treat
  anything under ±25 in a day as noise.

### 2.5 Evidence weight and protection against farming

The update for the answered skill is:

```
delta = K(u) * w * (S - expected(r, d + offset_i, k))        r = clamp(r + delta, 100, 1600)
```

`w` is how much the answer proves. An answer given seconds after the app showed you the word proves almost
nothing; the same answer a day later proves a lot.

| Context `ctx` | `w` | When |
|---|---|---|
| `fresh` | 0.25 | the item's card was shown or rated less than 20 minutes ago (lesson quick checks, same-session repeats) |
| `session` | 0.6 | 20 minutes to 20 hours ago; also a grammar unit's drills right after its explanation |
| `delayed` | 1.0 | 20 hours or more, or never seen (reviews, cold items, first attempt at a prompt or reading) |
| `repeat` | 0.5 | a prompt, story or reading you have completed before, on a later day |

Then the multipliers of §2.3 (self-rated 0.5, unsure 0.75), then these guards:

1. **Retries score nothing.** An exercise re-queued after a miss ("Once more:") has `w = 0`.
2. **Once per day per item and exercise type.** A second answer to the same item with the same `exType` on the
   same day has `w = 0`. A different `exType` on the same item later that day is forced to `fresh`. After five
   scored answers to one item in a day, the rest score nothing.
3. **Easy items give nothing.** If your rating is 400 or more above the item (expected ≥ 98.9%), a correct
   answer changes nothing at all. A miss on such an item still counts in full: missing something you have
   supposedly mastered is real information.
4. **The formula itself.** Below that margin a correct answer still earns only `K × (1 − expected)`: 0.8 of a
   point at K = 8 on an item at your own level, 4.2 on an item 400 above you.
5. **Retention, not exposure.** Because of the `fresh` weight, a new lesson's 30-odd answers move the rating
   by about as much as eight answers in tomorrow's review.

### 2.6 Do item ratings adapt?

**Fixed by formula, plus a small personal offset per word or phrase.**

- Pelánek's systems estimate item difficulty from thousands of learners. This app has one learner, so an item
  rating learned from your answers would mostly measure your memory of that item, and the scale would drift
  with you. The formula keeps the scale anchored to frequency and course order.
- The formula is wrong about individual items, though: *hotel* is free for an English speaker, and some word
  will always refuse to stick. So each word or phrase carries `offset_i`, updated with the mirror image of
  your own update, `offset_i -= 12 * w * (S − expected)`, and clamped to **±100**. Missing an item makes it a
  little harder for you (the next miss costs less); always getting it right makes it a little easier (the next
  success earns less). One stubborn word cannot drag the rating down forever, and one easy cognate cannot be
  milked.
- Grammar drills, prompts, stories, readings and chat turns have no offset. They are answered too rarely for
  one to mean anything.

### 2.7 Sanity check by simulation

A simulated learner knows the first N course words, answers recognition questions on them with 90% accuracy,
and is tested half uniformly and half on recent words (as spaced repetition does). After 6,000 answers:

| N words known | Vocabulary rating (model) | Rule of §1.1 | Production rating if they can type the top N/2 at 85% |
|---|---|---|---|
| 100 | 216 | 227 | 359 |
| 300 | 520 | 508 | 514 |
| 1,000 | 928 | 934 | 912 |
| 2,000 | 1154 | 1211 | 1071 |
| 3,022 | 1382 | 1382 | 1304 |

So the Elo process lands on the vocabulary rule to within about 60 points, and "can type half of what you
recognise" gives Production ≈ Vocabulary from 300 words up. Testing purely uniformly gives 40–130 points less,
and 80% accuracy instead of 90% gives about 70–210 less. At equilibrium with K = 8 the rating's standard deviation
was 22 points. These are properties of the model, not measurements of a real learner; the reference script is
not part of the repo.

---

## 3. Sub-ratings

Shown like chess time controls (bullet / blitz / rapid), each with its own number, band colour and
provisional mark:

| Sub-rating | Label on the page | Fed by | Weight in overall |
|---|---|---|---|
| `vocab` | Vocabulary | see or pick: `recognise-choice`, `recognise-flash`, `produce-choice` | 0.20 |
| `listening` | Listening | every audio-only exercise, including natural speed and the sound-rule drills | 0.25 |
| `production` | Speaking & writing | typed Spanish: `produce-type`, `cloze`, `tiles`, `build-type`, Speak prompts, stories | 0.25 |
| `grammar` | Grammar | grammar drills and `gender` | 0.10 |
| `reading` | Reading | reading sentences (self-marked) | 0.10 |
| `conversation` | Conversation | chat turns | 0.10 |

Example line on Home: **Listening 640 · Speaking & writing 310**.

**Overall**

```
M       = weighted mean of the sub-ratings, over those with at least one scored answer
          (Listening and Production are always included, at 100 if untouched)
overall = 0.75 * M + 0.25 * min(Listening, Production)
then:     if fewer than 20 free-production answers, overall = min(overall, 899)      (B1 gate, §1.4)
          overall = clamp(round(overall), 100, 1400)
```

Why this and not a plain average or a strict weakest link:

- **Not a plain average.** Your own definition of the scale is about speaking ("can really speak", "can get
  creative"). A learner with Vocabulary 1200 and Production 400 cannot hold an 800-level conversation, and a
  plain mean would say they can.
- **Not a strict minimum.** The weakest sub-rating is also the noisiest one, and a rating that only ever
  reports your worst skill is demoralising and jumpy. The Duolingo English Test, at the other extreme, simply
  averages its four subscores
  ([DET scoring guide](https://englishtest-static.duolingo.com/media/resources/DET_Scoring%20Guide%20for%20Teachers%20(2026).pdf)).
- **The compromise.** Three quarters is the weighted mean; one quarter is the weaker of the two halves of a
  conversation, understanding and producing. With the example above (Vocabulary 600, Listening 640,
  Production 310, Grammar 500) the mean is 509 and the overall is **460**. Raising Production by 100 lifts the
  overall by about 48; raising Vocabulary by 100 lifts it by about 19. The number tells you what to work on.
- Reading and Conversation join the mean once they have a scored answer. Until then they show as "unrated"
  rather than dragging the mean to 100.

---

## 4. Bootstrapping and the provisional period

### 4.1 From existing progress

There is no per-answer log, so the first run rebuilds the minimum history the saved counters imply and plays
it through the normal update (`boot: true` skips the per-day guards and the idle rule):

| Saved data | Replayed as |
|---|---|
| `recog[id]` (correct recognitions), up to 4 per item | alternating `recognise-choice` and `listen-meaning`, `good`, `ctx: fresh` (they were lesson quick checks) |
| `cards[id].ok` (successful scheduled reviews), up to 6 | cycling `hear-flash`, `listen-meaning`, `recognise-flash` (the review page's own order), `good`, `ctx: delayed` |
| `cards[id].lapses`, up to 3 | `hear-flash`, `miss`, `ctx: delayed` |
| `cards[id].unsure`, up to 3 | `recognise-choice`, `unsure`, `ctx: session` |
| `grammar[g].best` | one `grammar-fill` event with `S = best` and `w = 4` (about eight drills right after the explanation) |
| `prompts[p]` | one `prompt` event with the stored `outcome` and `best` as the score |
| `readings[r].marks[i]` | one `read-sentence` event per mark |
| `stories`, `sounds`, `chats`, `days` | not replayed: they record completion or counts, not how well it went |

Exact order, so the result is reproducible: items by `learned[id]` ascending (ties by id); for each item its
`recog` events, then its `ok` events, then lapses, then unsures; then grammar units by `order`; then prompts in
course order; then reading marks in course and sentence order. Every replayed word or phrase event passes
`nChoices: 4` for the two choice types and 0 for the flash types. Afterwards every sub-rating's `u` is raised
to at least 0.5, so the result stays provisional and real answers correct it quickly.

For the current save (22 learned items, the first two lessons), a run with two recognitions and one successful
review per item gives **Vocabulary 128, Listening 203, everything else 100, overall about 130**. That is the
honest answer to "I'm currently a 100-rated player": yes, about that, Primeras palabras, with the first
points already on the board. The exact figure depends on the real counters.

### 4.2 Provisional

- A sub-rating is **provisional while `u > 0.25`**. From new, that is 30 full-weight answers.
- The overall is provisional while any of Vocabulary, Listening or Production is.
- Display: the number with a question mark and a countdown, chess-style: **"152? · provisional, about 37 more
  answers to settle"**. The countdown is `sum over the three core skills of ceil(max(0, u − 0.25) × 40)`, in
  full-weight answers; lesson quick checks count a quarter each, so say "about".
- Provisional ratings draw as a dashed line on the chart, earn no band badges, and are not forecast from.
- After a break of more than about nine idle days a settled rating becomes provisional again ("rusty: the
  next few answers count more").
- The error bar shown next to any rating is `± (40 + 160 × u)`: ±200 new, ±80 at the provisional line, ±40
  settled. It is a display convention, not a confidence interval.

---

## 5. Tracking over time

### 5.1 What to store

One compact snapshot per day on which anything was answered (about 120 bytes; a year is under 50 KB):

```
rating.days["2026-11-11"] = {
  r:  152,                          // overall, as displayed
  s:  [128, 203, 100, 100, 100, 100],  // vocab, listening, production, grammar, reading, conversation
  pv: 1,                            // 1 while provisional
  n:  64,                           // answers given
  ok: 55,                           // of which good
  ms: 1260000,                      // active time, ms (gaps between answers, each capped at 2 minutes)
  kn: [22, 0, 0, 0, 0, 0],          // items known, by item tier 1-6 (words and phrases)
  mat: 0,                           // of which mature (review interval >= 21 days)
  vs: null                          // vocabulary size from the latest check-up plus words known since, or null
}
```

"Known" = the item has a card with `reps >= 1` and `ivl >= 1`: it has survived at least one scheduled review
since its last lapse.

### 5.2 The Progress page, top to bottom

1. **Rating header.** The overall number, large; band name and CEFR-ish tag; "?" and the countdown while
   provisional; the ± range; change over 7 and 30 days; peak rating with its date (chess players like a peak).
2. **Rating history.** A line of the overall by day over horizontal band shading (the nine bands as faint
   stripes, labelled on the right edge). Dashed while provisional. A dotted line at 1400 labelled "measured up
   to here" with the §1.4 reason on hover. Check-ups appear as markers. Range buttons: 30 days / 90 days / all.
   Sub-ratings can be switched on as thin lines, off by default.
3. **Sub-ratings.** Six horizontal bars on the same 100–1600 axis, each with its number, its ± whisker and
   "unrated" where there is no evidence. The bar that is holding the overall back (the lower of Listening and
   Production) is marked "your limiter".
4. **Words.** Known items against the course total: one stacked bar per tier 1–6 (known / learning / not
   started), a headline "412 of 3,022 words · 96 of 586 phrases", and a small line of the total by day. If a
   check-up exists: "Estimated vocabulary ≈ 520 (check-up, 3 Nov)".
5. **Activity.** A calendar heatmap (one square per day, shaded by answers), current and longest streak,
   minutes this week, 30-day accuracy.
6. **Forecast.** One sentence: "At your pace over the last four weeks (+4.2 a day) you reach 600, Viajero,
   around 18 January (between 4 Jan and 9 Feb)." Method: least-squares slope of the daily overall over the
   last 28 calendar days, using non-provisional days only, at least 7 of them; the range uses slope ± one
   standard error; no forecast if the slope is under 0.2 a day, and "more than a year at this pace" beyond 365
   days. Forecast only the next band: each band needs about twice the words of the one before, so a straight
   line is honest for one band and fiction for three. Under it, the standing reminder: "FSI budgets 600–750
   class hours for Spanish to reach professional level (about 1800–2000 here)."
7. **Badges.**
   - Band crossings, overall and per sub-rating: awarded when the non-provisional rating has been at or above
     the threshold at the end of three active days in a row. Never taken away; the page shows current band
     and highest band separately.
   - Words known: 100, 250, 500, 1,000, 2,000, 3,022.
   - First scored chat turn; first story written; first reading finished.
   - "Matagigantes" (giant-killer): first delayed correct answer on an item rated 300 or more above you.
   - Streaks of 7, 30 and 100 days; a new peak rating.
8. **Check-up card.** Last result and date, a "Take the 5-minute check-up" button, and a nudge when the last
   one is more than 30 days old.
9. **What this number is and isn't** (§7).

### 5.3 The check-up (placement and monthly calibration)

Thirty items, about five minutes, optional. It measures vocabulary size directly by sampling, so it does not
depend on the shape of the model, and it includes words the course has not taught yet, which is the only way
the app can notice what you know from elsewhere (cognates, Mexico).

**Pool and bands.** Single words only (`COURSE.vocab`, sorted by rank), cut into nine bands by position:

| Band | Positions | Ranks today | Width `W` |
|---|---|---|---|
| 0 | 1–125 | 1–115 | 125 |
| 1 | 126–250 | 115–280 | 125 |
| 2 | 251–500 | 280–600 | 250 |
| 3 | 501–750 | 600–983 | 250 |
| 4 | 751–1000 | 1000–1300 | 250 |
| 5 | 1001–1500 | 1300–2000 | 500 |
| 6 | 1501–2000 | 2000–2600 | 500 |
| 7 | 2001–2500 | 2600–3500 | 500 |
| 8 | 2501–3022 | 3500–6000 | 522 |

**Three strands, interleaved** (V, V, L, P, V, V, L, P, …):

| Strand | Items | Format | Rating offset |
|---|---|---|---|
| V | 14 | see the word, pick the meaning (4 options + Not sure) | 0 |
| L | 8 | hear the word at careful speed, text hidden, pick the meaning (4 options + Not sure) | +50 |
| P | 8 | see the English, type the Spanish | +250 |

**Staircase, per strand.**

1. Start in the band containing position `clamp(round(ratingToVocab(r_skill − offset)), 1, 3022)`.
2. Draw a random word from the current band that has not been used in this check-up and was not answered in
   the last 72 hours (drop the 72-hour rule if the band runs out). Taught and untaught words are both eligible.
3. Correct → next item one band up. Wrong or Not sure → one band down. Typed `close` → stay. Clamp to 0–8.
4. Show right or wrong, nothing else. Do not touch the review schedule. At the end, offer the missed words as
   "+ review".

A one-up/one-down staircase spends its items around the band where you flip from knowing to not knowing,
which is where the information is.

**Vocabulary size from the sampled bands.** For each strand and band, with `n` items asked, `C` correct,
`X` wrong (Not sure is neither) and `k` options (4, or 0 for typed):

```
c'      = max(0, C - X / (k - 1))            classic correction for guessing; c' = C when typed
prior   = 0.9 * (known course words in the band / words in the band)      for P: half of that
p_band  = (c' + 2 * prior) / (n + 2)         unsampled band: n = 0, so p_band = prior
size    = sum over bands of  W * p_band
se      = sqrt( sum over bands of  W^2 * p_band * (1 - p_band) / (n + 2) )
```

The prior is what your review deck already says, worth two answers. It fills the bands the staircase never
visited (far below your level: known; far above: not) without letting 14 answers be overruled by it. This is
the X-Lex idea, sampling frequency bands and scaling each band's hit rate by its size
([Milton & Alexiou 2010](https://www.enl.auth.gr/gala/14th/Papers/English%20papers/Milton&Alexiou.pdf)), with
guess-corrected multiple choice in place of X-Lex's pseudo-words.

Worked example (V strand): 2/2 in band 0, 3/3 in band 1, 3 right and 1 wrong of 4 in band 2, 1 right and 1
wrong of 3 in band 3, 0 right and 1 wrong of 2 in band 4; deck priors 0.90, 0.72, 0.20, 0, 0. Then
`p = 0.95, 0.888, 0.511, 0.133, 0`, **size = 391 words, se = 67**, reported as "about 390 (260–520) of the
course's 3,022 words", and the test rating is `vocabToRating(391) = 593`.

**Applying it.**

```
T_strand = vocabToRating(size_strand) + offset_strand
r_skill  = r_skill + lambda * (T_strand - r_skill)       V -> vocab, L -> listening, P -> production
lambda   = 1.0 for a first check-up taken with fewer than 40 scored answers in that skill (placement)
           0.5 otherwise
u_skill  = min(u_skill, 0.25)  after a normal check-up;  0.5 after a placement
```

Check-up answers are not also fed through the per-answer update. A check-up counts toward the rating at most
once every 7 days; extra ones are shown as "practice check-up, not counted". Grammar, Reading and Conversation
are not in the check-up: the course's own drills, readings and chats measure them, and adding them would
double its length.

**Words beyond the course.** The course has nothing above rank 6,000, so the check-up can only say "at least
N of these 3,022". If a wider frequency list with glosses is ever added (say a sample from ranks 6,001–20,000),
append bands for it with their true widths; the algorithm and the formulas do not change, and the caps in
§1.4 can then rise with the evidence.

---

## 6. Data contract for the coding agent

New file `web/js/rating.js`, global `window.Rating`, plain JS, no dependencies, loaded after `store.js` and
`util.js`. Every function except `init`, `record` and `bootstrap` is pure: it reads only its arguments and
`Rating`'s own index, never `Date.now()`, `Store` or the DOM. `update` mutates only `state.rating`.

### 6.1 State additions

`fresh()` in `store.js` gains `rating: null`. `Rating.bootstrap` fills it on first run.

```js
state.rating = {
  v: 1,
  skills: {                       // keys in this order everywhere: vocab, listening, production, grammar, reading, conversation
    vocab:        { r: 100, u: 1, n: 0, last: 0 },   // r rating (1 decimal), u uncertainty 0..1, n weighted answers, last ms of last scored answer
    listening:    { r: 100, u: 1, n: 0, last: 0 },
    production:   { r: 100, u: 1, n: 0, last: 0 },
    grammar:      { r: 100, u: 1, n: 0, last: 0 },
    reading:      { r: 100, u: 1, n: 0, last: 0 },
    conversation: { r: 100, u: 1, n: 0, last: 0 }
  },
  freeN: 0,                       // scored prompt / story-beat / story-all / chat-turn answers (B1 gate)
  off: {},                        // itemId -> personal offset, -100..100, 1 decimal; key deleted when 0
  today: { day: "", seen: {}, n: 0, ok: 0, ms: 0, lastTs: 0 },   // seen: key -> [exType, ...]; reset when the day changes
  days: {},                       // "YYYY-MM-DD" -> { r, s:[6 ints], pv:0|1, n, ok, ms, kn:[6 ints], mat, vs }
  peak: { r: 100, day: "" },      // highest non-provisional overall
  badges: {},                     // badgeId -> "YYYY-MM-DD" first earned
  checkups: [],                   // newest last, keep 24: { day, counted, size:[V,L,P], se:[V,L,P], t:[V,L,P], before:[v,l,p], after:[v,l,p] }
  boot: 0                         // ms when bootstrap ran
};
```

`Store.merge`: `rating` is not in `mapKeys`, so the newer blob's copy already wins. Add: `days` is unioned and,
for a day present in both, the entry with the larger `n` wins; `badges` is unioned keeping the earlier date;
`checkups` is unioned by `day`. Day keys use `App.dayKey(new Date(ts))` (local time).

### 6.2 Constants

```js
Rating.C = {
  START: 100, FLOOR: 100, CAP_SKILL: 1600, CAP_OVERALL: 1400,
  GATE_B1: 899, GATE_FREE_N: 20,
  PAR_ODDS: 9, SCALE: 400,                     // expected = 9 / (9 + 10^((d - r)/400))
  BASE_P0: 120, BASE_C: 1965,                  // base(p) = 1000*log10(p + 120) - 1965
  VOCAB_C: 2115,                               // vocabToRating(V) = 1000*log10(V + 120) - 2115
  TIER_RANK_CAP: [500, 1000, 1500, 2000, 2500, Infinity],   // by teaching unit's tier 1..6
  LEN_PER_WORD: 30, LEN_MAX: 120,
  K_MIN: 8, K_MAX: 40, N_SETTLE: 40, IDLE_DAYS: 30, IDLE_FREE: 1, U_PROV: 0.25,
  CTX: { fresh: 0.25, session: 0.6, delayed: 1.0, repeat: 0.5 },
  FRESH_MS: 20 * 60 * 1000, SESSION_MS: 20 * 60 * 60 * 1000,
  SELF_W: 0.5, UNSURE_W: 0.75, MAX_PER_KEY_DAY: 5,
  FARM_MARGIN: 400,
  K_ITEM: 12, OFF_MAX: 100,
  S_SLIP: 0.9, S_CLOSE_MIN: 0.5, S_CLOSE_MAX: 0.7, S_FLASH_HARD: 0.6, S_PARTLY: 0.5,
  CHAT_S: { clean: 1.0, corrected: 0.7, mixed: 0.4, english: 0 }, CHAT_MIN_WORDS: 3,
  SKILLS: ["vocab", "listening", "production", "grammar", "reading", "conversation"],
  WEIGHTS: { vocab: 0.20, listening: 0.25, production: 0.25, grammar: 0.10, reading: 0.10, conversation: 0.10 },
  MEAN_SHARE: 0.75,                            // overall = 0.75*mean + 0.25*min(listening, production)
  EX: {                                        // exType -> [skill, offset, addLength, selfRated]
    "recognise-choice":       ["vocab", 0, false, false],
    "recognise-flash":        ["vocab", 25, false, true],
    "produce-choice":         ["vocab", 150, false, false],
    "listen-choice":          ["listening", 25, false, false],
    "listen-meaning":         ["listening", 50, false, false],
    "hear-flash":             ["listening", 75, false, true],
    "listen-natural-meaning": ["listening", 125, false, false],
    "listen-type":            ["listening", 200, true, false],
    "listen-natural":         ["listening", 300, true, false],
    "gender":                 ["grammar", 150, false, false],
    "tiles":                  ["production", 175, false, false],
    "cloze":                  ["production", 200, false, false],
    "produce-type":           ["production", 250, true, false],
    "build-type":             ["production", 250, true, false]     // length of item.ex_es
  },
  G_BASE: 150, G_STEP: 22,                     // G(order) = 150 + 22*order
  GRAMMAR_OFF: { "grammar-choice": 0, "grammar-fill": 100, "grammar-transform": 150, "grammar-translate": 200 },
  SOUND_PICK: 280, SOUND_TYPE: 480, SOUND_STEP: 15,
  PROMPT_OFF: 175, PROMPT_LEN: 5, PROMPT_LEN_FROM: 5, PROMPT_LEN_MAX: 75,
  STORY_BEAT_OFF: 225, STORY_ALL_OFF: 300,
  READ_BASE: 150, READ_TIER: 200, READ_LEN: 8, READ_LEN_FROM: 12, READ_LEN_MIN: -50, READ_LEN_MAX: 80,
  CHAT_D: [700, 925, 1150],                    // chat level 1, 2, 3
  BANDS: [                                     // lo inclusive
    { lo: 100,  id: "primeras",      name: "Primeras palabras", cefr: "pre-A1" },
    { lo: 300,  id: "turista",       name: "Turista",           cefr: "A1" },
    { lo: 600,  id: "viajero",       name: "Viajero",           cefr: "A2" },
    { lo: 900,  id: "platicador",    name: "Platicador",        cefr: "B1" },
    { lo: 1200, id: "independiente", name: "Independiente",     cefr: "B1+" },
    { lo: 1500, id: "fluido",        name: "Fluido",            cefr: "B2" },
    { lo: 1800, id: "avanzado",      name: "Avanzado",          cefr: "C1" },
    { lo: 2100, id: "maestro",       name: "Maestro",           cefr: "C2" },
    { lo: 2400, id: "nativo",        name: "Nativo",            cefr: "native" }
  ],
  CHECKUP: { V: 14, L: 8, P: 8, OFFSET: { V: 0, L: 50, P: 250 }, PRIOR_N: 2, PRIOR_KNOWN: 0.9, PRIOR_P_SHARE: 0.5,
             BAND_HI: [125, 250, 500, 750, 1000, 1500, 2000, 2500, Infinity], AVOID_MS: 72 * 3600 * 1000,
             LAMBDA: 0.5, PLACEMENT_N: 40, U_AFTER: 0.25, U_AFTER_PLACEMENT: 0.5, MIN_GAP_DAYS: 7 },
  FORECAST: { WINDOW_DAYS: 28, MIN_DAYS: 7, MIN_SLOPE: 0.2, MAX_DAYS: 365 },
  ERR_BASE: 40, ERR_U: 160                     // displayed +/- = 40 + 160*u
};
```

### 6.3 Functions

```js
Rating.init(course)
// Builds the index once at startup: sorted vocab ranks (for pos), itemId -> teaching unit tier (first unit whose
// "learn" step lists the item), grammarId -> order, soundRuleId -> index in course.sounds.

Rating.pos(rank)                 // -> count of course.vocab entries with rank <= rank, at least 1
Rating.base(p)                   // -> 1000 * Math.log10(p + 120) - 1965          (not rounded)
Rating.vocabToRating(V)          // -> 1000 * Math.log10(V + 120) - 2115
Rating.ratingToVocab(r)          // -> Math.pow(10, (r + 2115) / 1000) - 120
Rating.words(text)               // -> number of whitespace-separated tokens containing a letter, after removing "___"

Rating.itemDifficulty(item, exType)   // -> integer
// item is a course word/phrase, or a descriptor:
//   { kind: "grammar", order }            exType "grammar-choice" | "grammar-fill" | "grammar-transform" | "grammar-translate"
//   { kind: "sound",   idx, words }       exType "sound-pick" | "sound-type"        (words = Rating.words(drill.answer))
//   { kind: "prompt",  order, words }     exType "prompt"                           (words = Rating.words(prompt.models[0]))
//   { kind: "story",   order }            exType "story-beat" | "story-all"
//   { kind: "reading", tier, words }      exType "read-sentence"
//   { kind: "chat",    level }            exType "chat-turn"
// Words and phrases (exType in C.EX):
//   p = item.p if present, else Rating.pos(Math.min(item.rank, TIER_RANK_CAP[unitTier - 1])) (no cap if the item is in no lesson)
//   d = base(p) + offset + (addLength ? Math.min(120, 30 * Math.max(0, words - 1)) : 0)
//       words = Rating.words(exType === "build-type" ? item.ex_es : item.es)
// Others: the formulas of section 2.2. Always Math.round at the end.

Rating.skillOf(exType)           // -> skill id (C.EX, "grammar-*" -> grammar, "sound-*" -> listening,
                                 //    prompt/story-* -> production, read-sentence -> reading, chat-turn -> conversation)

Rating.expected(r, d, nChoices)  // -> s = 9 / (9 + Math.pow(10, (d - r) / 400)); g = nChoices >= 2 ? 1 / nChoices : 0; g + (1 - g) * s

Rating.kFactor(u)                // -> 8 + 32 * u

Rating.score(event)              // -> { S, mul }
// outcome "good": S = event.slip ? 0.9 : 1         "close": S = clamp(event.score, 0.5, 0.7)
// "miss": S = 0        "unsure": S = nChoices >= 2 ? 1/nChoices : 0, mul = 0.75        "score": S = event.score (already 0..1)

Rating.ctxFor(state, itemId, ts) // -> "fresh" | "session" | "delayed"
// last = state.cards[itemId] ? state.cards[itemId].last : 0;  no last -> "delayed";
// ts - last < FRESH_MS -> "fresh";  < SESSION_MS -> "session";  else "delayed".  Call it BEFORE Store.rate changes card.last.

Rating.update(state, event)      // mutates state.rating; returns the result object below
// event = {
//   ts,                       // ms
//   exType,                   // see above
//   item,                     // course item or descriptor   (or give d directly: event.d)
//   outcome,                  // "good" | "close" | "miss" | "unsure" | "score"
//   score,                    // grader score 0..1 (close), or S itself when outcome is "score"
//   slip,                     // true when a "good" answer carries a grammar note
//   nChoices,                 // options shown, 0 if not multiple choice
//   ctx,                      // "fresh" | "session" | "delayed" | "repeat"   (default "delayed")
//   w,                        // optional: replaces the ctx weight (bootstrap only)
//   key,                      // dedupe key; defaults to item.id.  Use "g_ser#3", "s_apocope#1", "p_order_tacos", "st_icaro#2", "rd_el_taxi#4"; chat turns: none
//   retry,                    // true for a re-queued "Once more" exercise
//   selfRated,                // optional override of C.EX[exType][3]; read-sentence is always self-rated
//   boot                      // true during bootstrap: skip steps 2 and 3
// }
// Steps, in this order:
//  1. skill = skillOf(exType); sk = rating.skills[skill]; d = event.d ?? itemDifficulty(item, exType);
//     off = rating.off[item.id] || 0 (words and phrases only); dEff = d + off; {S, mul} = score(event)
//     w = (event.w ?? C.CTX[ctx]) * (selfRated ? 0.5 : 1) * mul
//  2. Day guard: if rating.today.day !== dayKey(ts), reset today. seen = today.seen[key] || [].
//     if (event.retry || seen.includes(exType) || seen.length >= 5) w = 0;
//     else if (seen.length) w = C.CTX.fresh * (selfRated ? 0.5 : 1) * mul;
//     then add exType to seen (if key).  today.n += 1; if outcome is "good", today.ok += 1;
//     if (today.lastTs) today.ms += Math.min(ts - today.lastTs, 120000); today.lastTs = ts.
//  3. Idle: if (sk.last) { idle = Math.floor((ts - sk.last) / 86400000); if (idle >= 2) sk.u = Math.min(1, sk.u + (idle - 1) / 30); }
//  4. E = expected(sk.r, dEff, nChoices); K = kFactor(sk.u)
//  5. counted = w > 0 && !(sk.r - dEff >= 400 && S >= E)
//  6. if counted:  sk.r = round1(clamp(sk.r + K * w * (S - E), 100, 1600));  sk.u = Math.max(0, sk.u - w / 40);  sk.n += w;
//                  words and phrases: off = round1(clamp(off - 12 * w * (S - E), -100, 100)); store, or delete the key when 0
//                  if exType is prompt, story-beat, story-all or chat-turn: rating.freeN += 1
//  7. sk.last = Math.max(sk.last, ts)
//  8. refresh rating.days[day] (r, s, pv, n, ok, ms) and rating.peak
// returns { skill, d, dEff, E, S, w, K, delta, before, after, counted, overallBefore, overallAfter }

Rating.overall(rating)           // -> integer, section 3 (mean over skills with n > 0, listening and production always; gate; cap)
Rating.provisional(rating)       // -> { provisional, answersLeft, skills: {id: bool} }
                                 //    answersLeft = sum over vocab, listening, production of Math.ceil(Math.max(0, u - 0.25) * 40)
Rating.errorBar(u)               // -> Math.round(40 + 160 * u)
Rating.band(r)                   // -> { index, id, name, cefr, lo, hi, next }   hi = next band's lo - 1 (Infinity for the last); next = next band's lo or null
Rating.known(card)               // -> !!card && card.reps >= 1 && card.ivl >= 1
Rating.snapshot(state, day)      // -> { r, s, pv, n, ok, ms, kn, mat, vs }  (section 5.1); n, ok, ms from rating.today when day is today,
                                 //    else from the stored entry; kn/mat from state.cards and the items' own tier; does not write
Rating.forecast(days, target, today)   // -> { days, date, lo, hi, perDay } | null   (section 5.2 item 6); days = rating.days
Rating.bootstrap(state, course)  // builds state.rating from saved progress (section 4.1); idempotent: does nothing if state.rating exists
Rating.record(ex, res, extra)    // the one impure convenience: builds the event from an App.exercise and calls update + Store.save

Rating.checkup = {
  bandOf(p),                                   // -> 0..8
  start(rating, strand),                       // -> starting band
  next(band, outcome),                         // -> next band: good +1, close 0, miss/unsure -1, clamped 0..8
  estimate(obs, prior, k),                     // obs: {band: {n, c, x}}, prior: [9 numbers], k: 4 or 0 -> { size, se, p: [9] }
  apply(state, result, ts)                     // result: {V: {size, se}, L: {...}, P: {...}}; blends and logs (section 5.3)
};
```

### 6.4 Where the engine calls it

| Place | Call |
|---|---|
| `App.makeExercise` (`widgets.js`) | stamp `ex.exType = type` (the actual type: a `cloze` that falls back becomes `produce-type`) |
| `App.grammarDrillExercises`, `App.soundDrills`, `App.buildExercise` and the "Type it too" exercise (`lesson.js`, `widgets.js`) | stamp `ex.exType` (`grammar-<type>`, `sound-pick` / `sound-type`, `tiles`, `build-type`), `ex.ref` (the descriptor) and `ex.key`. Grammar and sound drills run inside a lesson step, right after the explanation, use `ctx: "session"`; run from the Grammar or Sounds page on a later day they use `"delayed"` |
| `App.exercise`, in `finish(res)` for choice / type / tiles, and when a flash card is rated | `Rating.record(ex, res, { retry: ex.retry })`. Flash: easy or good → `good`; hard → `close` with score 0.6; again → `miss` |
| Review page (`pages.js`) | nothing extra, but `Rating.record` must run before `Store.rate` (it reads `cards[id].last`). Use the grader's outcome, not the SRS button the learner picks |
| `App.promptView` check (`practice.js`) | `exType: "prompt"`, outcome and score from `gradeFree`, `slip: r.grammarSlips > 0`, `ctx: "repeat"` if `state.prompts[id]` existed before today |
| Story beat "Check" and "Check my story" (`practice.js`) | `story-beat` with key `storyId#beatIndex`, `story-all` with key `storyId` |
| Reading `mark(k)` (`reading.js`) | `read-sentence`, got → `good`, partly → `close` with score 0.5, missed → `miss`, unsure → `unsure`; `ctx: "repeat"` when `runs >= 1` |
| Chat `doSend`, after the reply arrives (`chat.js`) | `chat-turn` with `outcome: "score"` and `score` from `C.CHAT_S`; skip short turns and unedited suggestion chips |
| App start (`app.js`) | `Rating.init(COURSE)`, then `Rating.bootstrap(Store.state, COURSE)` after `Store.connect()` has merged |

Mic "Say it" results and the optional AI coach are not scored.

### 6.5 Unit tests

Tolerance: ±0.05 on ratings after one update, ±0.1 after a sequence, ±0.001 on `u`, ±0.00001 on expected
scores. `T0` is any timestamp at local noon. "Fresh" means a new `state.rating`. Tests that set a skill give
`{r, u, n, last}`; unless stated `last = T0 − 1 hour`. Where an event gives `d` directly it also gives a `key`
and no `item`.

| # | Call | Expect |
|---|---|---|
| 1 | `base(1)`, `base(3)`, `base(187)`, `base(3022)` | 117.8, 124.9, 522.1, 1532.2 |
| 2 | `itemDifficulty({p:3, es:"Gracias"}, x)` for `recognise-choice`, `listen-meaning`, `produce-choice`, `produce-type` | 125, 175, 275, 375 |
| 3 | `itemDifficulty({p:187, es:"Me gustaría ___"}, "produce-type")` | 802 |
| 4 | `itemDifficulty({p:144, es:"¿Qué onda?"}, x)` for `listen-natural-meaning`, `listen-natural` | 582, 787 |
| 5 | `itemDifficulty({p:134, es:"casa"}, x)` for `recognise-choice`, `gender`, `cloze`, `produce-type` | 440, 590, 640, 690 |
| 6 | grammar: order 2 `grammar-choice`; order 27 `grammar-fill`; order 32 `grammar-translate` | 194, 844, 1054 |
| 7 | `{kind:"prompt", order:6, words:7}` `prompt`; `{kind:"story", order:27}` `story-beat`, `story-all`; `{kind:"reading", tier:1, words:10}`; `{kind:"chat", level:2}`; `{kind:"sound", idx:0}` `sound-pick`; `{kind:"sound", idx:0, words:2}` `sound-type` | 467; 969, 1044; 334; 925; 280; 510 |
| 8 | `expected(500,500,0)`, `(500,900,0)`, `(500,500,4)`, `(100,500,4)`, `(900,500,0)`, `(300,500,2)` | 0.9, 0.47368, 0.925, 0.60526, 0.98901, 0.87 |
| 9 | `kFactor(1)`, `(0.5)`, `(0.25)`, `(0)` | 40, 24, 16, 8 |
| 10 | Fresh. `update` `recognise-choice`, item `{id:"v_x", p:3}`, `good`, `nChoices:4`, `delayed` | E 0.91471, delta +3.41, vocab r 103.4, u 0.975, n 1, `off.v_x` −1.0 |
| 11 | production `{r:500, u:0.5}`. `produce-type`, `d:500`, `miss`, `delayed` | E 0.9, K 24, delta −21.6, r 478.4, u 0.475 |
| 12 | production `{r:500, u:0.5}`. `produce-type`, item `{id:"v_y", p:173, es:"casa"}`, `miss`, `delayed` | d 752, E 0.67844, r 483.7, `off.v_y` +8.1 |
| 13 | vocab `{r:500, u:0.25}`. `recognise-choice`, `d:500`, `unsure`, `nChoices:4`, `delayed` | S 0.25, w 0.75, E 0.925, delta −8.1, r 491.9, u 0.23125 |
| 14 | production `{r:600, u:0.5}`. `produce-type`, `d:700`, `close`, `score:0.62`, `session` | E 0.83501, w 0.6, delta −3.10, r 596.9 |
| 15 | vocab `{r:900, u:0.1}`. `recognise-choice`, `d:450`, `good`, `nChoices:4`, `delayed` | counted false, r 900, u 0.1 unchanged |
| 16 | Same as 15 but `miss` | E 0.99380, K 11.2, delta −11.13, r 888.9 |
| 17 | vocab and listening `{r:300, u:0.5}`, item `{id:"v_z", p:200}`. (a) `recognise-choice` good k4 at T0; (b) the same again at T0+1 min; (c) `listen-meaning` good k4 at T0+2 min; (d) `produce-choice` miss with `retry:true` at T0+3 min | (a) d 540, vocab 305.5; (b) w 0, unchanged; (c) w 0.25, listening 301.7; (d) w 0, unchanged. End: `off.v_z` −3.6, `today.seen.v_z` has 3 entries |
| 18 | listening `{r:640, u:0.1, last: T0 − 20 days − 5 s}`. `listen-meaning`, `d:600`, `good`, `nChoices:4`, `delayed` | u before the answer 0.7333, K 31.47, r 641.9, u after 0.7083 |
| 19 | listening `{r:400, u:0.4}`. `hear-flash`, `d:400`, `close`, `score:0.6`, `delayed` | w 0.5, K 20.8, delta −3.12, r 396.9 |
| 20 | production `{r:450, u:0.6}`. `prompt`, item `{kind:"prompt", order:6, words:7}`, `good`, `slip:true`, `delayed` | S 0.9, E 0.89084, r 450.2, `freeN` 1 |
| 21 | conversation `{r:500, u:1, last:0}`. `chat-turn`, `{kind:"chat", level:1}`, `outcome:"score"`, `score:0.7`, `session` | E 0.73999, r 499.0 |
| 22 | reading `{r:300, u:1, last:0}`. `read-sentence`, `{kind:"reading", tier:1, words:10}`, `close`, `score:0.5`, `delayed` | w 0.5, E 0.88095, r 292.4 |
| 23 | grammar `{r:300, u:0.8}`. `grammar-choice`, `{kind:"grammar", order:2}`, `good`, `nChoices:2`, `session` | E 0.97154, r 300.6 |
| 24 | `overall` with vocab 600, listening 640, production 310, grammar 500 (all `n > 0`), reading and conversation `n = 0`, `freeN` 0 | 460 |
| 25 | `overall`: fresh; all six at 1000 with `n > 0` and `freeN` 5; the same with `freeN` 20; all six at 1600 with `freeN` 50 | 100; 899; 1000; 1400 |
| 26 | `band(100).id`, `band(599).id`, `band(600).id`, `band(1400).id`, `band(2500).id`; `band(650).next` | primeras, turista, viajero, independiente, nativo; 900 |
| 27 | `vocabToRating(1000)`, `(3022)`, `(42000)`; `ratingToVocab(1500)`, `(900)` | 934, 1382, 2509; 4001, 915 (rounded) |
| 28 | `provisional(fresh).answersLeft`; with core `u` = 0.5, 0.3, 0.2 | 90; 12 |
| 29 | `checkup.estimate({0:{n:2,c:2,x:0}, 1:{n:3,c:3,x:0}, 2:{n:4,c:3,x:1}, 3:{n:3,c:1,x:1}, 4:{n:2,c:0,x:1}}, [0.9,0.72,0.2,0,0,0,0,0,0], 4)` | p = 0.95, 0.888, 0.511, 0.133, 0, 0, 0, 0, 0; size 391; se 67; `vocabToRating(size)` 593 |
| 30 | `forecast` over ten consecutive non-provisional days with `r = 300 + 5 * i`, target 600 | perDay 5, days 51 |
| 31 | With the real course after `init`: `pos(3)`, `pos(188)`, `pos(1000)`, `pos(6000)` | 3, 187, 787, 3022 (changes if the vocabulary changes) |
| 32 | With the real course: bootstrap a state whose `learned` is the 22 items of `u01l01` and `u01l02` with timestamps increasing in lesson order, each with `recog: 2` and `cards[id].ok: 1`, plus `grammar.g_pronunciation.best = 0.75` | vocab 128.0, listening 202.5, grammar 100.0, others 100, overall 129, every `u` ≥ 0.5 |

---

## 7. What this number is and isn't (text for the Progress page)

> **Your rating is an estimate of how much Spanish you have shown this app you can use**, on a chess-style
> scale where 100 is a first lesson, 2000 is someone who really speaks, and an educated native speaker is
> around 2500. It goes up when you get things right that you were not expected to, especially a day or more
> after learning them, and down when you miss things you should have had.
>
> It is not a certificate. It sees typed and tapped answers, not your accent, your speed, or how you do with
> a fast-talking taquero. Its difficulty ratings come from word frequency and course order, not from testing
> thousands of learners. It is capped at 1400 because nothing in this course is hard enough to prove more.
> Swings of 20–30 points in a day are noise; the line over weeks is the signal. Take the 5-minute check-up
> once a month to keep it honest.

---

## 8. Research notes and sources

**Elo in education.** [Pelánek 2016](https://www.fi.muni.cz/~xpelanek/publications/CAE-elo.pdf) (*Computers &
Education* 98, 169–179) treats each answer as a match between a student and an item: probability of a correct
answer `1 / (1 + e^-(θ − d))`, then `θ += K·(correct − P)` and `d += K·(P − correct)`. Points taken from it:

- multiple choice with `k` options: `P = 1/k + (1 − 1/k) · 1/(1 + e^-(θ − d))`;
- partial credit is allowed, since Elo was never restricted to win or lose;
- a constant K is either too slow or too jumpy, so use an uncertainty function: `U(n) = a/(1 + b·n)` with
  a = 1, b = 0.05 in his geography system, or Math Garden's `U := U − 1/40 + D/30` (D = days since the
  previous attempt);
- Glicko and TrueSkill are the principled Bayesian versions, but hard to adapt to the guessing formula, and
  the simple functions perform about as well;
- students and items are not symmetric: item difficulty is expected to stay put, student skill is expected to
  change, so they can use different update sizes;
- several correlated skills can be tracked at once, with a global skill on top.

[Klinkenberg, Straatemeier & van der Maas 2011](https://www.sciencedirect.com/science/article/abs/pii/S0360131511000418)
(Math Garden) is the origin of the uncertainty rule and of a "high speed, high stakes" score that also uses
response time. I did not use response time: typing speed on a phone says little about Spanish. I could not
open the paper itself, so its rule is quoted from Pelánek, and I have not reproduced its K constants.
[Pelánek et al. 2017](https://www.fi.muni.cz/~xpelanek/publications/umuai-adaptive-practice.pdf) estimate
prior knowledge from each learner's *first* answer to each item, which is the same concern as §2.5: repeated
answers to one item are not independent evidence.

**Glicko.** Rating plus a rating deviation that shrinks with games and grows with time away:
`RD = min(sqrt(RD0² + c²·t), 350)` ([summary](https://en.wikipedia.org/wiki/Glicko_rating_system)). The `u`
of §2.4 is a simplified RD.

**Duolingo.** The in-app Duolingo Score runs 0–160, is tied to how much of the course you have completed, and
maps to CEFR in bands; content currently ends at 129, the top of B2
([Duolingo](https://blog.duolingo.com/duolingo-score/)). The separate Duolingo English Test is adaptive,
reports 10–160, and its overall is the average of four subscores
([scoring guide](https://englishtest-static.duolingo.com/media/resources/DET_Scoring%20Guide%20for%20Teachers%20(2026).pdf)).
Third-party CEFR conversion charts for the test disagree in the middle bands, so none is reproduced here.

**Not found or not verified.** A Spanish column for the Milton & Alexiou table; per-level lemma counts from
the Instituto Cervantes (it publishes lists, not counts); a vocabulary figure for native five-year-olds (only
age 6); native adult counts for Spanish specifically; the exact Spanish week count on the current FSI page.
Where the text leans on any of these it says so.

---

## 9. Implementation notes (rating agent)

Files: `web/js/rating.js` (`window.Rating`, the section-6 contract), `web/js/progress.js` (`#/progress`,
`#/progress/checkup`, `Rating.homeCard()`), `web/css/progress.css`, tests in `tests/rating.test.js` /
`tests/rating.html` / `tests/run_rating_tests.py` (the 32 contract tests plus extras).

**Integration is event-driven, superseding the call sites of §6.4.** The engine dispatches one
`penguin:answer` CustomEvent per answered exercise (`App.emitAnswer` in `widgets.js`); `rating.js` listens,
builds the §6.3 event, computes `ctx` itself and calls `update`, then `Store.save()`. Ordering against
`Store.rate` does not matter: the last answer time per item is mirrored in `rating.at` (pruned after ~2 days),
and a `card.last` / `learned` stamp written within 3 s of the answer is treated as "just written by this
answer" and ignored. `ctx`: words and phrases by the latest earlier answer / card / learn time (fresh < 20 min <
session < 20 h < delayed); grammar and sound drills `session` in a lesson or on the day the unit was first
done, `delayed` on later days; prompts, stories and readings `repeat` when first done on an earlier day
(`rating.first`, `state.prompts[id].at`, `state.stories[id].done`, `readings[id].runs >= 1`); chat turns
`delayed`. Flash cards use the learner's SRS button (easy/good → good, hard → close 0.6, again → miss) unless
the answer was Not sure. Chat turns arrive as good / close / miss and score 1.0 / 0.7 / 0 (a `slip` caps at
0.7; a numeric `score` wins). The same answer dispatched twice (same item, exType, outcome and `ts`) is
ignored, and while the check-up runs (`Rating.suspended`) events are ignored.

**exTypes added by the review** (in `C.EX` / `C.FREE_EX`):

| exType | Skill | Difficulty | Notes |
|---|---|---|---|
| `produce-recall` | Production | `base(p)` + 250 + length of `es` | hints cap S: 1 → 0.8, 2 → 0.6, 3+ (audio) → 0.4 |
| `dictation` | Listening | `base(p)` + 200 + length of `ex_es` | `slowUsed` caps S at 0.7 |
| `cloze-choice` | Vocabulary | `base(p)` + 100 | guess k = options |
| `conj-hear` | Listening | `base(p)` of the verb + 100 | |
| `conj-produce` | Grammar | `base(p)` of the verb + 225 | |
| `say-try`, `mine-produce` | Production | `450 + 35 × words`, at most 950 | personal phrases: no rank, no personal offset, not free production for the B1 gate |
| `mine-hear` | Listening | `350 + 25 × words` | |

Aliases: `read-mark` = `read-sentence`, `build` = `tiles`, `hear_pick` / `hear_type` = `sound-pick` /
`sound-type`. A course exType on an item without a rank uses the personal-phrase formula of its skill.
Unknown exTypes are not scored and are logged once to `console.debug`.

**Other choices.** `state.rating` carries three fields beyond §6.1: `at` (item → last answer ms), `first`
(unit / prompt / story / reading → first day answered) and `news` (badge ids not yet celebrated; the
Progress page shows Penguin's congratulations once and clears it; a toast also appears when a badge is
earned mid-exercise). Bootstrap writes one snapshot for the day it runs (no back-filled history) and sets
every skill's `last` to 0 so the first real answer is not treated as a long break. Each check-up entry also
stores `ts`, `kn0` (known words at the time, for "plus words known since") and `placement` per strand. The
check-up suspends `Store.noteUnsure` while it runs so the cards' Not-sure counters are not touched. Band
badges per sub-rating also require that sub-rating to be settled. "3,022" in the page copy is the live
`COURSE.vocab.length`; test 31 checks `pos(6000)` against it, and test 32 pins the 22 items of the original
lessons 1–2 (exact values with the course RATING.md was written against, ±3 when the content has changed).
