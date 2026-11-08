# 15 · UI/UX Spec (final — agents must follow)

**One idea:** a farmer opens a screen, sees **one answer**, knows **how sure it is**, and knows **what to do next**. Everything else is one tap away.

The base UI stays. These rules only say how to use it well. Rules marked **MUST** are checked before any UI task is called done (§12).

---

## 1. Ten golden rules

1. **Keep the base UI.** Same colours, fonts, sidebar, panels and classes as `app/style.css`. No new UI library (no Tailwind, shadcn, Google Fonts or CDN).
2. **One screen = one question.** The page title asks it ("Will water stand in my field?"), and the first card answers it.
3. **Answer first, details later.** Action card on top; charts, tables and sources sit under "Show details".
4. **Every number wears a truth label:** Measured · Estimated · Scenario · Unknown (§5).
5. **Unknown is said plainly.** "Groundwater level unknown — add a tubewell reading", never a blank or a guess.
6. **Every string is bilingual** through `t(en, bn)`. Short sentences, everyday words.
7. **Local units first:** shotok (decimal), bigha, katha, acre; hectare second.
8. **Big and tappable:** text ≥ 16 px for reading, touch targets ≥ 44 × 44 px.
9. **Colour is never the only signal.** Always add an icon and a word.
10. **Works offline, on a cheap phone.** No network call, no heavy animation, nothing slower than the current views.

---

## 2. Base UI tokens (keep; use only as stated)

Measured contrast against `--paper` / `--surface` (WCAG AA: text needs 4.5:1).

| Token | Hex | Use for | Never for |
|---|---|---|---|
| `--paper` | #f5f4ed | Page background | — |
| `--surface` | #fffef9 | Panels, cards | — |
| `--ink` | #24392c | All body text, headings (11.2:1) | — |
| `--muted` | #6b7168 | Secondary text on paper/surface (4.6:1) | Text on `--light` (4.1, fails) |
| `--green` | #315c3d | Primary buttons, active nav, links (7.0:1) | — |
| `--danger` | #9b4e37 | Warnings, holds, errors (5.4:1) | Decoration |
| `--blue` | #527f8d | Water bars, icons, large text ≥ 24 px (4.0:1) | Small text |
| `--gold` | #be8e3e | Bars, dots, highlights next to a text label (2.7:1) | **Any text** |
| `--light` / `--lime` | #e5eadb / #d9e9a6 | Fills, selected states, chips | Text colour |
| `--line` | #d8dcd0 | Borders, dividers | — |

**Fonts (keep):** Plex for UI, Fraunces for page titles and the wordmark, Mono for numbers and codes, Noto Sans Bengali (`Bangla`) for Bengali. Bengali text never uses Fraunces or Mono alone.

**Components to reuse before making anything new:** `.panel` · `.page-head` · `.button` · `.icon-button` · `.segmented` · `.tag` · `.source-pill` · `.notice` · `.disclosure` · `.empty` · `.data-table` / `.table-wrap` · `.form-field` / `.form-help` · `.field-card` · `.rotation-card` · `.step-indicator` · modal `#modal` · toast `#toast`.

---

## 3. Size fixes (MUST; the look stays, the numbers go up)

The base CSS uses 7–12 px text in many places, a 33 px icon button and 12 px buttons. Change sizes only:

| Element | Minimum |
|---|---|
| Body / reading text | **16 px**, line-height 1.5 (currently 15 px) |
| Labels, table cells, help text | 14 px |
| Tags, chips, eyebrows, source pills | **12 px** (none below) |
| Button text | 14 px |
| Any tappable control (button, icon-button, nav item, segmented option, chip, map control) | **44 × 44 px** hit area, ≥ 8 px apart |
| Bengali text | Same sizes or 1 px larger; never smaller than the English |

---

## 4. Screen recipe (every view uses this order)

