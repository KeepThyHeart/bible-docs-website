/**
 * Screenshot Capture for the Web App Docs
 * =======================================
 *
 * Takes one PNG per screenshot placeholder in the Docusaurus `web/` docs, and
 * can then rewrite those placeholders into real Markdown images.
 *
 * A placeholder in the docs looks like this:
 *
 *     <!-- shot: search-keyword-results — Standard Search results for a query -->
 *
 * The name before the em dash must match a `register(...)` call below; `--check`
 * enforces that in both directions so the docs and this script cannot drift
 * apart silently. The text after it becomes the image's alt text on `--embed`.
 *
 * Quick start
 * -----------
 *   cd bible-website
 *   npm install
 *   npx playwright install chromium
 *   npm run screenshots            # starts a server, captures everything
 *   npm run screenshots -- --embed # rewrite the docs to point at the PNGs
 *
 * By default the script starts its own copy of the web app (see "The server"
 * below). To shoot against a server you are already running instead, set
 * `BIBLE_WEB_URL`:
 *
 *   BIBLE_WEB_URL=http://localhost:3100 npm run screenshots
 *
 * The server
 * ----------
 * The web app lives in the *app repository*, cloned beside this one as
 * `../bible` or pointed at with `$BIBLE_REPO` — see `lib/app-repo.ts`. Only the
 * capture needs it; `--list`, `--check` and `npm run build` do not.
 *
 * Its `apps/web` reads the module registry from `BIBLE_DATA_DIR` and resolves
 * module files against `BIBLE_MODULES_DIR`. The defaults point at that
 * repository's shared `data/`, which on most machines is empty because
 * `npm run init` puts the modules under `apps/desktop/data`. A server started
 * with the defaults therefore comes up with no Bibles at all and every shot
 * times out.
 *
 * So unless `BIBLE_WEB_URL` says otherwise, this script:
 *
 *   1. finds a data directory that actually has a `main.db` and modules,
 *   2. copies the registry into `.screenshot-data/` next to this package,
 *      alongside a `site-config.json` that switches on every documented
 *      feature (Ideas Search, entity cards) so the shots show the app as the
 *      docs describe it,
 *   3. starts `npm run e2e:server` in the app repository's `apps/web` against
 *      that directory with `NO_AUTH=1`, and shuts it down at the end.
 *
 * Sample content — the passages, queries, notes and Strong's numbers that
 * appear *in* the pictures — is declared in `scripts/lib/sample-content.ts`,
 * not scattered through the shots below. Edit it there and re-run the affected
 * shot with `--shot=<name>`.
 *
 * Auth: a server you supply yourself may sit behind the shared-password gate.
 * The script detects the login page and submits `SITE_PASSWORD` (default
 * `bible3`) before capturing.
 *
 * Options
 * -------
 *   --list             list shot names and exit
 *   --check            verify shots ↔ doc placeholders line up, then exit
 *   --embed            rewrite doc placeholders into Markdown images, then exit
 *   --page=<name>      only shots for that doc page
 *   --shot=<a,b,c>     only these shots (comma-separated)
 *   --keep-server      leave the spawned server running (for debugging)
 *
 * Env
 * ---
 *   BIBLE_REPO         path to the app repository (default: `../bible`)
 *   BIBLE_WEB_URL      shoot against this server instead of spawning one
 *   SITE_PASSWORD      password to submit if a login page appears
 *   SCREENSHOT_PORT    port for the spawned server (default 3210)
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PlaceholderIndex } from './lib/placeholders';
import { appRepoRoot, webPackage } from './lib/app-repo';
import { pollSettled, pollUntil } from './lib/poll';
import { PASSAGES, SEARCHES, STRONGS, VERSES, WEB_CHAPTERS } from './lib/sample-content';

// ---------------------------------------------------------------------------
// Paths & constants
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PACKAGE_ROOT = resolve(__dirname, '..');

const DOCS_DIR = resolve(PACKAGE_ROOT, 'web');
const OUTPUT_DIR = resolve(PACKAGE_ROOT, 'static/img/web');
/** Path the docs reference the images by, served from `static/`. */
const PUBLIC_IMG_PATH = '/img/web';
const SCRATCH_DATA_DIR = resolve(PACKAGE_ROOT, '.screenshot-data');

const PORT = process.env.SCREENSHOT_PORT ?? '3210';
const EXTERNAL_URL = process.env.BIBLE_WEB_URL;
const BASE_URL = EXTERNAL_URL ?? `http://localhost:${PORT}`;
const SITE_PASSWORD = process.env.SITE_PASSWORD ?? 'bible3';

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 393, height: 852 }, // Pixel 5
};

// The passages, queries, Strong's numbers and sample text these shots put on
// screen all live in `scripts/lib/sample-content.ts`. Change them there.
const { psalm23_1: PSALM_23_1, john3_16: JOHN_3_16, john1_1: JOHN_1_1,
        firstSamuel17_45: FIRST_SAMUEL_17_45 } = VERSES;

// ---------------------------------------------------------------------------
// Doc placeholders
// ---------------------------------------------------------------------------

/**
 * The docs' side of the contract, shared with the desktop capture script — see
 * `scripts/lib/placeholders.ts` for the placeholder syntax and what `--check`
 * and `--embed` do with it.
 */
const placeholders = new PlaceholderIndex({
  docsDir: DOCS_DIR,
  outputDir: OUTPUT_DIR,
  publicImgPath: PUBLIC_IMG_PATH,
});

// ---------------------------------------------------------------------------
// Data directory & server
// ---------------------------------------------------------------------------

interface DataPaths { dataDir: string; modulesDir: string; }

/**
 * Where a module registry may live, in the order the web server itself prefers.
 * `modulesDir` is what `database_path` resolves against, so it is the *parent*
 * of `modules/`, not `modules/` itself. Resolved on call, not at import: the
 * app repository only has to exist for a capture run.
 */
function registryCandidates(): DataPaths[] {
  const repo = appRepoRoot();
  return [
    { dataDir: join(repo, 'apps/web/data'), modulesDir: join(repo, 'data') },
    { dataDir: join(repo, 'apps/desktop/data'), modulesDir: join(repo, 'apps/desktop/data') },
  ];
}

/** Site config for the capture run: everything the docs describe, switched on. */
const SCREENSHOT_SITE_CONFIG = {
  auth: { enabled: false },
  features: {
    tagGraph: true,
    semanticSearch: true,
    pwa: true,
  },
  ui: { defaultTheme: 'light', defaultModule: 'KJV', defaultDisplayMode: 'standard' },
  privacy: { mode: 'strict' },
};

/** The `modules` section of a site config: which modules the server lists. */
type SiteModules = Record<string, {
  modules: Record<string, { active: boolean; sortOrder: number }>;
  sections: { title: string; modules: string[] }[];
}>;

/** Registry module types the site config governs, and the section each goes in. */
const MODULE_SECTIONS: Record<string, { key: string; title: string }> = {
  bible: { key: 'bibles', title: 'Translations' },
  commentary: { key: 'commentaries', title: 'Commentaries' },
  dictionary: { key: 'dictionaries', title: 'Dictionaries' },
};

