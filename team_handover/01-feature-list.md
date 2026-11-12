# 01 · Feature list

This is what SeedWise does today, page by page. Everything shown to the user comes from real data — NASA products, our two models on Modal, or cited agricultural research. Where a number is modelled or estimated, the page says so with a small tag (*Estimated*, *Scenario*, *Modelled*), and every NASA-derived value carries a NASA badge that opens a short fact card.

The app works in **English and Bengali** (one tap in the top bar), is built **mobile-first**, and most pages keep working offline once loaded.

---

## Pages (sidebar navigation)

### 01 · My field (`#field`)
The starting point. "Find your plot, read the season, and plan what comes next."
- **Field switcher** for the three prepared fields, as a segmented control with number badges.
- **Satellite map (hero):** high-detail photo, Sentinel-2 natural colour (10 m) and an NDVI greenness layer. Floating glass controls on the map: layer switch, Layers pop-up (opacity, context lines, low ground), zoom / reset / locate / fullscreen, source and coordinates chip, and Pick on map / District / Edit boundary.
- **Boundary editing:** draw or adjust your field; area updates live in hectares, acres and decimals.
- **Plot dossier:** boundary area, cultivable area (after bunds and drains), field boundary source, planning crop, expected harvest.
- **Next decision:** the recommended rotation for this field and a glowing **Explore rotations** button (always on the first screen; a pinned bar on phones).
- **Historical observations:** monthly soil wetness, soil water, rainfall, temperature and crop water use for the selected month, each with its NASA source.
- **Guide me:** Planty walks you through the page. Before you have a plan this sits in a welcome banner; once you have a plan it stays as a single Guide me button.

### 02 · Rotation studio (`#rotations`)
Where the farmer chooses what to grow across the year.
- **AI decision helper — "Plan your own crops":** pick up to 2 crops (or type any crop or fruit). Planty checks the idea against this field and the research and gives an honest verdict (*Recommended*, *Possible with conditions*, *Not suitable*), a 12-month calendar, reasons, risks, what you'd need, and better options if it won't work.
- **One-tap recommended plans** for the field (e.g. Aman → Boro, Aman → Potato, Potato → Mungbean).
- **Animated AI check:** Planty visibly works through the data sources step by step (with ticks) before the answer streams in.
- **Standard rotations, scored** against the farmer's priorities (water, income, risk, labour), revealed after the AI check.
- **3D soil and crop studio:** the field as a 3D block with soil layers (topsoil, root zone, deep soil), a Jan–Dec timeline that plays the year month by month (always from January), and 3D / slice / top views.
- **Use in planner:** hands the chosen plan to the Planting planner.

### 03 · Planting planner (`#planner`)
Turns the plan into rows, spacing and plant counts.
- **3D field preview** of the actual plot with rows, bunds, drains and measurements; *Whole year* view shows each season's crop in its own strip. 3D / Top view, zoom, drag to rotate.
- **Planting settings:** row and within-row spacing per crop, land split, usable area, and a **Recommended setup** button that applies research spacing in two clicks with a smooth animation.
- **Plants to sow** and per-season numbers, updated live.
- **Save as my plan** is always visible on every screen size (pinned in the settings panel on desktop, a fixed bar on tablets and phones).
- Fits the screen on desktop: preview and settings without page scrolling.

### 04 · My plans (`#plans`)
- Saved plans as cards: open, edit, rename, duplicate, delete (with an on-page confirm), download.
- **Re-check with Planty:** re-evaluates an edited plan and shows the updated verdict.

### Your plan report (`#plan` and `#plan/<id>`)
Opens automatically after saving a plan.
- **Planty pipeline:** a slow, animated, multi-step build of the report — thinking, loading data, water resilience (NASA GRACE-FO), the **live disaster prediction models** with timings, disaster-tolerant varieties from our research, NASA data check, soil, water, weather — then the report fills in.
- **Summary band**, **rotation overview** (Jan–Dec strip with a "Now" marker and one line per crop), **your numbers**, **step-by-step checklist** (tickable, saved), **Planty's summary**, **season calendar**, **whole-year 3D field** with full controls, and **Keep your plan** (download as HTML, print / save as PDF).
- Direct links like `#plan/<id>` open a specific saved plan.

