# Design

<!-- impeccable:design-schema 1 -->

Recorded from the built world, not from intention. Direction seed `9a063065`; the direction
contract is the HTML comment at the top of `<body>` in [index.html](index.html), and it survives
into `dist/index.html` — grep the seed key to audit it.

## World

**Bench Instrument.** A nixie-tube laboratory counter: blackened steel, chamfered plates, engraved
nameplates, and figures burning inside glass.

The fuse is not decoration. A section code — `MATH 101.6 UV1A` — is a fixed-position alphanumeric
readout: each character in its own cell, one form, read left to right, copied out by hand. That is
what a tube bank is for, and the section code is the only thing this product exists to hand over.
The app is therefore the instrument that displays codes, not a calendar with codes written on it.

**What it refuses:** the scheduling dashboard every tool in this category ships — rounded cards,
pastel event blocks on a panel, a workhorse UI face, one blue accent. That was the previous
incumbent here, and it is the anti-reference.

Chosen by the user over the rolled direction (index 6, "Tide Table") from a hand of three
challengers.

## Surfaces

Four steps of one blackened steel, plus a milled field for anything you type into.

| Token | Value | Role |
|---|---|---|
| `--chassis` | `#0b0c0e` | the page the instrument sits on |
| `--recess` | `#0e1013` | milled channels: day columns, the enlist strip, candidate cards |
| `--panel` | `#131518` | the rail and stage plates |
| `--raise` | `#191c21` | keys, dialog, tags |
| `--plate` | `#21252b` | a key with the bench lamp on it (hover only) |
| `--field` | `#08090b` | inputs and the tube window |

Edges are `--edge #2b3038`, softening to `--edge-soft #1e2228` and lighting to `--edge-lit
#454c56` on hover.

## Light

`--glow #ff6a00` is **reserved**. If something is orange it is live, focused, primary, or changed
— the candidate you are on, the primary action, keyboard focus, an enabled criterion, the open
setup step, the term badge, and the strike on a class that changed between candidates. It is never
decoration.

The primary control is a dark plate with a **lit border and a lit legend**, never a filled orange
slab. The filled button is the product-UI reflex; a real panel key lights up.

`--ok #46d39b` latches a locked section. `--warn #f2b45f` is spent only on flags that mean check
this — a class with no fixed meeting time. Modality is a fact, not a caution, and takes the
neutral engraved tag.

## Department gases

Eight departments could not all be orange, so they are the rest of the tube family: gas fills.
Ordered so that two subjects handed consecutive slots are never alike, because they are assigned
in sequence to whatever subjects a schedule contains ([WeekGrid.tsx](src/ui/stage/WeekGrid.tsx)).

| # | Gas | Fill | Ink |
|---|---|---|---|
| 1 | neon | `#2b0d13` | `#ff7e8e` |
| 2 | krypton | `#07251a` | `#7fe3a0` |
| 3 | xenon | `#0a1730` | `#7fb0ff` |
| 4 | sodium | `#26200a` | `#f5d64c` |
| 5 | argon | `#16102e` | `#b79bff` |
| 6 | mercury | `#062227` | `#6fd8e8` |
| 7 | cold white | `#161b21` | `#c8d4de` |
| 8 | helium | `#260c24` | `#ee9be8` |

Emitted as `--gas` / `--gas-ink` custom properties, not as `background`/`color`: the block's fill,
its machined edge, and the glow on its code are all derived from those two values.

## Shape

**Chamfered, never rounded.** `--c` sets the cut per component and `--cut` applies it; there is no
`border-radius` anywhere in the stylesheet. Cut corners are the single move that stops this reading
as a product dashboard.

The 1px machined edge is a background *list*, not a border: the fill paints in `padding-box` and
the edge colour in `border-box`, so the line follows the chamfer instead of squaring it off. Three
finishes are pre-composed as `--steel`, `--steel-raise`, `--steel-recess`, `--steel-lit`.

**A bare `<color>` is legal only as the final layer of the `background` shorthand.** Used mid-list
it invalidates the entire declaration — which is how every lit plate first shipped with no
background at all while its orange text still rendered, so it looked deliberate. `--glow-fill` is
always wrapped in `linear-gradient()` at the use site.

Depth comes from the surface step and `--bevel` (a top-edge highlight), not from drop shadows.
Steel does not float. `--shadow-lg` exists only for the dialog.

## Type

Two superfamilies, many voices, no third family.

- **Archivo Variable** — width axis 100 for reading text, **118 for engraved nameplate caps**
  (`letter-spacing: .17em`, uppercase, with a 1px dark relief under the glyphs). One face
  silkscreened at two widths, the way a real panel is lettered.
- **Martian Mono Variable** — every code, time, count, and unit. Wide and squared, so each glyph
  sits in its own cell. That is the whole argument.

Both are shipped, not system stacks, so the app looks the same on a Windows lab machine as on a
Mac. Imported via `wdth.css`, which carries both axes.

## The tube bank

`.pager-rank` is the one place a count *is* the point, so it is the one place with real envelopes:
a glass cell per character, a hairline between cells, light on the top of the glass, figures
burning inside. The cells are laid on the **content box** so they align with the glyphs exactly —
Martian Mono is monospaced, so the stripe period is `1ch` on the nose.

Nothing else in the app wears tubes. Everywhere else uses the panel grammar, which is what keeps
this from being a costume.

## Contrast floor

Every readable value was computed against its real ground, not eyeballed.

- `--ink` ≥ 12.1:1, `--ink-soft` ≥ 6.7:1, `--muted` ≥ 4.5:1 on all six grounds.
- `--glow` ≥ 5.4:1 on every ground it labels.
- Each gas ink clears 8:1 on its own fill; `.block-room` at `opacity: .78` still clears 4.5:1 on
  all eight (0.7 failed on neon at 4.2 and argon at 4.5).
- `--engrave #5b6168` sits at ~3:1 and is **reserved for non-text engraving**. Nothing readable may
  use it; four things did on the first pass and all four moved to `--muted`.

## Motion

Spent where the instrument would spend it, and nowhere else.

- `strike` — a cathode coming on: overshoots to `brightness(2.1)` then settles. Fires only on
  classes that changed between candidates.
- Key travel (`translateY(1px)`) on `:active`.
- `prefers-reduced-motion` disables all of it.

The candidate meter animates `transform: scaleX()`, never `width` — re-scoring can fire on all 500
bars at once.

## Rules that are load-bearing

- `.sr-only` stays `position: absolute` but `.candidate-list li` is `position: relative`, so the
  500 filmstrip labels are clipped by the strip rather than laying out against the document.
- `.chip-who` uses `flex: 1 1 0`. A wrapping flex container breaks lines using each item's
  *content* size and only shrinks afterwards, so `basis: auto` bumped the action keys to a second
  line and then nothing needed to shrink.
- `.schedule-grid-scroll` carries `padding-bottom: 10px` as headroom for the last hour label, which
  hangs half a line below the grid.
- `.block` is `container-type: size`; the professor and room lines appear at 50px and 66px of block
  height rather than at a guessed breakpoint.
- Grid columns are `minmax(122px, 1fr)`, sized from the catalog: section keys run 13 characters at
  the median and 21 at p95, with a 23-character tail that ellipsizes into the tooltip.

## Known gap

`src/ui/export/scheduleImage.ts` still renders a **light** PNG with its own six-hue palette. It is
a share-and-print artifact rather than app chrome, so it was deliberately left outside this world;
its fonts were pointed at Archivo and Martian Mono so at least the lettering matches. Bringing it
into the bench world is an open decision.