/**
 * A `modules` section switching on every Bible, commentary and dictionary the
 * registry lists, in install order. Other types (topical indexes, cross
 * references) are not governed by the config and are always served.
 *
 * Read with the web app's own `better-sqlite3-web`, resolved out of the app
 * repository, so this package takes on no native dependency of its own.
 */
function modulesFromRegistry(mainDb: string): SiteModules {
  const Database = createRequire(join(webPackage(), 'package.json'))('better-sqlite3-web');
  const db = new Database(mainDb, { readonly: true, fileMustExist: true });
  try {
    const rows = db.prepare(
      'SELECT module_type, abbreviation FROM module_metadata ORDER BY module_id',
    ).all() as { module_type: string; abbreviation: string | null }[];

    const result: SiteModules = {};
    rows.forEach(({ module_type: type, abbreviation }, index) => {
      const section = MODULE_SECTIONS[type];
      if (!section || !abbreviation) return;
      const config = result[section.key] ??= { modules: {}, sections: [{ title: section.title, modules: [] }] };
      config.modules[abbreviation] = { active: true, sortOrder: index + 1 };
      config.sections[0].modules.push(abbreviation);
    });
    return result;
  } finally {
    db.close();
  }
}

function prepareDataDir(): DataPaths {
  const candidates = registryCandidates();
  const source = candidates.find((c) => {
    if (!existsSync(join(c.dataDir, 'main.db'))) return false;
    const mods = join(c.modulesDir, 'modules');
    return existsSync(mods) && readdirSync(mods).some((f) => f.endsWith('.db'));
  });

  if (!source) {
    const tried = candidates
      .map((c) => `  - registry ${join(c.dataDir, 'main.db')}, modules under ${join(c.modulesDir, 'modules')}`)
      .join('\n');
    throw new Error(
      'Could not find a module registry with modules beside it. Looked in:\n' + tried +
      "\n\nPut the .db files under one of those `modules/` directories and run `npm run init` at the app repository's root." +
      '\nOr point BIBLE_WEB_URL at a server you have already started.',
    );
  }

  mkdirSync(SCRATCH_DATA_DIR, { recursive: true });
  // Copy the registry rather than reading the developer's directory directly:
  // the server writes to it (hashing a password, for one), and a screenshot run
  // has no business touching someone's real data.
  // `main.db` and its write-ahead log only. The `-shm` shared-memory file is
  // locked whenever anything has the database open — the desktop app, a stray
  // server — and copying it fails with a bare UNKNOWN from Windows. SQLite
  // rebuilds it on open, so it is not worth the trouble.
  copyFileSync(join(source.dataDir, 'main.db'), join(SCRATCH_DATA_DIR, 'main.db'));
  const wal = join(source.dataDir, 'main.db-wal');
  if (existsSync(wal)) {
    try {
      copyFileSync(wal, join(SCRATCH_DATA_DIR, 'main.db-wal'));
    } catch {
      // A locked WAL means the registry copy is a moment stale, which for a
      // list of installed modules is of no consequence.
    }
  }
  // Module visibility comes from the source directory's `settings.json` when it
  // has one, which is why the config above does not define it. Without any
  // module config the server takes its fail-safe branch and lists no modules —
  // the translation picker then reads "No Bible modules available" — so a
  // directory without one (what `npm run init` produces) gets every installed
  // module switched on instead.
  const settings = join(source.dataDir, 'settings.json');
  let modules: SiteModules | undefined;
  if (existsSync(settings)) {
    copyFileSync(settings, join(SCRATCH_DATA_DIR, 'settings.json'));
  } else {
    modules = modulesFromRegistry(join(SCRATCH_DATA_DIR, 'main.db'));
    console.log(`No settings.json in ${source.dataDir}; showing every installed module.`);
  }

  writeFileSync(
    join(SCRATCH_DATA_DIR, 'site-config.json'),
    JSON.stringify({ ...SCREENSHOT_SITE_CONFIG, ...(modules && { modules }) }, null, 2),
    'utf-8',
  );

  // Semantic search and the tag graph are switched on above, but they only work
  // if the server has the files. Say so rather than letting the shots fail.
  if (!existsSync(join(source.dataDir, 'tag_graph.db'))) {
    console.warn('[warn] no tag_graph.db — entity-card shots will be skipped.');
  }

  console.log(`Registry:  ${join(source.dataDir, 'main.db')}`);
  console.log(`Modules:   ${join(source.modulesDir, 'modules')}`);
  return { dataDir: SCRATCH_DATA_DIR, modulesDir: source.modulesDir };
}

async function waitForServer(url: string, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/api/health`);
      // 401 counts as up. A deployment behind the shared-password gate answers
      // every route, health included, with 401 until the browser has posted the
      // password — and the browser does that later, in `passLoginGate`. Waiting
      // for 200 here meant an external `BIBLE_WEB_URL` that was running
      // perfectly well timed out before a single shot was attempted.
      if (res.ok || res.status === 401) return;
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server at ${url} did not answer /api/health within ${timeoutMs}ms.`);
}

async function startServer(): Promise<ChildProcess> {
  const { dataDir, modulesDir } = prepareDataDir();

  console.log(`Starting web server on port ${PORT} …`);
  // `npm run` rather than a path into node_modules/.bin: the bare `tsx` there is
  // a shell script cmd.exe cannot run. `shell: true` for the same reason.
  const child = spawn('npm', ['run', 'e2e:server'], {
    cwd: webPackage(),
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT,
      NO_AUTH: '1',
      DISABLE_RATE_LIMIT: '1',
      BIBLE_DATA_DIR: dataDir,
      BIBLE_MODULES_DIR: modulesDir,
    },
  });

  // Keep the server's own diagnostics reachable — a failed shot is usually a
  // missing module, and the server is the only thing that says so.
  const log: string[] = [];
  child.stdout?.on('data', (d: Buffer) => log.push(d.toString()));
  child.stderr?.on('data', (d: Buffer) => log.push(d.toString()));
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`Server exited with code ${code}:\n${log.join('')}`);
    }
  });

  try {
    await waitForServer(BASE_URL);
  } catch (err) {
    console.error(`Server output:\n${log.join('')}`);
    stopServer(child);
    throw err;
  }

  // Without this, interrupting a run (Ctrl+C) orphans the server: it keeps the
  // port and holds the scratch database open, and the next run cannot even
  // delete `.screenshot-data`.
  const onSignal = () => { stopServer(child); process.exit(130); };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  return child;
}

/**
 * Kill the server and everything it spawned.
 *
 * `spawn(..., { shell: true })` — needed because cmd.exe cannot run the bare
 * `tsx` shim — means the child is a shell, and the Node process doing the
 * serving is its grandchild. `child.kill()` reaps the shell and leaves the
 * server holding port and database, so on Windows the whole tree has to go.
 */
function stopServer(child: ChildProcess): void {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32' && child.pid) {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', shell: true });
  } else {
    child.kill();
  }
}

// ---------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------

type ShotFn = (page: Page) => Promise<void>;
interface Shot {
  name: string;
  page: string;
  platform: 'desktop' | 'mobile';
  fn: ShotFn;
  /** Cannot be captured from inside the app (browser or OS chrome). */
  manual?: boolean;
}

