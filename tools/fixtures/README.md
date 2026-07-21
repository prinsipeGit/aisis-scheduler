# Fixtures

`j-vofc-sample.html` — a real AISIS Official Curriculum (`J_VOFC.do`) results page for
`BS AMDSc-M DSc` (Ver Year 2024), saved from a logged-in browser session and trimmed to
the markup the parsers read: the `<form>`/`<select>` of programs and the curriculum tables.

The Official Curriculum is identical for every student in a program, and the page chrome
carrying the signed-in user's name was removed during the trim, so the file holds no
personal data.

What the parser tests rely on in this file:

- 472 `<option>` entries — the full program dropdown, several version-years per program.
- 5 year headings (`class="text06"`), 14 term headings (`class="text04"`, `"TERM - N Units"`).
- 396 entry cells (`class="text02"`), five per course = 79 courses.
- Deliberately preserved quirks: unclosed `<td>` elements, `class` not always the first
  attribute, and two blocks whose term is printed as a year (`Third Year|Fourth Year`,
  `Fifth Year|Fourth Year`).

Because this is the BS AMDSc 2024 page, parsing it must reproduce
`data/curricula/BS-AMDSc-M-DSc-2024.json` exactly — that assertion is the strongest test
in `tools/curriculum-parse.test.ts`.

Re-capture (File → Save Page As → "Web Page, HTML Only") only if AISIS changes its page
layout and the tests fail for reasons other than a parser bug. Copy the file before
editing it, and redact by exact literal replacement — a regex that spans tags can silently
swallow the curriculum tables.
