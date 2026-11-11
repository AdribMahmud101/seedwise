// `npm run capture:howto` entry point. The pipeline itself is Python
// (Playwright + Pillow), matching the repo's existing headless-browser setup
// in tests/planty-guide.browser.py; Node just launches it against out/.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
if (!existsSync(join(root, 'out', 'index.html'))) {
  console.error('out/ not found. Run `npm run build` first.');
  process.exit(1);
}
const env = { ...process.env };
if (!env.PLAYWRIGHT_BROWSERS_PATH && existsSync('/root/.cache/ms-playwright')) {
  env.PLAYWRIGHT_BROWSERS_PATH = '/root/.cache/ms-playwright';
}
const run = spawnSync('python3', [join(root, 'scripts', 'capture-howto.py'), ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
});
process.exit(run.status ?? 1);