const shots: Shot[] = [];

function register(page: string, platform: 'desktop' | 'mobile', name: string, fn: ShotFn): void {
  shots.push({ name, page, platform, fn });
}

function registerManual(page: string, platform: 'desktop' | 'mobile', name: string, why: string): void {
  shots.push({
    name,
    page,
    platform,
    manual: true,
    fn: async () => { console.warn(`[manual] ${name}: ${why}`); },
  });
}

/** Submit the shared site password if the server put up its login page. */
async function passLoginGate(page: Page): Promise<void> {
  const field = page.locator('input[name="password"]');
  if (await field.count() === 0) return;
  console.log('Login page detected — submitting SITE_PASSWORD.');
  await field.fill(SITE_PASSWORD);
  await Promise.all([page.waitForNavigation(), field.press('Enter')]);
  if (await page.locator('input[name="password"]').count() > 0) {
    throw new Error('Login rejected. Set SITE_PASSWORD, or run the server with NO_AUTH=1.');
  }
}

/**
 * Open the home screen.
 *
 * Loading `/` does not land there: the app restores a passage and rewrites the
 * URL to a hash, so the reading area is what you get. On desktop the home
 * screen is the house button at the left of the Bible tab bar.
 */
async function gotoHome(page: Page): Promise<void> {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await passLoginGate(page);
  await page.waitForSelector('.bible-tab-bar', { timeout: 30_000 });
  const homeBtn = page.locator('.bible-tab-bar__home');
  if (await homeBtn.count() > 0) await homeBtn.click();
  await page.waitForSelector('.home-screen', { timeout: 15_000 });
}

/** Navigate by hash: `#/<moduleAbbr>/<book>/<chapter>[/<verse>]`. */
async function gotoChapter(page: Page, modRef: string): Promise<void> {
  await page.goto(`${BASE_URL}/#/${modRef}`, { waitUntil: 'domcontentloaded' });
  await passLoginGate(page);
  // `.verse` is what VerseRenderer emits; waiting on the container alone would
  // pass while the chapter was still loading.
  await page.waitForSelector('.verse', { timeout: 30_000 });
}

/** Click a verse so the study and commentary panels move to it. */
async function selectVerse(page: Page, verseId: number): Promise<void> {
  const verse = page.locator(`[data-verse-id="${verseId}"]`);
  await verse.waitFor({ timeout: 10_000 });
  await verse.click();
}

/** Switch the right-hand panel to one of its tabs. */
async function openRightPaneTab(page: Page, label: 'Study' | 'Commentary' | 'Topics' | 'Dictionary'): Promise<void> {
  const tab = page.locator('.right-pane-tabs__tab', { hasText: new RegExp(`^${label}$`) });
  await tab.waitFor({ timeout: 10_000 });
  await tab.click();
}

/**
 * Expand one of the Study tab's collapsible sections.
 *
 * Every section starts collapsed — `StudySection`'s `defaultExpanded` defaults
 * to false and `StudyPane` does not override it — so the section bodies these
 * shots want (`.study-crossrefs`, `.study-topics`) are not in the DOM until the
 * heading is clicked.
 */
async function expandStudySection(page: Page, label: RegExp): Promise<void> {
  const heading = page.locator('.study-pane__section-label', { hasText: label }).first();
  await heading.waitFor({ timeout: 15_000 });
  // Clicking an already-open section would close it.
  const chevron = heading.locator('.fa-chevron-down');
  if (await chevron.count() === 0) await heading.click();
}

/**
 * Open the Commentary tab's overview ("Home") tab.
 *
 * The pane opens on the auto-generated Combined Summary instead, so waiting on
 * `.commentary-home` without this never resolves.
 */
async function openCommentaryOverview(page: Page): Promise<void> {
  await page.waitForSelector('.commentary-tab-bar', { timeout: 20_000 });
  await page.locator('.commentary-tab-bar__tab--home').click();
  await page.waitForSelector('.commentary-home', { timeout: 20_000 });
}

/**
 * Open one commentary from the overview into a tab of its own.
 *
 * `Add to tabs` lives inside an accordion item's expanded body, so the item has
 * to be opened first; clicking the button before that waits forever on an
 * element the DOM does not hold yet.
 */
async function openFirstCommentaryInTab(page: Page): Promise<void> {
  const items = page.locator('.commentary-home__list-item');

  // The overview fills in as each commentary reports what it has for the verse,
  // and the list re-renders as it grows. Clicking into a list that is still
  // arriving detaches the row mid-click, which surfaces as a bare 30-second
  // click timeout. Wait for it to stop growing first.
  let previous = -1;
  for (let settle = 0; settle < 20; settle++) {
    const now = await items.count();
    if (now > 1 && now === previous) break;
    previous = now;
    await page.waitForTimeout(500);
  }

  const count = await items.count();

  for (let i = 0; i < count; i++) {
    await items.nth(i).click();
    const add = page.locator('.commentary-home__add-to-tabs');
    await add.waitFor({ timeout: 15_000 });
    // The pane opens on the Combined Summary, which is therefore already a tab —
    // its `Add to tabs` renders disabled, and clicking it waits out the whole
    // actionability timeout. Skip past any entry already open.
    if (!await add.first().isDisabled()) {
      await add.first().click();
      // The overview carries both `.commentary-content` and `.commentary-home`,
      // so a bare `.commentary-content` wait would match it and shoot the wrong
      // tab.
      await page.waitForSelector('.commentary-content:not(.commentary-home)', { timeout: 20_000 });
      return;
    }
    await items.nth(i).click(); // collapse and try the next one
  }
  throw new Error('No commentary in the overview could be opened in a tab.');
}

/**
 * Wait for the commentary pane to stop loading.
 *
 * Commentary arrives well after the verse does, and a screenshot taken as soon
 * as the pane exists catches "Loading commentary…" instead of the notes — which
 * is exactly the wrong thing to show in a page about commentary.
 */
async function settleCommentary(page: Page): Promise<void> {
  // Polled through `page.evaluate` rather than `waitForFunction` — see
  // `scripts/lib/poll.ts` for why the latter cannot work against this app's
  // CSP, and what it was silently doing to these shots.
  const settled = await pollSettled(page, '.commentary-pane', { timeout: 45_000 });
  if (!settled) console.warn('[warn] commentary still loading; capturing anyway');
  await page.waitForTimeout(500);
}

/**
 * Wait until a panel has finished fetching everything it shows.
 *
 * Sections fetch independently and each renders its own "Loading …" line, so a
 * shot taken when the container appears catches a page of placeholders. Matching
 * on the loading text rather than a spinner class covers both: some sections
 * show a spinner, others only words.
 */
async function settlePane(page: Page, selector: string): Promise<void> {
  if (!await pollSettled(page, selector, { timeout: 30_000 })) {
    console.warn(`[warn] ${selector} still loading; capturing anyway`);
  }
  await page.waitForTimeout(400);
}

async function setDisplayMode(page: Page, label: 'Standard' | 'Reading' | 'Study'): Promise<void> {
  await page.locator('.bible-toolbar__mode-select').first().selectOption({ label });
  await page.waitForTimeout(400);
}