```
┌───────────────────────────────────────────┐
│ Page head: question as title  · EN/BN     │  ← .page-head
├───────────────────────────────────────────┤
│ ACTION CARD                               │  ← answer + truth label
│ "Low corner holds water. Check the        │     + one next step
│  bund outlet before heavy rain."          │     (button)
│ ◈ Estimated · NASADEM 30 m · 2024         │
├───────────────────────────────────────────┤
│ Main visual (map / 3D / chart)            │  ← ONE visual, with legend
├───────────────────────────────────────────┤
│ ▸ Show details  (tables, numbers, maths)  │  ← .disclosure, closed
│ ▸ Sources       (source pills)            │
└───────────────────────────────────────────┘
```

- The **action card** follows the decision output contract (08 §2) in plain words: the answer, its truth label, its data date and footprint, and one safe next step.
- **One primary button per screen** (green). Everything else is secondary.
- Forms: visible label above every input (never placeholder-only), help text under it, errors next to the field in words.

---

## 5. Truth labels (one component, everywhere)

| Label | Icon | Words (EN · BN) | Style |
|---|---|---|---|
| Measured | ✓ | Measured · জমি থেকে মাপা | green text on `--light` |
| Estimated | ◈ | Estimated · স্যাটেলাইট অনুমান | ink text on `--light` |
| Scenario | ⬡ | Scenario · কাল্পনিক পরিকল্পনা | ink text, dashed border |
| Unknown | ⊘ | Unknown — add data · অজানা — তথ্য দিন | danger text, links to the entry form |

