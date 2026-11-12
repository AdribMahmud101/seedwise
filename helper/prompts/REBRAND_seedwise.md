# REBRAND — rename the product from "Ropon Radar" to **SeedWise** (≤35 min, run alone)

The owner chose the English name **SeedWise** (global hackathon). Replace the brand everywhere a person can see it:
- App title, sidebar/header logo text ("Ropon Radar" + Bengali subtitle "রোপণ রাডার" → "SeedWise"; Bengali UI may show "SeedWise" too — do not translate the brand), `<title>`/metadata (`app/layout.js`), PWA manifest (name, short_name, description), service-worker cache labels shown to users, print/export headers and footers ("ROPON RADAR / MITHAPUKUR" → "SEEDWISE / MITHAPUKUR"), Planty texts, how-to/guide copy, alt texts, README, docs/, AGENTS.md mentions, package.json "name"/"description" (name: "seedwise").
- **Splash screen**: find the startup/loading splash (grep splash / boot / loader in app/ and src/legacy/) and redo it with the new name: SeedWise wordmark + the existing leaf mark, short tagline "Plant smarter every season · NASA Earth data", smooth fade/scale in, ≤1.5 s, respects reduced motion. Make sure it shows correctly on 412 px and desktop.
- Logo: keep the current leaf icon; regenerate any icon/OG image that has the old name baked in (SVG text) if present.

## Keep unchanged (breaking risk)
- localStorage/sessionStorage keys (`ropon_*`) — users' saved plans live there. Leave the key strings as they are.
- Modal endpoint URLs (`adribmahmud101--ropon-flood-...`, `...ropon-outlook-...`), the domain `roponradar.onefusionlab.systems`, wrangler worker name/routes, data file names, CSS class names and JS identifiers that contain "ropon" (internal, invisible) — do not rename identifiers just for branding.
- Test files: update only assertions on visible brand text.

## Done when
`grep -rniE "ropon radar|রোপণ রাডার" app src public/*.json public/*.webmanifest README.md docs` returns no user-visible hits (list any intentional leftovers in the commit message). `node --check`, `npm test` fail 0, `npm run build` passes. One commit.
