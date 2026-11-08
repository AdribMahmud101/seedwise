# REPO1 · Make the repository ready for GitHub

## Goal
The project will be pushed to a new GitHub repo `ropon-radar`. Make it clean and understandable for judges and contributors. The supervisor creates the repo and pushes; you do not push.

## Do
1. Rewrite `README.md` (keep every fact from the current one; add, don't invent):
   - one-paragraph pitch (from `spec/01-product-overview.md`) + live demo link https://roponradar.onefusionlab.systems
   - NASA Space Apps Challenge 2026 · Rangpur pilot (Mithapukur · Pirganj · Gangachara)
   - the 8 views table (`spec/02-core-views.md`)
   - quick start: `npm ci`, `npm run dev`, `npm test`, `npm run build`, `npm start`; deploy: `npm run deploy` (Cloudflare Workers static assets, `wrangler.jsonc`)
   - data and evidence (keep the existing "Included evidence" and "Reproduce the data" sections)
   - links: `spec/README.md` (spec index), `spec/15-ui-ux-spec.md` (UI rules), `docs/`
   - data honesty statement (frozen 2024 / 2021–2025 data, illustrative outlines, no live NASA call)
   - licence: Apache-2.0 (existing `LICENSE`); credits → `docs/credits.md`
2. `.gitignore`: make sure `node_modules/`, `.next/`, `out/`, `.wrangler/`, `*.log`, `.env*` are ignored. Don't untrack source files.
3. Secret scan: `git grep -nIiE '(api[_-]?key|secret|token|password)\s*[:=]'` and `git ls-files | grep -iE '\.env|\.pem|credentials'`. Report results in your final message; remove nothing without listing it.
4. Note in the README (Repository layout) that `dist/` is the archived pre-Next.js build and `helper/prompts/` holds fleet task briefs.

## Files in scope
`README.md`, `.gitignore` only.

## Out of scope
App code, CSS, data, spec files, deleting folders, pushing, creating the repo.

## Acceptance
- `npm test` exits 0
- `git status --short` is clean after your commit
- `git add -A && git commit -m "REPO1: GitHub-ready README and .gitignore"`