- Built on `.tag`, with icon + word + colour (never colour alone).
- `FARMER_REPORTED` shows "✓ Measured · by farmer".
- Tap the label → a small sheet with the source, date and pixel size.
- Icons are inline SVG, or the glyphs above as text. **No emoji icons** in the shipped app (the prototypes' 💧🌱🛟 are not ported).

---

## 6. Words

- Banglish and Bangla templates from 11 §3 are the voice: say what we see, what we don't know, and what to check.
- One idea per sentence; lead with the verb ("Check the outlet", "Add a soil test").
- No jargon on farmer screens: "wetness index (0–1)", not "GWETROOT". Jargon is allowed under "Show details" and in the Research lab.
- Numbers: round to what the evidence supports (e.g. "about 200 shotok", not "201.83"). Units on every number.
- Wetness is never shown as % (D-C6). No irrigation mm amounts and no doses outside the tiered rule (D-C1).

---

## 7. Navigation (D-C4)

- The sidebar keeps the 8 routes, grouped under the 5 farmer areas: **My field · Water · Soil · Crops · Recovery**, then the **Research desk**.
- Hash routes stay deep-linkable (`#water`). Back button works. The current page is marked `aria-current`.
- Under 700 px the existing mobile menu is used; no new bottom bar.
- The Evidence register stays in the sidebar.

---

## 8. 3D view (toggle inside `#field` and `#water`)

Patterns borrowed from GeoPard (layers + probe) and OptiSurface (water flow, before/after):

| Rule | Detail |
|---|---|
| Off by default | `2D map │ 3D view` segmented control; the 2D map is always available and is the fallback when WebGL is missing |
| One layer at a time | Layer picker (natural · elevation · water · crop health · soil). Each layer shows its own legend and truth label |
| Tap to probe | Tapping a spot opens a card: elevation, water, NDVI, with truth labels — the same card style as the action card |
| Water flow | Arrows point to where water goes; the low spot gets a text label ("Water collects here first") |
| Before / after | A proposed drain is shown with a `Now │ With drain` toggle, never both mixed |
| Always visible chip | "Real satellite + illustrative 3D — check locally" (`SCENARIO` geometry) |
| Controls | Drag to rotate, pinch to zoom, **Reset view** button (44 px); damping on; no auto-spin |
| Exaggeration | Fixed 2.5× with the label "Height exaggerated 2.5×" |
| Performance | Self-hosted three.js; mesh ≤ 64 × 64; render only on interaction; pause when off-screen |
| Motion | Respect `prefers-reduced-motion`: no camera fly-ins, instant transitions |

---

## 9. Showing each kind of data (borrowed patterns, our rules)

| Data | Show it as | Borrowed from | Must also |
|---|---|---|---|
| Soil water by depth | Vertical depth bars (top / root zone / deep) with a status word: Dry · OK · Wet | CropX profile | Regional estimate → ◈ label; no mm amount; "add a probe/AWD reading" link |
| Water flow & drainage | Arrows + low-spot label; drain before/after toggle | OptiSurface | "Needs field survey" note; drain cost/area only from documented formulas |
| Soil nutrients | **One nutrient per map or card** (pH, N, P, K, Zn, B separately), each with class and label | SoilOptix | Unknown P/K → "needs soil test", never a colour |
| Crop health over time | A timeline of dated images; compare two dates side by side; cloudy dates shown as gaps | OneSoil | Below 25% valid pixels → "No reliable observation" |
| Change and uncertainty over time | Month/year slider with a range band | SoilTwin | Band labelled as a range between products, not certainty |
| Crop and fertilizer advice | Bangla-first cards with the source pill | Khamari-DAP | Tiered rule (05); BARC numbers labelled "Regional guideline — not site-tested" |

Charts: always a legend and axis units, colour + label for every series, and a text summary line above the chart ("July: no usable images").

---

## 10. States (every view handles all five)

| State | Show |
|---|---|
| Loading | Keep the space reserved (no layout jump); a short "Loading field data…" line |
| Empty | What is missing + one action ("No soil test yet — Add soil test") |
| Unknown | The ⊘ label with the entry link (§5) |
| Error | Plain sentence + retry or alternative; never a raw error code on farmer screens |
| Example / demo | A visible "Example — not your field" banner on the screen and in print/export |

---

## 11. Layout and responsive

- Design for a 360 px-wide phone first, then the existing breakpoints (700 / 960 / 1200 / 1600 px).
- No horizontal page scroll. Wide tables go in `.table-wrap` (scroll inside) or become cards under 700 px.
- Maps and 3D: full panel width, 4:3 on phones; controls never cover the legend.
- Print: the existing print styles; the report keeps truth labels and sources.
- Respect `prefers-reduced-motion` (the base CSS already does). Transitions 150–250 ms, only opacity/transform.

---

## 12. Done checklist (MUST pass, paste into the PR / card result)

- [ ] Uses existing tokens and classes; no new colour hex, font or UI library
- [ ] Page title is the question; action card first; details collapsed
- [ ] Every number has a truth label and a unit; Unknown is stated, not blank
- [ ] Every string is `t(en, bn)`; both languages checked on screen
- [ ] Text ≥ 16 px (body), ≥ 12 px (smallest); touch targets ≥ 44 px
- [ ] No text in `--gold`; `--blue` only as large text; nothing conveyed by colour alone
- [ ] Keyboard: everything reachable, focus ring visible; icons have labels
- [ ] All five states handled (§10)
- [ ] 360 px phone: no horizontal scroll; 3D has a 2D fallback
- [ ] Offline build makes no network request
- [ ] No wetness %, no unsourced prototype number, no dose outside the tiered rule
- [ ] `npm test` passes (views render in EN and BN)

---

## 13. Don't

- Don't restyle the app, add a dark mode or change the brand.
- Don't put two visuals or two primary buttons on one screen.
- Don't show 3D by default, auto-rotate it or stack layers.
- Don't use emoji as icons, placeholder-only labels, hover-only actions, or tiny tap targets.
- Don't copy features from the reference platforms (sensors, drone mapping, fertilizer maps). Only their presentation patterns are borrowed.

*Reference platforms (patterns only):* GeoPard (3D layers, probe), CropX (depth moisture profile), OptiSurface (water flow, before/after), SoilOptix (one nutrient per map), SoilTwin (time + uncertainty), OneSoil (simple date compare), BARC Khamari-DAP (Bangla-first advice). *Rule source:* ui-ux-pro-max UX guidelines (touch target, colour-only, empty states, table overflow) and the three.js stack guidelines (OrbitControls with damping).