async function openSettings(page: Page, tab: string): Promise<void> {
  await page.locator('[data-testid="header-settings-btn"]').click();
  await page.waitForSelector('.settings-panel');
  await page.locator(`.settings-panel__sidebar [data-tab="${tab}"]`).click();
  await page.waitForSelector(`.settings-panel__section[data-section="${tab}"]`, { timeout: 10_000 });
}

async function closeSettings(page: Page): Promise<void> {
  await page.locator('.settings-panel__close').click();
  await page.waitForSelector('.settings-panel', { state: 'detached', timeout: 5_000 }).catch(() => { /* already gone */ });
}

/** Choose Ideas (semantic) search. Returns false when the site has it switched off. */
async function selectIdeasSearch(page: Page): Promise<boolean> {
  await page.locator('.header__search-type-btn').first().click();
  await page.waitForSelector('.header__search-type-dropdown');
  const option = page.locator('.header__search-type-option[data-search-type="semantic"]');
  if (await option.count() === 0) return false;
  await option.click();
  return true;
}

function outPath(name: string): string {
  return join(OUTPUT_DIR, `${name}.png`);
}

/**
 * Wait until nothing on the page is still loading.
 *
 * Every shot used to rely on whichever wait its own `register` block happened
 * to spell out, so a panel that fetched its content a beat later than the
 * container it lives in was captured mid-flight -- the commentary shots in
 * particular kept coming out reading "Loading ...". This is the one check they
 * all share, applied inside the capture helpers so no shot can forget it.
 *
 * There is no single readiness flag to ask the app for, so this reads the DOM
 * for what a half-loaded screen actually looks like: a spinner, an element the
 * app has marked busy, or a leaf whose entire visible text is a loading
 * placeholder. Timing out is not fatal -- the shot is still taken, with a
 * warning, which is better than dropping it.
 */
/**
 * Runs in the page: names whatever is still loading, or null when nothing is.
 *
 * Shared by the wait and by the warning it prints on giving up, so a shot that
 * times out says which spinner or placeholder held it up instead of leaving
 * the next person to guess. Serialised through `toString()`, so it must not
 * reference anything outside itself.
 */
