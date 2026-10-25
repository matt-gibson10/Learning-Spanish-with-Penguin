# Design — Learning Spanish with Penguin

Owner: design agent. Files: `web/css/theme.css` (design system), `web/js/penguin.js` (mascot + voice),
`web/img/**` (standalone SVGs, favicon), `web/fonts/**` (self-hosted OFL fonts), `web/styleguide.html`
(every token/component/mood on one page — open it in a browser; it is the reference for the engine).

Light theme only. Warm, Mexican-inspired palette on a papel-cream base. Nothing is fetched from the network.

---

## 1. Palette

All hex values live as CSS custom properties on `:root` in `theme.css`. Contrast ratios are WCAG 2.x.

### Contract tokens

| Token | Hex | Name | Contrast | Use |
|---|---|---|---|---|
| `--bg` | `#FFF7EA` | papel cream | ink on it **12.5:1** | page background |
| `--surface` | `#FFFFFF` | surface | ink on it **13.3:1** | cards, inputs, bubbles |
| `--surface-2` | `#FBEFD9` | arena (sand) | ink on it **11.7:1** | tile bank, chips, table stripes |
| `--ink` | `#2A2E45` | noche | — | body text, headings |
| `--ink-soft` | `#5E6378` | soft ink | on `--bg` **5.6:1**, on `--surface-2` **5.2:1** | secondary text, labels |
| `--line` | `#EBD9BC` | line | decorative (1.3:1) | borders, dividers, dashed spine |
| `--primary` | `#1B65A6` | talavera blue | white on it **6.1:1**; on `--bg` **5.7:1** | primary buttons, nav active, links, `.btn-big` |
| `--primary-ink` | `#FFFFFF` | | | text on primary |
| `--accent` | `#C8156A` | rosa mexicano | white on it **5.6:1**; on `--bg` **5.7:1** (`#BF1363`) | accent buttons, feminine chip, grammar marks, countdown number |
| `--accent-2` | `#F7A51C` | cempasúchil marigold | ink on it **6.6:1** | highlights, countdown frame, stars, example rule |
| `--good` | `#1A7F50` | jade | white on it **5.0:1** | correct, done nodes, good feedback |
| `--close` | `#E08E0B` | amber | ink on it **5.1:1** (fill only — use `--close-ink` for text) | close feedback edge, typo underline |
| `--miss` | `#BD4F35` | soft terracotta | white on it **4.9:1** | miss feedback edge, wrong choice (never alarm-red) |
| `--radius` | `16px` | | | cards, buttons (pill for `.btn`) |
| `--shadow` | soft warm double shadow | | | cards |
| `--font-body` | Nunito, system fallbacks | | | |
| `--font-display` | Fredoka, Nunito fallbacks | | | |

### Extended tokens (also in `:root`)

| Token | Hex | Contrast |
|---|---|---|
| `--talavera-deep` | `#124B7E` | on `--talavera-soft` **7.4:1** |
| `--talavera-soft` | `#DCEBFA` | |
| `--rosa-deep` | `#9E0F53` | on `--rosa-soft` **7.5:1** |
| `--rosa-soft` | `#FCE1EE` | |
| `--marigold-deep` | `#8A5200` | on `--bg` **6.0:1**, on `--marigold-soft` **5.7:1** |
| `--marigold-soft` | `#FFF1D6` | |
| `--jade-deep` | `#15694A` | on `--jade-soft` **5.9:1** |
| `--jade-soft` | `#E3F5EA` | |
| `--terracotta-deep` | `#9A3F28` | on `--terracotta-soft` **5.6:1**, on `--bg` **6.3:1** |
| `--terracotta-soft` | `#FBE6DF` | |
| `--good-ink` / `--good-bg` | `#15694A` / `#E3F5EA` | **5.9:1** — text/background of `.feedback.good` |
| `--close-ink` / `--close-bg` | `#7A4A00` / `#FFF1D6` | **6.7:1** — `.feedback.close` |
| `--miss-ink` / `--miss-bg` | `#9A3F28` / `#FBE6DF` | **5.6:1** — `.feedback.miss` |
| `--focus` | 3px cream + 3px talavera ring | | `:focus-visible` everywhere |
| `--tap` | `44px` | | minimum tap target |

