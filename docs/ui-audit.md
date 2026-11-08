# UI/UX & Mobile Friendly Audit: All 8 Views and Evidence Register

Audit date: 8 Nov 2026  
Standard: `spec/15-ui-ux-spec.md` (binding) & `spec/14-decision-recommendations.md`  
Tested viewports: **360 px** (mobile), **768 px** (tablet), **1280 px** (desktop)  
Tested languages: **EN** (English) & **BN** (Bengali / বাংলা)  
Target views: `#field`, `#seasons`, `#rotations`, `#planner`, `#clinic`, `#water`, `#recovery`, `#research`, plus **Evidence register** modal.

---

## 1. Findings and Fix Log (view · issue · fix · done?)

| View | Issue | Fix | Done? |
|---|---|---|---|
| **Global / All** | Body font size was 15 px (spec §3 requires body reading text ≥ 16 px). | Updated `body` font rule in `app/style.css` to 16px/1.5. | Yes |
| **Global / All** | Font sizes < 12 px (7–11 px) across 67 rules in `app/style.css` and `app/recovery.css` (spec §3: nothing below 12 px). | Bumped all font sizes < 12 px to 12 px minimum in `app/style.css` and `app/recovery.css`. Verified via `grep -nE 'font-size:\s*([0-9]\|1[01])px' app/*.css`. | Yes |
| **Global / All** | Buttons had font size 12 px (spec §3: buttons 14 px). | Set `.button`, `.button.small`, and control buttons to 14 px font size. | Yes |
| **Global / All** | Touch target sizes were < 44×44 px (.button was ~31 px height, .icon-button 33×33 px, .mobile-menu ~20 px, .field-chip ~33 px, .segmented buttons ~25 px, .tabbar buttons ~36 px, .source-pill ~20 px, .lang-toggle buttons ~22 px). Spec §3 requires touch targets ≥ 44×44 px with ≥ 8 px gap. | Applied `min-height: 44px; min-width: 44px` with appropriate flex alignment and spacing across `.button`, `.icon-button`, `.mobile-menu`, `.lang-toggle button`, `.segmented button`, `.tabbar button`, `.field-chip`, `.nav-item`, `.source-pill`, and `.symptom-option`. | Yes |
| **Global / All** | Color limits audit per spec §2: verified no text in `--gold` (used only for borders and focus ring), `--blue` used only for borders, and no `--muted` text on `--light`. | Validated token usage in CSS against spec §2 table. Focus ring on `--gold` maintained with high visibility. | Yes |
| **Global / All** | Bengali text letter-spacing: negative letter-spacing (`-1.5px`, `-0.4px`, `-2px`, `-0.8px`) causes clipping and overlap on complex conjunct glyphs in Bengali. | Confirmed `.lang-bn` overrides font family with `Bangla` and uses neutral letter-spacing (`letter-spacing: 0` or standard) and higher line-height (1.5) preventing clipped characters. | Yes |
| **#field** (My Field) | At 360 px, the field map controls could cover map content or overline badges; map shell fixed height caused awkward aspect ratio. | Map shell uses responsive flex layout with minimum 320 px height and wraps controls cleanly with 8 px gap; map-overline and bottom badges set with `pointer-events: none` and capped max-width so controls remain unobstructed. | Yes |
| **#field** (My Field) | Field stat grid (`.data-row`) at 768 px and 360 px: 4-column layout crushed numbers into adjacent cells. | At ≤ 700 px, `.data-row` switches to 2 columns with borders adjusted, maintaining 14 px labels and ≥ 26 px numbers cleanly without overflow. | Yes |
| **#seasons** (Past seasons) | Image strip (`.image-strip`) 3-column thumbnail grid overflowed at 360 px; month label buttons were < 44 px high and compressed. | Set responsive gap, minimum touch targets on month navigation buttons, and allowed horizontal scrolling without breaking outer page boundary. | Yes |
| **#rotations** (Rotation studio) | `.priority-box` preset buttons (`Balanced`, `Save water`) and weight range sliders were cramped on mobile (< 44 px target). | Enhanced preset buttons to 44 px hit area and ensured full-width touch area for priority items and sliders on mobile. | Yes |
| **#rotations** (Rotation studio) | Action buttons in `.rotation-bottom` broke onto multiple lines awkwardly on 360 px screens. | Added flex-wrap and responsive toolbar spacing to keep buttons tappable and cleanly aligned. | Yes |
| **#planner** (Planting planner) | Canvas had fixed heights (370 px / 330 px) with rotate buttons below 44 px touch target. | Increased turn/view buttons in `.map-controls` to 44×44 px targets; canvas dynamically scales within panel width. | Yes |
| **#clinic** (Crop clinic) | Symptom checklist options (`.symptom-option`) were 9 px padding, font-size 11 px, touch target < 36 px. | Raised symptom option touch area to min-height 44 px, font size 14 px, padding 11 px, with clear focus ring and state indication. | Yes |
| **#water** (Water & resilience) | Soil reference table (`.data-table`) can exceed 360 px width. | Verified table is wrapped in `.table-wrap` with touch-friendly scrolling (`overflow: auto`); cells styled with 14 px font size and 12 px headers. | Yes |
| **#recovery** (Disaster recovery) | Hazard selection cards (`.rr-hazard`) at 360 px had radio check targets of only 16×16 px and small text (10–11 px). | Raised hazard cards to min-width 44 px, radio indicators to 24×24 px, font sizes to ≥ 12 px, and single-column form grid at ≤ 600 px viewport. | Yes |
| **#research** (Research lab) | Field observation table had small headers (9 px Mono) and action buttons (small padding < 30 px height). | Increased table headers to 12 px Mono, table cells to 14 px, and view/export buttons to 44 px touch targets. | Yes |
| **Evidence register** (Modal) | Modal close button was 33×33 px; source row items were closely packed without adequate tap targets on mobile. | Enlarged modal close button to 44×44 px with visible focus ring; source pill and links spaced with ≥ 8 px separation and 44 px touch target. | Yes |
| **#field** (My Field) | Leaflet zoom +/- (`a.leaflet-control-zoom-in/out`) buttons measured ~26–30 px touch target. | Set `.leaflet-bar a` (and `.leaflet-control-zoom-in/out`) to min 44×44 px hit area, centered with 22 px font. | Yes |
| **#seasons #water #research #recovery** | Source links (`a.source-link`) and plain links in `#recovery` (`.rr-official a`) had touch targets < 44 px in height. | Converted `.source-link` and `.rr-official a` to `inline-flex` with `min-height: 44px; padding: 6px 4px` ensuring full ≥ 44 px hit height. | Yes |
| **#rotations (8) #clinic (13) #seasons #water #research** | Inputs (range sliders, symptom checkboxes, form check labels) were under 44 px touch hit area. | Styled range sliders (`input[type="range"]`) with 44 px height; gave priority labels `min-height: 44px`; expanded `.check-label` to `min-height: 44px` with 20×20 px inputs; maintained `.symptom-option` ≥ 44 px at all viewports including ≤ 700 px; form-field inputs set to `min-height: 44px`. | Yes |
| **Mobile Menu** | Mobile hamburger button (`.mobile-menu`) was 20×20 px without minimum touch target bounding. | Gave `.mobile-menu` min-width 44 px and min-height 44 px, centered icon, keeping `aria-label` and `aria-expanded` attributes in sync. | Yes |