function idleBlocker(): string | null {
  // Visibility matters: the app keeps spinners in the DOM for panels that are
  // closed, and matching those held every dropdown shot for the full timeout.
  for (const busy of Array.from(document.querySelectorAll('.fa-spin, .spinner, [aria-busy="true"]'))) {
    const rect = busy.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return `spinner: ${busy.getAttribute('class') ?? busy.tagName}`;
  }

  for (const el of Array.from(document.querySelectorAll('body *'))) {
    if (el.children.length > 0) continue;
    const text = (el.textContent ?? '').trim();
    if (!/^(loading|searching)\b/i.test(text)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return `text: "${text.slice(0, 40)}"`;
  }

  for (const img of Array.from(document.images)) {
    // Lazy images below the fold never finish, and never appear in the shot.
    if (img.complete || img.loading === 'lazy') continue;
    const rect = img.getBoundingClientRect();
    if (rect.width > 0 && rect.bottom > 0 && rect.top < window.innerHeight) {
      return `image: ${(img.currentSrc || img.src).slice(-40)}`;
    }
  }

  return null;
}

async function waitForIdle(page: Page): Promise<void> {
  // Polled by hand rather than with `waitForFunction`. The app serves a CSP
  // that forbids `eval`, and waitForFunction's string form is exactly that --
  // it failed instantly on every shot with "Evaluating a string as JavaScript
  // violates the following CSP directive", which the catch below then reported
  // as a warning. `page.evaluate(fn)` goes through the debugger protocol and is
  // not subject to the page's CSP, and polling it also hands us the reason.
  const deadline = Date.now() + 30_000;
  let blocker: string | null = null;
  for (;;) {
    blocker = await page.evaluate(idleBlocker);
    if (blocker === null || Date.now() > deadline) break;
    await page.waitForTimeout(200);
  }
  if (blocker !== null) console.warn(`[warn] still loading; capturing anyway (${blocker})`);

  // Fonts settle after the content does, and a reflow mid-capture shifts text.
  // `.then(() => undefined)`: FontFaceSet itself does not survive serialisation.
  await page.evaluate(() => document.fonts.ready.then(() => undefined)).catch(() => { /* older engines */ });
  await page.waitForTimeout(250);
}

async function fullPage(page: Page, name: string): Promise<void> {
  await waitForIdle(page);
  await page.screenshot({ path: outPath(name), fullPage: false });
}

/**
 * Shoot a single element.
 *
 * The height is capped at the viewport by default. Some of these selectors --
 * `.bible-content` above all -- resolve to a scroll container holding a whole
 * chapter, and in study mode that is nearly 10,000px tall. Playwright will
 * happily produce that image, and the docs then render it as an unreadable
 * sliver a few pixels wide. Capturing the top of the element instead shows the
 * same thing a reader would see.
 */
async function captureLocator(
  page: Page,
  selector: string,
  name: string,
  maxHeight?: number,
): Promise<void> {
  await page.waitForSelector(selector, { timeout: 15_000 });
  await waitForIdle(page);

  const locator = page.locator(selector).first();
  const box = await locator.boundingBox();
  const viewport = page.viewportSize() ?? { width: 1440, height: 900 };
  const limit = maxHeight ?? viewport.height;

  if (!box || box.height <= limit) {
    await locator.screenshot({ path: outPath(name) });
    return;
  }

  // boundingBox() and clip are both viewport-relative, but the element can
  // start above or extend past the viewport; clamp so the clip stays inside it.
  const x = Math.max(0, box.x);
  const y = Math.max(0, box.y);
  const width = Math.min(box.width, viewport.width - x);
  const height = Math.min(limit, viewport.height - y);

  await page.screenshot({ path: outPath(name), clip: { x, y, width, height } });
}

/**
 * Shoot the union of several elements' boxes.
 *
 * For the shots whose subject is a control *and* its context: an open dropdown
 * next to the field it filters, a tab strip above the page it belongs to.
 * Cropping to one selector gives a technically accurate picture of a thing the
 * reader cannot place.
 *
 * Elements that are not on the page are skipped rather than fatal, so a shot
 * still comes out when an optional panel is absent.
 */
async function captureRegion(
  page: Page,
  selectors: string[],
  name: string,
  opts: { padding?: number; maxHeight?: number } = {},
): Promise<void> {
  await page.waitForSelector(selectors[0], { timeout: 15_000 });
  await waitForIdle(page);

  const padding = opts.padding ?? 8;
  const viewport = page.viewportSize() ?? VIEWPORTS.desktop;
  const boxes = [];
  for (const selector of selectors) {
    const box = await page.locator(selector).first().boundingBox().catch(() => null);
    if (box) boxes.push(box);
  }
  if (boxes.length === 0) throw new Error(`captureRegion: none of ${selectors.join(', ')} is on the page`);

  const left = Math.max(0, Math.min(...boxes.map((b) => b.x)) - padding);
  const top = Math.max(0, Math.min(...boxes.map((b) => b.y)) - padding);
  const right = Math.max(...boxes.map((b) => b.x + b.width)) + padding;
  const bottom = Math.max(...boxes.map((b) => b.y + b.height)) + padding;

  await page.screenshot({
    path: outPath(name),
    clip: {
      x: left,
      y: top,
      width: Math.min(right - left, viewport.width - left),
      height: Math.min(opts.maxHeight ?? bottom - top, viewport.height - top),
    },
  });
}

// ---------------------------------------------------------------------------
// Shots — grouped by doc page. Names must match the `<!-- shot: … -->`
// placeholders in web/**/*.md; `--check` enforces that.
// ---------------------------------------------------------------------------

// ── intro.md ───────────────────────────────────────────────────────────────

register('intro', 'desktop', 'intro-desktop-layout', async (page) => {
  await gotoChapter(page, WEB_CHAPTERS.psalm23);
  await selectVerse(page, PSALM_23_1);
  await openRightPaneTab(page, 'Commentary');
  await settleCommentary(page);
  await fullPage(page, 'intro-desktop-layout');
});

register('intro', 'mobile', 'intro-mobile-phone', async (page) => {
  await gotoChapter(page, WEB_CHAPTERS.psalm23);
  await fullPage(page, 'intro-mobile-phone');
});

// The picture a README links to: as many features on screen at once as fit,
// and no callouts, so it stands on its own outside these docs.
register('intro', 'desktop', 'intro-overview', async (page) => {
  await gotoChapter(page, WEB_CHAPTERS.john3);
  await selectVerse(page, JOHN_3_16);
  await openRightPaneTab(page, 'Study');
  await expandStudySection(page, /Cross-References/);
  await expandStudySection(page, /^Topics/);
  await settlePane(page, '.study-pane');
  // The click only scrolls the verse far enough to reach it, which can leave it
  // on the bottom line. Centre it, so the passage around it shows too.
  await page.locator(`[data-verse-id="${JOHN_3_16}"]`)
    .evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await fullPage(page, 'intro-overview');
});

// ── getting-started/quick-start.md ─────────────────────────────────────────

register('quick-start', 'desktop', 'quick-start-home-votd', async (page) => {
  await gotoHome(page);
  // The verse of the day arrives after the shell; without this the card is a
  // skeleton in the shot.
  await page.waitForSelector('.home-screen__votd:not(.home-screen__votd--skeleton)', { timeout: 15_000 })
    .catch(() => console.warn('[warn] verse of the day did not load; capturing the skeleton'));
  await captureLocator(page, '.home-screen', 'quick-start-home-votd');
});

register('quick-start', 'desktop', 'quick-start-book-chapter-picker', async (page) => {
  await gotoChapter(page, WEB_CHAPTERS.psalm23);
  await page.locator('.bible-content__chapter-title--tappable').first().click();
  await captureLocator(page, '.book-chapter-picker', 'quick-start-book-chapter-picker');
});

register('quick-start', 'desktop', 'quick-start-chapter-with-commentary', async (page) => {
  await gotoChapter(page, WEB_CHAPTERS.john3);
  await selectVerse(page, JOHN_3_16);
  await openRightPaneTab(page, 'Commentary');
  await settleCommentary(page);
  await fullPage(page, 'quick-start-chapter-with-commentary');
});

register('quick-start', 'desktop', 'quick-start-search-bar-query', async (page) => {
  await gotoChapter(page, WEB_CHAPTERS.psalm23);
  await page.locator('.header__search-field').fill(SEARCHES.phrase);
  await page.waitForTimeout(300);
  await captureLocator(page, '.header__search', 'quick-start-search-bar-query');
});

// ── user-guide/bible-reading.md ────────────────────────────────────────────

register('bible-reading', 'desktop', 'bible-reading-standard-mode', async (page) => {
  await gotoChapter(page, WEB_CHAPTERS.psalm23);
  await captureLocator(page, '.bible-content', 'bible-reading-standard-mode');
});

register('bible-reading', 'desktop', 'bible-reading-book-chapter-picker', async (page) => {
  await gotoChapter(page, WEB_CHAPTERS.psalm23);
  await page.locator('.bible-content__chapter-title--tappable').first().click();
  await captureLocator(page, '.book-chapter-picker', 'bible-reading-book-chapter-picker');
});

register('bible-reading', 'desktop', 'bible-reading-chapter-nav', async (page) => {
  await gotoChapter(page, WEB_CHAPTERS.psalm23);
  // ChapterNav sits below BibleContent inside the pane's scroll container, so
  // scrolling `.bible-content` (as an earlier version did) moved nothing.
  await page.evaluate(() => {
    const el = document.querySelector('.bible-pane__scroll-container');
    if (el) el.scrollTop = el.scrollHeight;
  });
  await page.waitForTimeout(300);
  await captureLocator(page, '.chapter-nav', 'bible-reading-chapter-nav');
});

register('bible-reading', 'desktop', 'bible-reading-translation-dropdown', async (page) => {
  await gotoChapter(page, WEB_CHAPTERS.psalm23);
  await page.locator('.bible-toolbar__translation-btn').first().click();
  await page.waitForSelector('.module-dialog', { timeout: 10_000 });
  await fullPage(page, 'bible-reading-translation-dropdown');
});

register('bible-reading', 'desktop', 'bible-reading-multiple-tabs', async (page) => {
  await gotoChapter(page, WEB_CHAPTERS.psalm23);
  await page.waitForSelector('.bible-tab-bar');

  // Three tabs, not two. The page is about keeping several passages open at
  // once, and a bar holding a single reference and one blank does not show it.
  //
  // Each new tab opens on the book-and-chapter picker, and that picker lays a
  // full-window scrim — `.book-chapter-picker__overlay` — over everything
  // including the tab strip. That scrim is what made the earlier version of
  // this shot look uniformly darkened, and it also swallowed the second click
  // on `+`, which is why only one extra tab ever appeared. So drive the picker
  // rather than the search bar: it is the flow a reader is actually in.
  for (const [book, chapter] of [['John', 3], ['John', 1]] as const) {
    await page.locator('.bible-tab-bar__add').first().click();
    await page.waitForSelector('.book-chapter-picker', { timeout: 15_000 });
    await page.locator('.book-chapter-picker__book-btn', { hasText: new RegExp(`^${book}$`) })
      .first().click();
    await page.locator('.book-chapter-picker__chapter-btn', { hasText: new RegExp(`^${chapter}$`) })
      .first().click();
    await page.waitForSelector('.book-chapter-picker__overlay', { state: 'detached', timeout: 10_000 });
    await page.waitForTimeout(900);
  }

  // Nothing should be laid over the strip by now; fail rather than photograph
  // a greyed-out tab bar again.
  if (await page.locator('.book-chapter-picker__overlay').count() > 0) {
    throw new Error('the book-and-chapter picker is still open over the tab bar');
  }

  // Crop the strip together with the top of the chapter beneath it. The bar on
  // its own is a band of `--bg-secondary` grey with grey inactive tabs in it;
  // seen against the page it belongs to, it reads as tabs.
  await captureRegion(page, ['.bible-tab-bar', '.bible-content'],
    'bible-reading-multiple-tabs', { maxHeight: 260 });
});

register('bible-reading', 'desktop', 'bible-reading-mode-standard', async (page) => {
  await gotoChapter(page, WEB_CHAPTERS.psalm23);
  await setDisplayMode(page, 'Standard');
  await captureLocator(page, '.bible-content', 'bible-reading-mode-standard');
});

register('bible-reading', 'desktop', 'bible-reading-mode-reading', async (page) => {
  await gotoChapter(page, WEB_CHAPTERS.psalm23);
  await setDisplayMode(page, 'Reading');
  await captureLocator(page, '.bible-content', 'bible-reading-mode-reading');
});

register('bible-reading', 'desktop', 'bible-reading-mode-study', async (page) => {
  await gotoChapter(page, WEB_CHAPTERS.john1); // John 1 — interlinear data is reliable here
  await setDisplayMode(page, 'Study');
  await page.waitForSelector('.verse__interlinear-word', { timeout: 20_000 })
    .catch(() => console.warn('[warn] no interlinear words; is interlinear.db installed?'));
  await captureLocator(page, '.bible-content', 'bible-reading-mode-study');
});

// ── user-guide/search.md ───────────────────────────────────────────────────

register('search', 'desktop', 'search-mode-menu', async (page) => {
  await gotoChapter(page, WEB_CHAPTERS.psalm23);
  // Something typed in, so the picture shows a search being composed rather
  // than a bare chevron labelled "Search".
  await page.locator('.header__search-field').fill(SEARCHES.phrase);
  await page.locator('.header__search-type-btn').first().click();
  await page.waitForSelector('.header__search-type-dropdown');
  await page.waitForTimeout(300);
  // The whole search box together with the open menu: the reader needs to see
  // that this chooses between Standard and Ideas search for the query beside
  // it. Cropping the chevron's own wrapper showed neither.
  await captureRegion(page, ['.header__search', '.header__search-type-dropdown'],
    'search-mode-menu', { padding: 10 });
});

register('search', 'desktop', 'search-keyword-results', async (page) => {
  await gotoChapter(page, WEB_CHAPTERS.psalm23);
  await page.locator('.header__search-field').fill(SEARCHES.keyword);
  await page.locator('.header__search-field').press('Enter');
  await page.waitForSelector('.search-panel-inline', { timeout: 20_000 });
  await page.waitForTimeout(800);
  await fullPage(page, 'search-keyword-results');
});

register('search', 'desktop', 'search-semantic-results', async (page) => {
  await gotoChapter(page, WEB_CHAPTERS.psalm23);
  if (!await selectIdeasSearch(page)) {
    // A local run has no semantic index, so this shot cannot be taken here. Do
    // not fall through and photograph the "Ideas Search unavailable" notice —
    // that is a picture of the feature missing, filed under a heading that
    // promises the feature working. Point at a server that has it instead:
    //
    //   BIBLE_WEB_URL=https://bible.keepthyheart.com SITE_PASSWORD=…     //     npm run shots -- --shot=search-semantic-results
    console.warn(
      '[skip] search-semantic-results: Ideas Search is off on this server. ' +
      'Re-run with BIBLE_WEB_URL set to a deployment that has the semantic index.',
    );
    return;
  }
  await page.locator('.header__search-field').fill(SEARCHES.ideas);
  await page.locator('.header__search-field').press('Enter');
  // The first Ideas search of a session downloads and warms an embedding model,
  // which is far slower than any other wait in this file.
  await page.waitForSelector('.search-panel-inline', { timeout: 30_000 });
  const done = await pollUntil(
    page,
    () => !document.querySelector('.search-panel-inline')?.textContent?.includes('Searching'),
    undefined,
    { timeout: 180_000, interval: 500 },
  );
  if (!done) console.warn('[warn] Ideas search still running; capturing anyway');

  // Having the Ideas control on screen is not the same as having the index
  // behind it. A server built with `semanticSearch: true` but no index files
  // offers the option, accepts the query, and then raises "Ideas Search
  // unavailable — downloading search index failed" over an empty result list.
  // That is what shipped in the docs last time, captioned as a picture of
  // Ideas Search working. Refuse it.
  const broken = await page.evaluate(() => {
    const text = document.body.textContent ?? '';
    return /Ideas Search unavailable|Downloading search index failed/i.test(text)
      || /\(0 results\)/.test(document.querySelector('.search-panel-inline')?.textContent ?? '');
  });
  if (broken) {
    throw new Error(
      'Ideas Search returned nothing: this server offers the control but has no semantic index. ' +
      'Re-run against a deployment that has one, e.g. ' +
      'BIBLE_WEB_URL=https://bible.keepthyheart.com SITE_PASSWORD=… ' +
      'npm run screenshots -- --shot=search-semantic-results',
    );
  }
  await fullPage(page, 'search-semantic-results');
});

register('search', 'desktop', 'search-strongs-results', async (page) => {
  await gotoChapter(page, WEB_CHAPTERS.john3);
  await page.locator('.header__search-field').fill(STRONGS.wordFamily);
  await page.locator('.header__search-field').press('Enter');
  await page.waitForSelector('.search-panel-inline', { timeout: 20_000 });
  await page.waitForTimeout(800);
  await fullPage(page, 'search-strongs-results');
});

// ── user-guide/copy-and-share.md ───────────────────────────────────────────

register('copy-and-share', 'desktop', 'copy-dialog-open', async (page) => {
  await gotoChapter(page, WEB_CHAPTERS.john3);
  await page.locator(`[data-verse-id="${JOHN_3_16}"]`).click({ button: 'right' });
  await page.waitForSelector('.verse-context-menu');
  await page.locator('.verse-context-menu__item').first().click(); // Copy Passage…
  await page.waitForSelector('.copy-dialog');
  await page.waitForTimeout(500); // let the preview fill in
  await captureLocator(page, '.copy-dialog', 'copy-dialog-open');
});

// ── user-guide/study-tools.md ──────────────────────────────────────────────

register('study-tools', 'desktop', 'study-tools-cross-references', async (page) => {
  await gotoChapter(page, WEB_CHAPTERS.john3);
  await selectVerse(page, JOHN_3_16);
  await openRightPaneTab(page, 'Study');
  await expandStudySection(page, /Cross-References/);
  await settlePane(page, '.study-pane');
  await captureLocator(page, '.study-crossrefs', 'study-tools-cross-references');
});

register('study-tools', 'desktop', 'study-tools-topics-section', async (page) => {
  await gotoChapter(page, WEB_CHAPTERS.john3);
  await selectVerse(page, JOHN_3_16);
  await openRightPaneTab(page, 'Study');
  await expandStudySection(page, /^Topics/);
  await settlePane(page, '.study-pane');
  await captureLocator(page, '.study-topics', 'study-tools-topics-section');
});

register('study-tools', 'desktop', 'study-tools-commentary-home', async (page) => {
  await gotoChapter(page, WEB_CHAPTERS.john3);
  await selectVerse(page, JOHN_3_16);
  await openRightPaneTab(page, 'Commentary');
  await openCommentaryOverview(page);
  await settleCommentary(page);
  await captureLocator(page, '.commentary-home', 'study-tools-commentary-home');
});

register('study-tools', 'desktop', 'study-tools-commentary-entry', async (page) => {
  await gotoChapter(page, WEB_CHAPTERS.john3);
  await selectVerse(page, JOHN_3_16);
  await openRightPaneTab(page, 'Commentary');
  await openCommentaryOverview(page);
  await openFirstCommentaryInTab(page);
  await settleCommentary(page);
  await captureLocator(page, '.commentary-pane', 'study-tools-commentary-entry');
});

register('study-tools', 'desktop', 'study-tools-commentary-pinned-tab', async (page) => {
  await gotoChapter(page, WEB_CHAPTERS.john3);
  await selectVerse(page, JOHN_3_16);
  await openRightPaneTab(page, 'Commentary');
  await openCommentaryOverview(page);
  await openFirstCommentaryInTab(page);
  // The thumbtack indicator only renders on a tab that is actually pinned.
  await page.locator('.commentary-passage-header__pin').click();
  await page.waitForSelector('.commentary-passage-header__pin--active', { timeout: 5_000 });
  await captureLocator(page, '.commentary-tab-bar', 'study-tools-commentary-pinned-tab');
});

register('study-tools', 'desktop', 'study-tools-verse-preview-tooltip', async (page) => {
  await gotoChapter(page, WEB_CHAPTERS.john3);
  await selectVerse(page, JOHN_3_16);
  await openRightPaneTab(page, 'Commentary');
  await openCommentaryOverview(page);
  await openFirstCommentaryInTab(page);
  // Scripture references inside commentary prose become `.scripture-link`
  // anchors; hovering one shows the preview tooltip. Not every commentary cites
  // other verses on every passage, so treat an absence as "nothing to shoot"
  // rather than a failure.
  const link = page.locator('.commentary-content .scripture-link').first();
  if (await link.count() === 0) {
    console.warn('[skip] study-tools-verse-preview-tooltip: the opened commentary cites no verses here');
    return;
  }
  await link.hover();
  await captureLocator(page, '.verse-ref-tooltip', 'study-tools-verse-preview-tooltip');
});

register('study-tools', 'desktop', 'study-tools-topic-detail', async (page) => {
  await gotoChapter(page, WEB_CHAPTERS.john3);
  await selectVerse(page, JOHN_3_16);
  await openRightPaneTab(page, 'Study');
  await expandStudySection(page, /^Topics/);
  await page.waitForSelector('.study-topics__chain-link', { timeout: 20_000 });
  await page.locator('.study-topics__chain-link').first().click();
  await page.waitForSelector('.topics-browser__detail', { timeout: 20_000 });
  await settlePane(page, '.topics-browser');
  await captureLocator(page, '.topics-browser', 'study-tools-topic-detail');
});

register('study-tools', 'desktop', 'study-tools-entity-detail', async (page) => {
  await gotoChapter(page, WEB_CHAPTERS.firstSamuel17); // 1 Samuel 17 — David
  await selectVerse(page, FIRST_SAMUEL_17_45);
  await openRightPaneTab(page, 'Topics');
  const grid = page.locator('.topics-browser__assoc-grid .topic-card');
  if (await grid.count() === 0) {
    console.warn('[skip] study-tools-entity-detail: no entity data (tag_graph.db missing or feature off)');
    return;
  }
  await grid.first().click();
  await page.waitForSelector('.topics-browser__detail', { timeout: 20_000 });
  await settlePane(page, '.topics-browser');
  await captureLocator(page, '.topics-browser', 'study-tools-entity-detail');
});

register('study-tools', 'desktop', 'study-tools-study-mode-interlinear', async (page) => {
  await gotoChapter(page, WEB_CHAPTERS.john1);
  await setDisplayMode(page, 'Study');
  await page.waitForSelector('.verse__interlinear-word', { timeout: 20_000 });
  await captureLocator(page, '.bible-content', 'study-tools-study-mode-interlinear');
});

register('study-tools', 'desktop', 'study-tools-strongs-tooltip', async (page) => {
  await gotoChapter(page, WEB_CHAPTERS.john1);
  await setDisplayMode(page, 'Study');
  await page.waitForSelector('.verse__strongs-link', { timeout: 20_000 });
  // A named number rather than `.first()`. The first Strong's link in John 1:1
  // is G1722 — the preposition ἐν — whose lexicon entry runs for paragraphs and
  // tells a first-time reader nothing about what the tooltip is for.
  const chip = page.locator('.verse__strongs-link', { hasText: new RegExp(`^${STRONGS.featured}$`) }).first();
  if (await chip.count() === 0) {
    console.warn(`[warn] ${STRONGS.featured} is not in this chapter; falling back to the first Strong's number`);
    await page.locator('.verse__strongs-link').first().hover();
  } else {
    await chip.hover();
  }
  await captureLocator(page, '.strongs-tooltip', 'study-tools-strongs-tooltip');
});

register('study-tools', 'desktop', 'study-tools-strongs-search-results', async (page) => {
  await gotoChapter(page, WEB_CHAPTERS.john3);
  await page.locator('.header__search-field').fill(STRONGS.wordFamily);
  await page.locator('.header__search-field').press('Enter');
  await page.waitForSelector('.search-panel-inline', { timeout: 20_000 });
  await page.waitForTimeout(800);
  await fullPage(page, 'study-tools-strongs-search-results');
});

// ── user-guide/personalizing.md ────────────────────────────────────────────

register('personalizing', 'desktop', 'personalizing-settings-theme', async (page) => {
  await gotoChapter(page, WEB_CHAPTERS.psalm23);
  await openSettings(page, 'theme');
  await captureLocator(page, '.settings-panel', 'personalizing-settings-theme');
});

register('personalizing', 'desktop', 'personalizing-theme-comparison', async (page) => {
  // One frame per theme; the docs place them side by side. The composite shot
  // the placeholder names is the dark one — swap it by hand if you would rather
  // stitch the pair together in an image editor.
  await gotoChapter(page, WEB_CHAPTERS.psalm23);
  await page.screenshot({ path: outPath('personalizing-theme-light'), fullPage: false });

  await openSettings(page, 'theme');
  await page.locator('[data-theme-id="dark"]').click();
  await page.waitForTimeout(400);
  await closeSettings(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: outPath('personalizing-theme-dark'), fullPage: false });
  await page.screenshot({ path: outPath('personalizing-theme-comparison'), fullPage: false });

  await openSettings(page, 'theme');
  await page.locator('[data-theme-id="light"]').click();
  await page.waitForTimeout(300);
  await closeSettings(page);
});