Rules of thumb:
- Text goes on cream/white/soft tints with `--ink`, `--ink-soft` or a `*-deep` colour. Saturated colours
  (`--primary`, `--accent`, `--good`, `--miss`) carry **white** text; `--accent-2` and `--close` carry **ink**.
- Talavera = "do this" (primary action, current lesson). Rosa = feminine gender + grammar marks + accents.
  Jade = correct/done. Marigold = attention/highlight/countdown. Terracotta = miss, softly.
- Gender is always talavera (m) / rosa (f), everywhere, plus a letter badge.

---

## 2. Typography

Self-hosted variable fonts (SIL OFL; licences in `web/fonts/`), latin subset which includes
`¿ ¡ ñ á é í ó ú ü`:

- **Display — Fredoka** (`web/fonts/fredoka-latin-wght-normal.woff2`, 300–700). Headings, buttons, nav,
  the big word, countdown numbers. Rounded, friendly, reads at a glance. Weight 600 by default.
- **Body — Nunito** (`nunito-latin-wght-normal.woff2` + italic, 200–1000). Everything else. Body is 17px /
  1.55, weight 500 (variation setting), `strong` = 800. Italic is used for Spanish example sentences.

Scale: `h1` clamp 1.9–2.6rem, `h2` 1.45–1.9rem, `h3` 1.25rem, `.word-big` 2–3.2rem, `.page-title` 1.8–2.5rem
with a three-colour underline bar. `.lead` 1.15rem soft ink. `code`/`kbd` monospace on `--surface-2`.

---

## 3. Components — usage notes for the engine

Every class in the contract is styled; the extra classes below are optional helpers.

**Header** `.app-header` (sticky, blurred white) → `.brand` (penguin 40px + name; optional
`.brand-sub` small caps line) + `.nav` (`<nav>` or `<ul>`) with `.nav a` pills, `.nav a.active`.
Put `Penguin.svg('happy', 40)` inside `.brand`. Under it, `<div class="papel-picado"></div>` (34px festive
strip, pure CSS data-URI SVG; add `.subtle` for a quieter 26px version inside lesson screens).

**Page** `.page` (max 920px, bottom padding so the big button never hides behind a toast), `.page-title`,
`.crumbs` (any children; separators are generated; mark the last one `.current`).

**Buttons** `.btn` base (pill, 44px min). `.btn-primary` talavera with a 3px "pressable" bottom shadow,
`.btn-secondary` outlined, `.btn-ghost` text-only, `.btn[disabled]`. Extras: `.btn-accent` (rosa),
`.btn-good` (jade), `.btn-sm`, `.btn-icon`, `.btn-row` (+`.center`).
`.btn-big` = the giant Continue: full width up to 440px, 64px tall, 1.35rem — it is talavera by itself;
combine with `.btn-accent` / `.btn-good` / `.btn-secondary` for variants. Keep **one** `.btn-big` per screen.

**Cards** `.card`, `.card-hero` (gradient, four-colour top bar, for the "today" screen), `.card-grid`
(auto-fit ≥230px). `.card.clickable` / `a.card` lift on hover.

**Progress** `.progress-bar > .fill` (inline width). Modifiers on the bar: `.good`, `.accent`, `.marigold`, `.thin`.

**Chips & tags** `.chip` (pill). `.chip.m` and `.chip.f` get an automatic round letter badge (**m** on
talavera, **f** on rosa) via `::before`, so put the *word or article* inside, not the letter:
`<span class="chip f">la casa</span>`. `.chip.mf` for el/la nouns. Also `.chip.good/.close/.miss/.primary/.accent/.marigold`.
`.tag` = small uppercase label; `.tag.topic`, `.tag.tier`, `.tag.mx`.

**Countdown** `<div class="countdown"><span class="num">5</span><span class="label"><strong>days to Mexico</strong>Oct 30 · CDMX</span></div>`
— calendar icon is generated. **Stats** `.stat` with `.num` + `.label`; `.stat.good/.accent/.marigold`
recolour the number; `.stat-row` grid.

