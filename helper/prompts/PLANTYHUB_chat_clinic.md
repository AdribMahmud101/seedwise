# PLANTYHUB — universal "Ask Planty" pop-up with Chat + Clinic tabs

Owner: "make Ask Planty universally available; instead of opening only in the planner it opens a big modern pop-up window:
- no plan → it discusses normally, human-friendly answers (bn / en, or Banglish, following the app language);
- a plan exists → the plan is attached to the chat automatically; the user can still ask anything and work on plan suggestions;
- remove Crop clinic from the nav and make two tabs, Chat and Clinic, in this Planty window;
- Clinic: on the backend use the Meta API SAM model to segment the image, and an AI model together decides which issue or disease it is
  (load / implement a proper dataset for the AI); modern, eye-catching UI with confidence scores, proper segmentation output, charts."

## Existing code
- Launcher + small chat panel: src/legacy/planty.js (`.planty-launch`, `mountPlanty(getContext)`), mounted only by planner.js.
- Crop clinic page: src/legacy/clinic.js (route "clinic" in app.js pages list ~line 83). Worker: worker/index.js
  (Muse calls use `https://api.meta.ai/v1/chat/completions` with `env.MUSE_API_KEY`, model `env.PLANTY_MODEL || 'muse-ember-1.0'`;
  follow the same rate-limit / origin / body-size checks as rotationAdvisor).
- Models available on the owner's Meta API key (verified): muse-ember-1.0, muse-wonder-1.0, **sam-3.1**, muse-spark-1.3, muse-spark-1.2,
  muse-spark-1.1, muse-image-1.0, muse-voice-transcribe-1.0. Find the correct request format for sam-3.1 and for image input to
  muse-spark (Meta API docs / OpenAI-compatible `image_url` content parts); test with a real leaf photo. Never print or commit the key.

## 1. Planty hub (all pages)
- Mount the launcher from app.js render() on EVERY page (not only planner); remove the planner-only mount (keep its context provider).
- Click → large modal (desktop ~880×640 centered, glassy card, Planty header; mobile = full-screen sheet), focus trap, Esc closes,
  history-safe (`#…` route unaffected), reduced-motion respected. Tabs: **Chat** | **Clinic** (role=tablist).
- Opening from a deep link: support `#clinic` (old route) → open hub on Clinic tab over My field; remove "clinic" from the sidebar nav.

## 2. Chat tab
- Language: reply in the app language (state.lang). If the user writes Banglish (Bengali in Latin letters), reply in Banglish.
  Friendly, short, plain words; Bengali uses simple farmer-level words.
- Context auto-attached: if a saved/ready plan exists (journey.js getReadyPlan / listPlans; current active journey plan first), show an
  "Attached: <plan name> ✕" chip above the input; send a compact plan summary (field, crops, months, spacing, checklist status, latest
  verdict) + current page + field context (outlook/flood summary lines) with each request. User can detach.
- Plan actions: when Planty suggests a plan change, it returns a structured `suggestion` block (same schema as the NOTIFY refine:
  changes[{season,from,to,why}], newPlanting, evidence ids, confidence). Render it as a card with **Apply to plan** / **Not now**,
  reusing the NOTIFY approve + undo code path (src/legacy/app.js notification refine approve) — do not duplicate the save logic.
- Streaming-style reveal (fast typewriter) for answers; quick-reply chips ("Is my plan flood-safe?", "What do I do this month?",
  "Better crop for my field?"); conversation kept in sessionStorage (`ropon_planty_chat_v1`), cleared per plan change.
- Worker: `/api/planty-chat` (POST) — sanitize, rate-limit, ground in public/data/agronomy.json + tolerant-varieties.json + the attached
  plan; no invented numbers/prices/doses; cite source ids only from known sources.

## 3. Clinic tab (the WOW)
- Upload / take photo (camera on mobile), choose crop (auto-guess allowed), optional note. Client resizes to ≤1024 px JPEG before upload.
- Worker `/api/clinic-analyze` (POST, image ≤ 2 MB):
  1. **SAM 3.1** (Meta API) segments the image: plant/leaf region + lesion/damage regions (text-prompted concepts such as "leaf",
     "lesion", "spot", "insect" if supported). Return masks as polygons or RLE + areas.
  2. **Vision model** (muse-spark multimodal) receives the image + segmentation summary (lesion area %, count, colour stats computed in
     the worker or client) + a **disease knowledge base** and returns top-3 diagnoses with confidence, key visual evidence, actions.
  3. Validate JSON strictly (known disease ids only; confidence 0–1; no chemical doses beyond what the KB source states).
- Dataset / knowledge base: build `public/data/crop-diseases.json` for Rangpur crops (rice, potato, wheat, maize, mustard, lentil,
  mungbean, jute, tomato, chilli, mango, banana…) — each disease: id, crop, names (en/bn), pathogen/cause, visual symptoms, look-alikes,
  season/weather triggers, management (IPM first), and **source URLs** (BRRI, BARI, DAE, IRRI Rice Knowledge Bank, CABI/Plantwise, FAO,
  PlantVillage dataset papers). Real, cited content only. If a public labelled dataset helps (e.g. PlantVillage, Rice Leaf Diseases),
  reference it in the KB and use its class list for ids; do not ship large image sets in the repo.
- UI: photo with the SAM mask overlay (toggle mask / outline / original, lesion regions highlighted with a legend), lesion coverage % gauge,
  top-3 diagnosis cards with animated confidence bars, a small chart (e.g. confidence donut or bar), "why" bullets tied to visible evidence,
  next steps (IPM), when to call the extension officer (DAE 16123), source links, and "Ask Planty about this" → switches to Chat with the
  diagnosis attached. Low confidence (< 0.5) → say so plainly and suggest a clearer photo. Bilingual.
- Offline / API failure: clear message, no fake diagnosis.

## Constraints
- Real data only; no mock results, no placeholder diagnoses. Mobile is the main screen. Keep `ropon_*` storage keys.
- Don't break existing pages; the old Crop clinic page code can be reused inside the tab or retired.
- `npm test` fail 0 with new tests (language/Banglish detection helper, plan-attachment summary, request sanitizers, KB schema
  validation, clinic response validation); `npm run build` passes. Commit on the card branch with a clear message.