register('personalizing', 'desktop', 'personalizing-text-size', async (page) => {
  await gotoChapter(page, WEB_CHAPTERS.psalm23);
  await openSettings(page, 'text-size');
  await captureLocator(page, '.settings-panel', 'personalizing-text-size');
});

register('personalizing', 'desktop', 'personalizing-font-selector', async (page) => {
  // The font schemes are cards on the Theme tab, not a control of their own.
  await gotoChapter(page, WEB_CHAPTERS.psalm23);
  await openSettings(page, 'theme');
  await page.waitForSelector('.settings-panel__scheme-grid');
  await page.locator('.settings-panel__scheme-grid').first().scrollIntoViewIfNeeded();
  await captureLocator(page, '.settings-panel', 'personalizing-font-selector');
});

// ── user-guide/mobile.md ───────────────────────────────────────────────────

register('mobile', 'mobile', 'mobile-bible-with-nav', async (page) => {
  await gotoChapter(page, WEB_CHAPTERS.psalm23);
  await fullPage(page, 'mobile-bible-with-nav');
});

register('mobile', 'mobile', 'mobile-bottom-nav', async (page) => {
  await gotoChapter(page, WEB_CHAPTERS.psalm23);
  await captureLocator(page, '.mobile-nav', 'mobile-bottom-nav');
});