**Course map** `.lesson-path` (`<ol>`/`<div>`; dashed spine + auto numbering) → each `.node` is the whole
clickable row (`<button>` or `<a>`): a generated circle badge (number / ✓ for `.done` / ▶ pulsing for
`.current` / lock for `.locked`), the title text, an optional `<small class="sub">` second line and an
optional `<span class="meta">` on the right (chips). `<li class="unit-title">` rows label units.
`.locked` is dimmed and `cursor: not-allowed` — also set `disabled`/`aria-disabled`.

**Flashcard** `.flashcard` → `.front` + `.back` (direct children, both rendered; CSS stacks them in one grid
cell so the card is as tall as the taller side). Toggle `.flipped` on the container (3D flip, 520ms; under
reduced motion it just swaps). Give the container `tabindex="0" role="button" aria-pressed`. The front
shows a "tap to flip" hint automatically.

**Word display** `.word-big` (optional `<span class="article">la</span>` prefix, soft colour), `.gloss`,
`.example` (italic, marigold rule; optional `<span class="en">` translation line), `.natural` = the
"sounds like" chip with an automatic SOUNDS LIKE label — put only the respelling inside.

**Audio** `.audio-btn` (speaker icon generated; empty button = round icon-only), `.audio-btn.slow`
(jade, turtle icon), `.audio-btn.fast` (rosa, bolt icon = natural speed). Add `.playing` while TTS speaks.
`.audio-row` wraps them.

**Choices** `.choice-grid` (1 col <560px, 2 cols above) → `.choice` buttons (optional `<span class="key">1</span>`
keyboard hint). States `.selected`, `.correct` (✓ appended), `.wrong` (✕ appended, soft terracotta).

**Typed answers** `.answer-input` on `<input>` or `<textarea>`; `.answer-row` lays input + button in a row.
Outcome tints: `.answer-input.good/.close/.miss`. `.accent-keys` = row of small `á é í ó ú ñ ¿ ¡` buttons.

**Tiles** `.tile-slots` (dashed drop zone; shows a hint when empty or `.empty`), `.tile-bank` (sand
background), `.tile` buttons; `.tile.used` = ghost placeholder left in the bank; `.tile.correct/.wrong`.

**Feedback** `.feedback` + `.good` / `.close` / `.miss`. Inside: `<h3 class="title">` (gets a ✓ / ~ / → badge),
paragraphs, `.diff`, `<p class="note">` (explanation), `<div class="model"><span class="lbl">Answer</span>…</div>`.
Close is warm amber ("almost"), miss is soft terracotta with a kind heading — never red-alarm.