---

## 2. Responsive Viewport Summary

### 360 px (Mobile)
- **Navigation:** Sidebar collapses cleanly into slide-out drawer (`.sidebar.open`) triggered by 44×44 px hamburger button with shaded backdrop (`.nav-shade`).
- **Page Layout:** Single-column layout across all 8 views. No horizontal document overflow / scroll (`overflow-x` contained).
- **Controls & Typography:** All interactive targets ≥ 44×44 px. No font size below 12 px; body text 16 px; buttons 14 px.
- **Tables & Canvases:** Wide tables housed in `.table-wrap` for smooth horizontal pan. Map and 3D canvases span 100% panel width.

### 768 px (Tablet)
- **Navigation:** Header topbar with language toggle (44 px targets), breadcrumbs, and snapshot tag.
- **Grids:** 2-column equal and split grids (`.grid-two`, `.grid-equal`) balance visual panels and data cards cleanly without vertical crowding.
- **Cards & Inputs:** Forms and selectors format in 2-column grids with clear label placement above inputs and inline error help.

### 1280 px (Desktop)
- **Navigation:** Fixed 218 px left sidebar with distinct grouping for Field Workspace, Disaster Recovery, and Research Desk.
- **Workspaces:** Main container scales up to 1700 px maximum width. Multi-column dashboards, maps, and detailed evidence disclosures render in high contrast.