### 05 · Past seasons (`#seasons`)
- Five years of rainfall and soil wetness for the field (2021–2025), on proper charts (Recharts): monthly rain from two NASA products, soil wetness at surface and root zone, and a **year-by-year rainfall comparison** with exact mm.
- **Satellite water check:** which clear days in the 2024–25 monsoons showed standing water, from our Prithvi flood model.

### 06 · Disaster recovery (`#recovery`)
- **Today's analytics (top of page):** a green ✓ / amber ! / red ⚠ status for the field, built every morning from our two models — flood (Prithvi on NASA HLS) and the 3-month forecast (Chronos on NASA POWER) — with dry soil, rain and heat signals, a plain comment, model strength meters and NASA badges.
- **Emergency numbers first:** 999, Fire Service 102, Krishi Call Center 16123 (tap to call), with official sources.
- **Flood / Drought / Fire** recovery paths: stage-by-stage actions, a field readiness checklist (tap to tick), when and what to replant, restoring soil, borders and trees, and a printable recovery plan.

### Hidden routes (still work by URL)
- `#water` — Water & resilience (its content now appears inside the plan report pipeline).
- `#research` — Research lab (hidden from navigation; no links to it remain in the UI).

---

## Shared features (on every page)

### Ask Planty (floating button → large window)
- **Chat tab:** friendly answers in the app language, or **Banglish** if you type Banglish. If you have a plan it is **always attached** ("✓ Your plan is attached"), so answers use your crops, months and field. Answers render as clean **Markdown** (lists, bold, links). Quick-question chips. When Planty proposes a plan change you can **Apply** it (with Undo).
- **Clinic tab:** take or upload a crop photo → **Meta SAM 3.1** segments leaves and damaged areas → a vision model plus our **cited disease reference** (13 diseases across Rangpur crops) gives the top diagnoses with confidence bars, a damaged-area gauge, the segmentation overlay (mask / outline / original), pest-management steps, when to call DAE 16123, and sources. Three **field photos** (rice, potato, tomato) show stored real results instantly.

### Notifications (bell in the top bar)
- Unread count badge, panel with mark-all-read, dismiss, and deep links.
- **Daily disaster brief:** computed once a day at 06:00 Bangladesh time by a scheduled job that calls our Modal models.
- **Next task** from your plan.
- **Planty suggestion:** once a day per plan, the AI looks for one evidence-backed improvement (for example a submergence- or drought-tolerant rice variety from our research shortlist). Review side by side → **Approve** (with 10-second Undo) or **Not now**.
- **Toasts (Sonner-style):** on first visit the real unread notifications slide in as a stack that stays until dismissed; after a plan is completed a timed sequence plays — disaster analytics → Planty suggestion → next task.

### Guide and journey
- **Guided season journey:** Field → Rotation → Planner → Plan, with a step bar and the Planty coach panel (always-visible Hide).
- **Watch Rahim's journey:** a narrated example walkthrough.
- **Guide me** on My field.

### Under the hood
- **SeedWise brand**, splash screen, PWA-style offline support.
- **3D** built with three.js; WebGL contexts are released between pages so the 3D never goes blank.
- **Cloudflare Worker** for the AI endpoints (rate-limited per endpoint, validated output, no secrets in the browser) and the daily scheduled job (Workers KV storage).

---

## Planned (not started): Calendar

A new sidebar item, **Calendar**, between My plans and Past seasons.

**Goal:** one interactive season calendar that shares context with Planty and the planner, so the farmer sees *what to do, when* — and can act on it.

Planned scope:
- **Month / week / agenda views** of the saved plan: sowing, transplanting, fertiliser windows, irrigation, harvest, and checklist to-dos, colour-coded by crop.
- **Two-way with the planner:** dragging a sowing date updates the plan (and the 3D/plant counts); changing the plan updates the calendar.
- **To-dos:** tick tasks off (shared with the plan checklist and the bell's "next task").
- **Weather and risk overlay:** the daily disaster brief and the 3-month outlook shown on the days and months they apply (e.g. "drier than normal" over November).
- **Planty in context:** "Ask Planty about this week" opens chat with the calendar week attached; Planty can propose date shifts as approve-able suggestions (same approve/undo flow as notifications).
- **Reminders:** feed the notification bell and toasts (e.g. "Boro seedbed in 5 days").
- Bilingual, mobile-first, works offline from the saved plan.
