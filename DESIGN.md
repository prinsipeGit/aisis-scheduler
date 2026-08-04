# Design

<!-- impeccable:design-schema 1 -->

Recorded from the built world. Direction seed `9a063065`; the contract is the HTML comment at the
top of `<body>` in [index.html](index.html) and survives into `dist/index.html`.

## World

**Course Overprint.** The orienteering map, and specifically one rule from ISOM: *the course layer
never edits the terrain*.

An O-map prints two things on one sheet. Underneath is terrain — a fixed colour language, the same
on every map in the world, learned once and then read without thinking. Over it, in a single
reserved colour, is the course: numbered controls and the legs between them, overprinted, redrawn
race to race while the ground stays identical.

That is exactly the relationship this product needs. **The catalog is terrain** — what a department
offers is a fact, and its colour means the same thing in every candidate. **Your candidate is the
overprint** — numbered in the order you walk it, redrawn every time you page, and structurally
unable to alter what is underneath. Eight departments were the hard problem in every other
direction considered; here they are just the terrain legend.

**What it refuses:** the scheduling dashboard where selection and content are the same layer of
tinted cards.

Chosen by the user from the challenger hand, over the rolled direction (index 6, "Tide Table").

## Ground

ISOM's base is white runnable forest. Inverted for the use scene — enlistment early or late, on a
laptop, AISIS glaring white in the next tab — it becomes the forest floor at night. The green cast
is deliberate: the sheet must never read as neutral UI grey.

| Token | Value | Role |
|---|---|---|
| `--ground` | `#0b0f0d` | the page, under the contour texture |
| `--well` | `#090c0a` | fields, day channels, the enlist strip |
| `--sheet` | `#121714` | rail and stage sheets |
| `--raise` | `#182019` | keys, tags, course rows |

**Every rule in the app is a contour line**, drawn in `--contour #4a3a26` — not grey. This single
decision is what keeps the interface from reading as a panel of dividers. `--contour-soft
#2b2318` for internal rules, `--contour-lit #6d5636` for hover.

The page carries a tiled three-bezier contour texture at **0.32 opacity**. At full contour weight
the form lines stopped being ground and became the loudest thing on the page; they have to be
readable as terrain and ignorable as texture at the same time.

Sheets are **trimmed square**. A map is cut, not rounded. The only `border-radius` in the
stylesheet is `50%` on control circles, which is the notation itself.

## The overprint

`--course #d264f0` is reserved for the live layer: the candidate you are on, control numbers, the
primary action, focus, an enabled criterion, the open setup step, and what changed between
candidates. **No terrain ink is ever this colour, and the course never uses a terrain ink.**

The primary action is overprinted, not filled — `--course-fill` behind a course-coloured border
and label.

## Terrain legend

Dark-adapted ISOM inks, assigned by alphabetical position among the subjects a schedule actually
contains, ordered so consecutive slots are least alike
([WeekGrid.tsx](src/ui/stage/WeekGrid.tsx)).

| # | Terrain | Fill | Ink |
|---|---|---|---|
| 1 | open yellow | `#302606` | `#f5c542` |
| 2 | marsh blue | `#0b2233` | `#66b8ea` |
| 3 | rough green | `#0d2a18` | `#6fd08a` |
| 4 | contour brown | `#2d1c0d` | `#dda169` |
| 5 | water | `#0e2b30` | `#7fd4d8` |
| 6 | rock | `#1b2027` | `#b6c1cd` |
| 7 | thick vegetation | `#0a1c11` | `#52b374` |
| 8 | settlement olive | `#26270b` | `#d0d26a` |

The ISOM palette is genuinely narrow — yellow, green, blue, brown, black — so slots 3 and 7 are a
shade step of one family. That is how ISOM itself separates rough open from thick vegetation, and
they sit four apart in the assignment order.

Emitted as `--gas` / `--gas-ink` custom properties, not `background`/`color`, so the fill, the
border, and the secondary lines all derive from the same two values.

## The course layer

The signature notation, and the thing that makes this world more than a palette.

- Each day's classes are **sorted by start time**, then numbered. The control number is the
  sequence of the day, not the order the schedule array happens to hold.
- `.control` — a ring with its number, top-right of each block. `.block strong` carries
  `padding-right: 21px` so the code ellipsizes before it reaches the ring rather than running
  under it. The ring backing is 88% ground, because it sits on eight different terrain fills and
  must hold contrast against the brightest.
- `.leg` — a dashed course line down the column across each gap between consecutive controls.
  Rendered **before** the blocks so terrain paints over it: a leg runs *to* a control, not across
  it. Back-to-back classes have no gap and get no leg.
- The number is repeated in the block's `title`, so the ring itself is `aria-hidden`.

Because the default top-ranked criterion is *compact days (fewest gaps)*, the best candidates have
no legs at all. Legs appear as you page down the ranking — which is itself the information.

## Type

One superfamily at two widths plus its mono, mirroring how a map letters itself.

- **Fira Sans Condensed** — map lettering: headings, labels, day names, buttons. Condensed, tracked,
  uppercase.
- **Fira Sans** — reading text. Condensed body copy is a cartographic habit that does not survive
  a UI.
- **Fira Mono** — every code, time, count and unit. A control description is a table.

All shipped, not system stacks, so the app looks the same on a Windows lab machine as on a Mac.

## Contrast floor

Zero failures in an automated sweep of every text node against its computed ground.

- `--muted` ≥ 4.54:1 on all four grounds; `--course` ≥ 5.42:1.
- Each terrain ink clears 6.8:1 on its own fill; `.block-room` at `opacity: .78` still clears
  4.5:1 on all eight (thick vegetation is the floor at 4.64).
- `--contour` sits at 1.66:1 and is **rules only** — nothing readable may use it.

## Motion

- `overprint` — the course colour passes over a changed patch, then lifts. Fires only on classes
  that changed between candidates.
- Key travel on `:active`. `prefers-reduced-motion` disables all of it.
- The candidate meter animates `transform: scaleX()`, never `width` — re-scoring can fire on all
  500 bars at once.

## Rules that are load-bearing

- `.sr-only` stays `position: absolute` but `.candidate-list li` is `position: relative`, so the
  500 filmstrip labels are clipped by the strip rather than laying out against the document.
- `.chip-who` uses `flex: 1 1 0`. A wrapping flex container breaks lines on each item's *content*
  size and only shrinks afterwards, so `basis: auto` bumped the action keys to a second line and
  then nothing needed to shrink. Under 860px it takes its own line instead.
- `.schedule-grid-scroll` carries `padding-bottom: 10px` as headroom for the last hour label.
- `.block` is `container-type: size`; professor and room appear at 50px and 66px of block height.
- Grid columns are `minmax(122px, 1fr)`, sized from the catalog: section keys run 13 characters at
  the median, 21 at p95, with a 23-character tail that ellipsizes into the tooltip.

## Known gap

`src/ui/export/scheduleImage.ts` still renders a **light** PNG with its own six-hue palette. It is
a share-and-print artifact rather than app chrome, so it was left outside this world; its fonts
were pointed at Fira so the lettering matches. Bringing it in is an open decision.