### 360 px Tap Target Measurement & Verification
Every interactive element listed in the UI2 brief was measured and verified for ≥ 44×44 px hit area at 360 px:
- **Leaflet zoom buttons (`#field`):** `.leaflet-bar a`, `.leaflet-control-zoom-in`, and `.leaflet-control-zoom-out` are styled with `width: 44px !important; height: 44px !important; line-height: 44px !important; font-size: 22px !important; display: flex !important; align-items: center; justify-content: center;`. Hit area: 44×44 px.
- **Source links (`#seasons #water #research #recovery`):** `.source-link` set to `display: inline-flex; align-items: center; min-height: 44px; padding: 6px 4px; box-sizing: border-box;`. Hit height: ≥ 44 px.
- **Recovery plain links (`#recovery`):** `.rr-official a` set to `display: inline-flex; align-items: center; min-height: 44px; padding: 6px 4px; box-sizing: border-box;`. Hit height: ≥ 44 px.
- **Inputs - range sliders (`#rotations`, `#seasons`, `#water`, `#research`):** `input[type="range"]` set to `height: 44px; min-height: 44px;`. Timeline and priority slider bars span full width or container with 44 px height. Hit height: 44 px.
- **Inputs - priority labels & rows (`#rotations`):** `.priority-item label` has `min-height: 44px; display: flex; align-items: center; cursor: pointer;` linked directly to range inputs. Hit height: 44 px.
- **Inputs - symptom checkboxes (`#clinic`):** `.symptom-option` maintains `min-height: 44px; padding: 10px 8px;` at ≤ 700 px and 360 px, housing a 20×20 px checkbox. Hit area: 100% width × ≥ 44 px.
- **Inputs - consent and agreement checkboxes (`#clinic`, `#research`):** `.check-label` has `min-height: 44px; display: flex; align-items: center; cursor: pointer;` with 20×20 px checkbox. Hit height: ≥ 44 px.
- **Inputs - text, number, date fields (`#water`, `#clinic`, `#research`, `#field`):** `.form-field input, .form-field select, .form-field textarea` set to `min-height: 44px; padding: 10px; font-size: 14px;`. Hit height: ≥ 44 px.

---

## 3. Bilingual Verification (EN & BN)
- Both English (`en`) and Bengali (`bn`) tested across all 8 views and 3 data packs (`mithapukur`, `pirganj`, `gangachara`).
- Bengali titles and text use `Bangla` font (`Noto Sans Bengali`) without negative letter-spacing, preserving full conjuncts and vowel marks without clipping.
- Automated tests pass for all combinations: `node --test tests/*.test.mjs` exits 0.

---

## 4. Spec 15 §12 Done Checklist

- [x] ✅ Uses existing tokens and classes; no new colour hex, font or UI library
- [ ] ❌ Page title is the question; action card first; details collapsed (Owned by future cards: UI3 / feature template refactor)
- [ ] ❌ Every number has a truth label and a unit; Unknown is stated, not blank (Owned by future cards: DATA1 / truth labels & provenance integration)
- [x] ✅ Every string is `t(en, bn)`; both languages checked on screen
- [x] ✅ Text ≥ 16 px (body), ≥ 12 px (smallest); touch targets ≥ 44 px (All controls verified ≥ 44×44 px hit area in UI2)
- [x] ✅ No text in `--gold`; `--blue` only as large text; nothing conveyed by colour alone
- [x] ✅ Keyboard: everything reachable, focus ring visible; icons have labels
- [ ] ❌ All five states handled (§10) (Owned by future cards: STATE1 / view loading, empty, and error state pass)
- [ ] ❌ 360 px phone: no horizontal scroll; 3D has a 2D fallback (No horizontal scroll ✅; 3D toggle & 2D fallback owned by future card 3D1 / roadmap step 5)
- [x] ✅ Offline build makes no network request
- [x] ✅ No wetness %, no unsourced prototype number, no dose outside the tiered rule
- [x] ✅ `npm test` passes (views render in EN and BN)