**Diff marks** `.diff` block with one `<span>` per token: `.ok`, `.typo` (dotted amber underline), `.accent`
(dashed talavera underline), `.grammar` (wavy rosa underline), `.missing` (dashed box, `+` prefix, italic —
the expected word the learner left out), `.extra` (struck through, grey — a word that wasn't needed). Each is
distinguishable without colour. Use a `title` attribute on marked tokens for the one-line reason.
`.diff-legend` renders the key.

**Rate row** `.rate-row` grid of four: `.rate-again` (terracotta) `.rate-hard` (amber) `.rate-good` (jade)
`.rate-easy` (talavera). Optional `<small class="when">1 day</small>` inside; add `.suggested` to the one the
grader derived.

**Penguin coach** `Penguin.coach(el, mood, html)` writes
`<div class="penguin-coach" data-mood><div class="penguin-coach-avatar">svg</div><div class="speech-bubble"><div class="speech-name">Penguin</div><div class="speech-text">html</div></div></div>`.
Modifiers on `.penguin-coach`: `.big` (160–200px hero), `.sm` (64px), `.reverse` (penguin on the right),
`.stack` (penguin above bubble, centred). `.speech-bubble .es` highlights Spanish inside a line.
Penguins inside a coach bob gently; wave/cheer/sleepy/thinking/proud/oops moods have small CSS idle animations.

**Explain** `.explain` wraps rendered grammar markdown: headings, lists with marigold markers, `strong` in
rosa, `code` in talavera, blockquote = marigold tip box, striped tables with talavera header. Extra:
`<p class="mx">` (Mexico note) and `<p class="tip">`. Wrap wide tables in `.table-wrap`.

**Toast** `.toast` fixed bottom-centre, ink on cream text; `.good/.close/.miss` variants; add `.hide` to
animate out; `.static` renders it inline (styleguide only).

**Accessibility / motion** Every interactive element has a `:focus-visible` ring (`--focus`); tap targets
≥ 44px; the grid/typography holds from 360px up; `prefers-reduced-motion` disables all animation and the
3D flip. Colour is never the only cue (letters on gender chips, ✓/✕ on choices, underline styles on diffs).

---

## 4. Penguin, the mascot

**Name:** Penguin (`Penguin.name`). A chubby, glossy navy penguin with a cream belly, big friendly eyes, orange
beak and feet, rosy cheeks, and — always — a straw sombrero with a rosa/jade/talavera embroidered band and
marigold zigzag. Built from shared parts in `penguin.js` (`Penguin.svg(mood, size)`); the same body, face and
hat in every mood, so he stays on-model. Standalone copies: `web/img/penguin/<mood>.svg`, `web/img/favicon.svg`.

| Mood | When the engine uses it | Pose |
|---|---|---|
| `happy` | default, good answers, nav avatar | flippers relaxed, smile |
| `talking` | reading a prompt / TTS playing | beak open, one flipper gesturing |
| `thinking` | close answers, "let's look at it", hints | flipper on chin, eyes up, raised brow, thought dots |
| `cheer` | streaks, lesson complete | flippers up, confetti, beak open |
| `oops` | miss — gentle, never harsh | sheepish: worried brows, sweat drop, flipper scratching under the hat, still smiling |
| `proud` | unit finished, badges earned | happy closed eyes, star medal, sparkles |
| `sleepy` | daily goal reached / all done | eyes closed, hat tilted, floating z's |
| `wave` | welcome / returning user | one flipper up waving |

Mapping used by `Penguin.say`: `Penguin.moodFor = { good:"happy", close:"thinking", miss:"oops", streak:"cheer", done:"sleepy", welcome:"wave" }`.

### Personality & voice

Penguin is a warm, slightly playful coach who has clearly spent time in Mexico. He is on the learner's side:
he celebrates recall, shrugs off slips, and never scolds. He talks like a friend, not a teacher.

- **Encouraging first, correcting second.** Lead with what went right ("I understood you"), then the one fix.
- **Short.** One or two sentences per line. The marked answer and the note do the explaining.
- **A sprinkle of easy Spanish**, always guessable from context or already taught: *¡Muy bien!, ¡Casi!, ¡Órale!,
  No pasa nada, ¡Ándale!, ¡Listo!, Tranquilo, ¡Tú puedes!, ¡Qué onda?, Hasta mañana.* Never a whole line in
  Spanish the learner can't read yet.
- **Mexican flavour**, not Spain: *órale, chido, ándale, ahorita, porfa, chilango*, tacos, horchata, pan dulce.
- **Misses are "not yet"**: no "wrong", no "incorrect", no red. Normalise it ("takes a couple of tries for everyone"),
  give the answer, move on.
- **Grammar slips count as remembered**: say so explicitly ("the meaning is there; let's tidy the form").
- **No fake hype**: "¡Perfecto!" for a clean answer, not for a close one. Streak lines scale with the streak.
- **Tie it to the trip** now and then: ordering tacos, the airport, October 30th.

### Sample lines (also exported as `Penguin.lines`)

**good**
- ¡Muy bien! That's exactly it.
- ¡Perfecto! You nailed it.
- ¡Órale! Clean as a fresh tortilla.
- ¡Excelente! That one's yours now.
- ¡Así es! Just like a chilango would say it.
- ¡Eso! You're going to sound great in Mexico.
- ¡Bravo! Not a feather out of place.
- Sí, señor. That's the one.
- ¡Qué bien! I'd order from you any day.
- ¡Muy bien hecho! Keep that rhythm going.
- ¡Chido! You got it on the first try.
- ¡Correcto! Easy as pan dulce.
- Wow — ¡perfecto! Even the accent.

**close**
- ¡Casi! You had the idea — just a small detail to polish.
- So close. The meaning is there; let's tidy the form.
- Almost — I understood you perfectly. One tiny fix.
- ¡Ya casi! That's 90% of the way there.
- Good recall. A little grammar slip, nothing more.
- You remembered the important part. ¡Bien!
- Nearly there — a waiter in Mexico would understand you.
- ¡Casi, casi! One word off.
- Nice try — the pieces are right, just one needs a swap.
- I knew what you meant. Let's make it shine.
- Close one! Have a look at the marked word.
- Un detallito — a small detail. The rest is great.
- ¡Bien! Just watch that one ending.

**miss**
- No pasa nada — that one's tricky. Here's the answer.
- Not yet, but now you've seen it. It'll stick next time.
- Tranquilo. This one takes a couple of tries for everyone.
- Hmm, not this time. Read it once, say it once, and we move on.
- Not quite. Let's look at it together — no rush.
- That's a hard one. Now you have the answer in your pocket.
- No worries. Even I forget words before breakfast.
- Let's try that one again later. ¡Tú puedes!
- Not the one — but a good guess. Here's what it was.
- Still learning this one, and that's totally fine.
- Nope — pero no pasa nada. We'll see it again soon.
- This word is shy. It'll come out next time.
- Missed it, but now it's in your brain. ¡Ánimo!

**streak**
- ¡Órale! Three in a row!
- ¡Qué racha! You're on fire.
- ¡Increíble! Keep it going.
- Streak! Someone has been practising.
- ¡Wow! That's a serious run.
- ¡Eso, eso, eso! Unstoppable.
- You're making this look easy. ¡Sigue así!
- A streak like that deserves tacos.
- ¡Vamos! Another one in the bag.
- ¡Fantástico! Don't stop now.
- ¡Ándale! You've found your rhythm.
- Five straight! The sombrero tips to you.

**done (for today)**
- That's all for today. ¡Buen trabajo!
- Done for today — your brain will file it while you sleep.
- ¡Listo! Go have a horchata; you earned it.
- Session complete. Hasta mañana, amigo.
- That's the daily goal. Rest up — the words keep settling.
- All done. Tomorrow we review and add a few more.
- ¡Terminamos! Nice steady work today.
- Enough for now. Little and often beats a lot at once.
- You finished today's set. ¡Qué bien!
- Zzz… I mean: great session. See you tomorrow.
- ¡Ya está! Every day gets you closer to that first taco order.
- Daily goal reached. Go enjoy your day — nos vemos.

**welcome**
- ¡Hola! I'm Penguin. Ready for a bit of Spanish?
- ¡Bienvenido! Let's pick up where we left off.
- ¿Qué onda? Shall we do a quick round?
- ¡Buenos días! A few words now, a lot of words by October 30th.
- Hey there — your words are waiting for you.
- ¡Hola, hola! Time for a little review.
- Welcome back. Small steps, big trip.
- ¡Qué gusto verte! Let's go.
- Ready when you are. Just press the big button.
- ¡Vamos! One lesson, one step closer to Mexico.

### JS API summary (`window.Penguin`, no dependencies)

```js
Penguin.name                      // "Penguin"
Penguin.moods                     // ["happy","talking","thinking","cheer","oops","proud","sleepy","wave"]
Penguin.svg(mood, size)           // SVG string, square viewBox 0 0 240 240; size px (default 120)
Penguin.coach(el, mood, html, {size, name})   // el = element or selector; returns the .penguin-coach node
Penguin.lines                     // {good, close, miss, streak, done, welcome} arrays
Penguin.line(kind)                // one random line
Penguin.moodFor                   // outcome → mood map
Penguin.say(el, kind, extraHtml)  // coach() with a random line + matching mood
Penguin.colors                    // the mascot's hard-coded colours
```

Each generated SVG gets a unique id prefix for its gradients/clip-path, so any number of penguins can be
inlined on one page. The SVG carries `class="penguin penguin-<mood>"` and `data-mood`; its parts have
`pg-*` classes that `theme.css` animates.