register('mobile', 'mobile', 'mobile-study-screen', async (page) => {
  await gotoChapter(page, WEB_CHAPTERS.john3);
  await selectVerse(page, JOHN_3_16);
  await page.locator('[data-testid="mobile-nav-study"]').click();
  await page.waitForSelector('.mobile-study-pane', { timeout: 20_000 });
  await settlePane(page, '.mobile-study-pane');
  await fullPage(page, 'mobile-study-screen');
});

register('mobile', 'mobile', 'mobile-commentary-screen', async (page) => {
  await gotoChapter(page, WEB_CHAPTERS.john3);
  await selectVerse(page, JOHN_3_16);
  await page.locator('[data-testid="mobile-nav-commentary"]').click();
  await page.waitForSelector('.mobile-study-pane, .commentary-pane', { timeout: 20_000 });
  await settlePane(page, '.mobile-study-pane, .commentary-pane');
  await fullPage(page, 'mobile-commentary-screen');
});


// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

interface CliOpts {
  page?: string;
  /** Empty means "every shot"; the flag may be repeated or comma-separated. */
  shots: string[];
  list?: boolean;
  check?: boolean;
  embed?: boolean;
  keepServer?: boolean;
}

function parseArgs(argv: string[]): CliOpts {
  const opts: CliOpts = { shots: [] };
  for (const a of argv) {
    if (a === '--list') opts.list = true;
    else if (a === '--check') opts.check = true;
    else if (a === '--embed') opts.embed = true;
    else if (a === '--keep-server') opts.keepServer = true;
    else if (a.startsWith('--page=')) opts.page = a.slice('--page='.length);
    // Comma-separated, and repeatable. Re-taking a handful of shots after a
    // fix is the common case, and one name per run meant restarting the server
    // for each of them.
    else if (a.startsWith('--shot=')) {
      opts.shots.push(...a.slice('--shot='.length).split(',').map((n) => n.trim()).filter(Boolean));
    }
    else throw new Error(`Unknown option: ${a}`);
  }
  return opts;
}

function filterShots(opts: CliOpts): Shot[] {
  const unknown = opts.shots.filter((n) => !shots.some((s) => s.name === n));
  if (unknown.length > 0) {
    // Fail rather than quietly capture nothing: a typo in a shot name used to
    // look exactly like a successful run that had nothing to do.
    throw new Error(`No such shot: ${unknown.join(', ')}. Use --list to see the names.`);
  }
  return shots.filter((s) => {
    if (opts.shots.length > 0 && !opts.shots.includes(s.name)) return false;
    if (opts.page && s.page !== opts.page) return false;
    return true;
  });
}

/**
 * Every shot gets its own browser context.
 *
 * Sharing one page across shots looked cheaper and was wrong twice over. The
 * app is a single-page app, so `page.goto()` at a URL that differs only in its
 * hash does not reload — whatever dialog the previous shot left open was still
 * covering the page, and the next shot's click landed on the overlay. And the
 * app persists tabs, themes, and offline state to localStorage, so a shot that
 * opened a second Bible tab put that tab in every screenshot that followed.
 *
 * A fresh context costs one app boot per shot and makes each one reproducible
 * on its own, which is what you want when re-running a single failure.
 */
async function runShots(browser: Browser, platform: 'desktop' | 'mobile', list: Shot[]): Promise<number> {
  let failures = 0;

  for (const shot of list) {
    const start = Date.now();
    const ctx: BrowserContext = await browser.newContext({
      viewport: VIEWPORTS[platform],
      deviceScaleFactor: 2,
      isMobile: platform === 'mobile',
      hasTouch: platform === 'mobile',
    });
    const page = await ctx.newPage();
    try {
      console.log(`[${platform}] ${shot.name} …`);
      await shot.fn(page);
      console.log(`[${platform}] ${shot.name} done (${Date.now() - start}ms)`);
    } catch (err) {
      failures++;
      console.error(`[${platform}] ${shot.name} FAILED: ${(err as Error).message.split('\n')[0]}`);
    } finally {
      await ctx.close();
    }
  }
  return failures;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.list) {
    for (const s of shots) {
      console.log(`${s.platform.padEnd(7)} ${s.page.padEnd(16)} ${s.name}${s.manual ? '  (manual)' : ''}`);
    }
    console.log(`\n${shots.length} shots (${shots.filter((s) => s.manual).length} captured by hand)`);
    return;
  }

  if (opts.check) {
    process.exitCode = placeholders.check(shots) === 0 ? 0 : 1;
    return;
  }

  if (opts.embed) {
    placeholders.embed();
    return;
  }

  // A mismatch here means a shot would be captured that nothing displays, or a
  // placeholder would stay empty. Cheaper to hear about it now.
  if (placeholders.check(shots) > 0) {
    throw new Error('Shots and doc placeholders do not line up (see above). Fix them, or run with --list to compare.');
  }

  const selected = filterShots(opts);
  if (selected.length === 0) {
    throw new Error(
      `No shots matched: page=${opts.page ?? '*'} shot=${opts.shots.length > 0 ? opts.shots.join(',') : '*'}`,
    );
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });

  let server: ChildProcess | undefined;
  if (EXTERNAL_URL) {
    console.log(`Using the server at ${EXTERNAL_URL} (BIBLE_WEB_URL is set).`);
    await waitForServer(EXTERNAL_URL, 15_000);
  } else {
    server = await startServer();
  }

  console.log(`\nCapturing ${selected.length} shot(s) from ${BASE_URL}`);
  console.log(`Output: ${OUTPUT_DIR}\n`);

  const browser = await chromium.launch();
  let failures = 0;
  try {
    failures += await runShots(browser, 'desktop', selected.filter((s) => s.platform === 'desktop'));
    failures += await runShots(browser, 'mobile', selected.filter((s) => s.platform === 'mobile'));
  } finally {
    await browser.close();
    if (server && !opts.keepServer) stopServer(server);
    else if (server) console.log(`Server left running on port ${PORT} (--keep-server).`);
  }

  console.log(`\nDone. ${selected.length - failures}/${selected.length} shot(s) captured.`);
  if (failures > 0) {
    console.log('Re-run a single failure with --shot=<name> to see it in isolation.');
    process.exitCode = 1;
  } else {
    console.log('Next: npm run screenshots -- --embed  to put them into the docs.');
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
