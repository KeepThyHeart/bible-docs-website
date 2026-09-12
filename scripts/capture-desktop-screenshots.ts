/**
 * Screenshot Capture for the Desktop App Docs
 * ===========================================
 *
 * Takes one PNG per screenshot placeholder in the Docusaurus `desktop/` docs,
 * driving the real Electron application through Playwright, and can then
 * rewrite those placeholders into Markdown images.
 *
 * A placeholder in the docs looks like this:
 *
 *     <!-- shot: bible-reading-parallel-view — Parallel view with two translations -->
 *
 * The name before the em dash must match a `register(...)` call below. `--check`
 * enforces that in both directions, so neither a renamed shot nor a new
 * placeholder can drift out of sight. See `lib/placeholders.ts`.
 *
 * Quick start
 * -----------
 *     cd ../bible && npm run build      # the app repository; also electron-rebuild
 *     cd ../bible-website && npm install
 *     npm run screenshots:desktop:check # do the docs and this script agree?
 *     npm run screenshots:desktop       # capture everything
 *     npm run screenshots:desktop:embed # rewrite placeholders into images
 *
 * What it needs
 * -------------
 * The *app repository*, cloned beside this one as `../bible` or pointed at with
 * `$BIBLE_REPO` (see `lib/app-repo.ts`); this repository holds only the docs.
 * From it: the built app (`apps/desktop/out/main/index.js`) and a populated
 * `apps/desktop/data/` — `main.db` plus module `.db` files, which is what
 * `npm run init` there produces. Without modules every shot is a picture of an
 * empty reading area, so the run refuses to start rather than quietly producing
 * 53 useless PNGs.
 *
 * `--list` and `--check` read only the docs, so they work in a checkout with no
 * app repository beside it.
 *
 * One app per shot
 * ----------------
 * Every shot launches its own Electron process against a wiped `userData`.
 * That is slower than sharing one — about seven seconds a shot — and it is the
 * right trade. The app persists sessions, layout, theme and open tabs, so a
 * shot that opened a second Bible tab or switched to the dark theme would
 * otherwise appear in every screenshot after it, and re-running a single
 * failure with `--shot=` would not reproduce what the full run saw.
 *
 * Seeding
 * -------
 * Several pages document things that do not exist on a fresh install: notes,
 * highlights, a written journal. Those shots build their own state through the
 * UI first (see the `seed*` helpers), so the pictures show the app as a reader
 * of that page would have it, not as an empty shell.
 *
 * Shots that cannot be taken here
 * -------------------------------
 * Three kinds, each registered explicitly rather than silently skipped:
 *
 *   `registerManual`      — real UI, but outside Playwright's reach (the
 *                           Windows installer is NSIS, not the app).
 *   `registerNeedsSetup`  — real UI that needs something this machine lacks
 *                           (a live module repository, a semantic index).
 *   `registerUnbuilt`     — the docs describe a feature the current build does
 *                           not render at all. These are documentation bugs,
 *                           not capture failures, and `--list` marks them so.
 *
 * Options
 * -------
 *   --list             list shot names and exit
 *   --check            verify shots ↔ doc placeholders line up, then exit
 *   --embed            rewrite doc placeholders into Markdown images, then exit
 *   --page=<name>      only shots for that doc page
 *   --shot=<a,b,c>     only these shots (comma-separated)
 *   --annotate         draw the explanatory callouts (default: on)
 *   --no-annotate      plain screenshots, no callouts
 *   --keep-open        leave the app running after a failure, to poke at it
 */

import type { Page } from 'playwright';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

import { PlaceholderIndex } from './lib/placeholders';
import {
  launchApp,
  dismissWelcomeBar,
  runCommand,
  freshUserDataDir,
  type LaunchedApp,
} from './lib/electron-app';
import { desktopPackage } from './lib/app-repo';
import { Capturer, composite, drawCallouts, clearCallouts, VIEWPORT, type Callout } from './lib/capture';
import { pollSettled, pollUntil } from './lib/poll';
import { BOOKMARKS, NOTES, PASSAGES, PRAYERS, SEARCHES, VERSE_NUMBERS } from './lib/sample-content';

// ---------------------------------------------------------------------------
// Paths & constants
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(__dirname, '..');

const DOCS_DIR = resolve(PACKAGE_ROOT, 'desktop');
const OUTPUT_DIR = resolve(PACKAGE_ROOT, 'static/img/desktop');
/** Path the docs reference the images by, served from `static/`. */
const PUBLIC_IMG_PATH = '/img/desktop';

/** Scratch space for tiles that are composited into a final image. */
const TILE_DIR = join(tmpdir(), 'bible-docs-shots', '_tiles');

const placeholders = new PlaceholderIndex({
  docsDir: DOCS_DIR,
  outputDir: OUTPUT_DIR,
  publicImgPath: PUBLIC_IMG_PATH,
});

// Passages, queries, and the note and prayer text these shots type into the app
// are declared in `scripts/lib/sample-content.ts`. Change them there and re-run
// the affected shot with `--shot=<name>`.
const PSALM_23 = PASSAGES.psalm23;
const JOHN_3 = PASSAGES.john3;

// ---------------------------------------------------------------------------
// Shot registry
// ---------------------------------------------------------------------------

interface ShotContext {
  app: LaunchedApp;
  window: Page;
  cap: Capturer;
  /** Where this shot's PNG belongs. */
  out: string;
  /** Draw callouts, unless the run asked for plain images. */
  annotate: (callouts: Callout[]) => Promise<void>;
  clearAnnotations: () => Promise<void>;
}

type ShotFn = (ctx: ShotContext) => Promise<void>;

type ShotKind = 'auto' | 'manual' | 'needs-setup' | 'unbuilt';

interface Shot {
  name: string;
  page: string;
  kind: ShotKind;
  fn: ShotFn;
  /** For the non-auto kinds: what a human has to do, or why it cannot be done. */
  note?: string;
}

const shots: Shot[] = [];

function register(page: string, name: string, fn: ShotFn): void {
  shots.push({ name, page, kind: 'auto', fn });
}

/** Real UI, but browser or OS chrome that Playwright cannot drive. */
function registerManual(page: string, name: string, note: string): void {
  shots.push({ name, page, kind: 'manual', note, fn: async () => undefined });
}

/** Real UI that needs something this machine does not have installed. */
function registerNeedsSetup(page: string, name: string, note: string): void {
  shots.push({ name, page, kind: 'needs-setup', note, fn: async () => undefined });
}

/** The docs describe something the current build does not render. */
function registerUnbuilt(page: string, name: string, note: string): void {
  shots.push({ name, page, kind: 'unbuilt', note, fn: async () => undefined });
}

// ---------------------------------------------------------------------------
// App helpers
// ---------------------------------------------------------------------------

/** Every dockview tab title currently in the strip. */
async function tabTitles(window: Page): Promise<string[]> {
  return (await window.locator('.dockview-tab-content').allTextContents()).map((t) => t.trim());
}

/**
 * Bring a pane up, creating it if the default layout did not.
 *
 * Mirrors `ensurePaneOpen` in the e2e suite, including the detail that a
 * quick-action button's label is not always the tab title it produces ("Books"
 * opens a tab titled "Book"): pane names are bare singular nouns so that
 * inflecting languages can put "pane" in the surrounding message.
 */
async function openPane(window: Page, label: string): Promise<void> {
  const tabText = label === 'Books' ? /Books?/ : label;
  const existing = window.locator('.dockview-tab-content', { hasText: tabText });
  if (await existing.count() > 0) {
    await existing.first().click({ force: true });
    await window.locator('.dv-tab.dv-active-tab', { hasText: tabText }).first()
      .waitFor({ state: 'visible', timeout: 15_000 });
    return;
  }

  await window.locator('[title="New tab"]').first().click({ force: true });
  await window.getByRole('button', { name: label }).first().click({ force: true });
  await window.locator('.dockview-tab-content', { hasText: tabText }).first()
    .waitFor({ state: 'visible', timeout: 15_000 });
}

/**
 * Click a verse so the study panes follow it.
 *
 * `.verse-selected` on the verse element is the one signal that says the store
 * took the selection — waiting on it rather than sleeping is what keeps the
 * study panes from being captured mid-fetch.
 */
async function selectVerse(window: Page, verseNumber: number): Promise<void> {
  const verse = window.locator(`[data-testid="verse-${verseNumber}"]`);
  await verse.waitFor({ state: 'visible', timeout: 25_000 });
  await verse.click({ force: true });
  await verse.first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
  // Polled through `page.evaluate`; `waitForFunction` cannot run under this
  // app's CSP — see `scripts/lib/poll.ts`.
  const selected = await pollUntil(
    window,
    (n: number) => document.querySelector(`[data-testid="verse-${n}"]`)?.classList.contains('verse-selected') ?? false,
    verseNumber,
    { timeout: 15_000 },
  );
  if (!selected) throw new Error(`verse ${verseNumber} never took the selection`);
}

/**
 * Scroll the reading area back to the top of the chapter.
 *
 * `selectVerse` centres its verse, which for a verse partway down a chapter
 * leaves a half-cut line of text along the top edge and hides the chapter
 * heading — fine for a shot of the study panes, wrong for a shot of the window
 * as a whole. Pair this with an early verse so the selection stays visible.
 */
async function showChapterTop(window: Page): Promise<void> {
  await window.evaluate(() => {
    const list = document.querySelector('[data-testid="bible-verse-list"]')
      ?? document.querySelector('[data-testid="bible-pane"] [class*="overflow-y"]');
    let el: Element | null = list;
    while (el) {
      if (el.scrollHeight > el.clientHeight + 4) { el.scrollTop = 0; return; }
      el = el.parentElement;
    }
  });
  await window.waitForTimeout(400);
}

/** Navigate the Bible pane by typing a reference into the global search bar. */
async function gotoPassage(window: Page, reference: string): Promise<void> {
  const input = window.locator('[data-testid="search-input"]');
  await input.click({ force: true });
  await input.fill(reference);
  await input.press('Enter');
  await window.locator('[data-testid="bible-chapter-heading"]')
    .filter({ hasText: new RegExp(reference.split(' ')[0].slice(0, 4), 'i') })
    .first()
    .waitFor({ timeout: 25_000 });
  await window.waitForTimeout(700);
}

/**
 * The Bible pane's display mode.
 *
 * The control's options are Standard / Reading / Study. Note that the docs call
 * the first one "Simple" — see the naming note in the capture report.
 */
async function setDisplayMode(window: Page, label: 'Standard' | 'Reading' | 'Study'): Promise<void> {
  await window.locator('[data-testid="display-mode-select"]').first().selectOption({ label });
  await window.waitForTimeout(label === 'Study' ? 4_000 : 1_200);
}

/** Right-click a verse and wait for its action menu. */
async function openVerseMenu(window: Page, verseNumber: number): Promise<void> {
  const verse = window.locator(`[data-testid="verse-${verseNumber}"]`);
  await verse.waitFor({ state: 'visible', timeout: 20_000 });
  await verse.click({ force: true });
  // At the pointer, and not clamped to the viewport — so right-click near the
  // top of the verse, or the menu opens with its items off-screen.
  await verse.click({ button: 'right', force: true, position: { x: 12, y: 8 } });
  await window.locator('[role="menu"][aria-label="Verse actions"]')
    .waitFor({ state: 'visible', timeout: 10_000 });
}

/**
 * Wait for a pane to stop fetching.
 *
 * Commentary, cross-references and topics each arrive on their own schedule and
 * each renders its own "Loading…" line. A shot taken when the container appears
 * catches a page of placeholders, which in a page *about* commentary is exactly
 * the wrong picture.
 */
async function settle(window: Page, selector: string, timeout = 30_000): Promise<void> {
  // `waitForFunction` rejects instantly under the app's CSP rather than
  // polling, so these waits used to return at once and the shots caught the
  // placeholders they were meant to wait out. See `scripts/lib/poll.ts`.
  if (!await pollSettled(window, selector, { timeout })) {
    console.warn(`    [warn] ${selector} still loading; capturing anyway`);
  }
  await window.waitForTimeout(500);
}

/** Expand one of the Study pane's collapsible sections, if it is closed. */
async function expandStudySection(window: Page, title: RegExp): Promise<void> {
  const header = window.locator('[data-testid="study-pane"]')
    .getByRole('button', { name: title }).first();
  await header.waitFor({ state: 'visible', timeout: 20_000 });
  if (await header.getAttribute('aria-expanded') === 'false') await header.click({ force: true });
  await window.waitForTimeout(800);
}

// ---------------------------------------------------------------------------
// Seeding — state the docs assume but a fresh install does not have
// ---------------------------------------------------------------------------

/** Highlight a few verses in different colours, through the real gesture. */
async function seedHighlights(window: Page, verses: number[]): Promise<void> {
  for (const [i, verseNumber] of verses.entries()) {
    await openVerseMenu(window, verseNumber);
    const menu = window.locator('[role="menu"][aria-label="Verse actions"]');
    await menu.getByRole('menuitem', { name: /highlight/i }).first().click({ force: true });

    const palette = window.getByLabel('Highlight options');
    await palette.waitFor({ state: 'visible', timeout: 10_000 });
    const swatches = palette.getByRole('button', { name: /highlight in/i });
    const count = await swatches.count();
    await swatches.nth(i % count).click({ force: true });
    await window.waitForTimeout(600);
  }
}

/**
 * Write a verse note, and leave the Notes pane open on it.
 *
 * "Add Note" from the verse menu is the gesture the docs describe, and it also
 * creates the Notes pane — which the default layout does not open.
 */
/**
 * Bookmark some verses of the open chapter, naming the first of them.
 *
 * Drives the real toolbar menu rather than writing to the database, so the
 * shot shows the state the app actually reaches. The named one exists because
 * the page's whole point is that a *named* bookmark is a slot you move.
 */
async function seedBookmarks(
  window: Page,
  verseNumbers: number[],
  name?: string,
): Promise<void> {
  const ribbon = window.locator('[data-testid="bookmark-toggle"]').first();
  for (const verseNumber of verseNumbers) {
    const verse = window.locator(`[data-testid="verse-${verseNumber}"]`);
    await verse.waitFor({ state: 'visible', timeout: 20_000 });
    await verse.click({ force: true });
    // The ribbon opens the list; saving is the first item in it.
    await ribbon.click({ force: true });
    await window.locator('[data-testid="bookmark-add-current"]').click({ force: true });
    // The ribbon reflects the store, which the write round-trips through IPC.
    await window.waitForFunction(
      () => document.querySelector('[data-testid="bookmark-toggle"]')
        ?.getAttribute('data-bookmarked') === 'true',
      undefined,
      { timeout: 15_000 },
    );
  }

  if (!name) return;

  await openManageBookmarks(window);
  const dialog = window.locator('[data-testid="manage-bookmarks-dialog"]');
  const firstRename = dialog.locator('[data-testid^="bookmark-rename-"]').first();
  await firstRename.click({ force: true });
  const input = dialog.locator('[data-testid^="bookmark-name-input-"]').first();
  await input.waitFor({ state: 'visible', timeout: 10_000 });
  await input.fill(name);
  await input.press('Enter');
  await window.getByRole('button', { name: /^Done$/ }).first().click({ force: true });
  await dialog.waitFor({ state: 'detached', timeout: 10_000 });
}

/** Open the bookmark jump list hanging off the toolbar ribbon. */
async function openBookmarkList(window: Page): Promise<void> {
  await window.locator('[data-testid="bookmark-toggle"]').first()
    .click({ force: true });
  await window.locator('[data-testid="bookmark-manage"]')
    .waitFor({ state: 'visible', timeout: 10_000 });
}

/** Open the Manage Bookmarks dialog through the jump list. */
async function openManageBookmarks(window: Page): Promise<void> {
  await openBookmarkList(window);
  await window.locator('[data-testid="bookmark-manage"]').click({ force: true });
  await window.locator('[data-testid="manage-bookmarks-dialog"]')
    .waitFor({ state: 'visible', timeout: 15_000 });
}

async function seedVerseNote(
  window: Page,
  verseNumber: number,
  body: string,
  reference = `John 3:${verseNumber}`,
): Promise<void> {
  await openVerseMenu(window, verseNumber);
  await window.locator('[role="menu"][aria-label="Verse actions"]')
    .getByRole('menuitem', { name: /^Add Note$/ }).click({ force: true });

  // "Add Note" creates and reveals the Notes *pane*; it does not open an
  // editor. The note itself is made from the pane's own New Note button, which
  // asks for a title and a template before any editor exists.
  const pane = window.locator('[data-testid="notes-pane"]');
  await pane.waitFor({ state: 'visible', timeout: 30_000 });
  const newNote = pane.getByRole('button', { name: 'New Note' }).first();
  await newNote.waitFor({ state: 'visible', timeout: 30_000 });
  await newNote.click({ force: true });

  // Wait on the dialog's own title field: `[role="dialog"]` alone matches
  // whatever else the app has open and resolved before this one had mounted.
  const title = window.locator('#new-note-title');
  await title.waitFor({ state: 'visible', timeout: 20_000 });
  await title.fill(`${reference} — study note`);
  await window.getByRole('button', { name: /^Create$/ }).first().click({ force: true });

  const editor = window.locator('.ProseMirror, [contenteditable="true"]').first();
  await editor.waitFor({ state: 'visible', timeout: 30_000 });
  await editor.click({ force: true });
  await editor.pressSequentially(body, { delay: 12 });
  // Notes save themselves; give the debounce a moment so the shot is of saved text.
  await window.waitForTimeout(2_000);
}

/**
 * Create a prayer list and a few requests in it.
 *
 * A fresh profile has no prayer lists at all, and the pane's empty state --
 * "Prayers are kept in prayer lists" and one button -- is not what the page is
 * describing.
 */
async function seedPrayers(window: Page, listName: string, prayers: string[]): Promise<void> {
  await window.locator('[data-testid="prayer-create-first-list"]').click({ force: true });

  const name = window.locator('#prayer-list-config-new-name');
  await name.waitFor({ state: 'visible', timeout: 15_000 });
  await name.fill(listName);
  await name.press('Enter');
  // The config dialog lists what it has created, but its rows carry no test id
  // — `prayer-list-item` belongs to the pane's own list, which is not on screen
  // while the dialog is up. Wait for the name to appear in the dialog instead.
  const config = window.locator('[role="dialog"]').last();
  await config.getByText(listName, { exact: true }).first()
    .waitFor({ state: 'visible', timeout: 15_000 });
  await config.getByRole('button', { name: /^Done$/ }).first().click({ force: true });

  for (const title of prayers) {
    await window.getByRole('button', { name: /New Prayer$/ }).first().click({ force: true });
    // Scoped to the dialog's overlay, as the app's own e2e suite does
    // (apps/desktop/e2e/tests/notes.spec.ts): the prayer editor has a title
    // input of its own, which an unscoped selector matches once one is open.
    const field = window.locator('.fixed input[placeholder*="title"]').first();
    await field.waitFor({ state: 'visible', timeout: 15_000 });
    await field.click({ force: true });
    await field.fill(title);
    await window.locator('.fixed button:has-text("OK")').first().click({ force: true });
    // The dialog closes only once the prayer is saved. A failed save leaves it
    // open over an empty list — so wait for it to go, rather than sleeping and
    // photographing whatever state the save left behind.
    await field.waitFor({ state: 'detached', timeout: 15_000 });
  }
  await window.waitForTimeout(1_000);
}

// ---------------------------------------------------------------------------
// Shots — grouped by doc page. Names must match the `<!-- shot: … -->`
// placeholders in desktop/**/*.md; `--check` enforces that.
// ---------------------------------------------------------------------------

// ── intro.md ───────────────────────────────────────────────────────────────

register('intro', 'intro-study-layout', async ({ window, cap, out, annotate }) => {
  await selectVerse(window, 3);
  await settle(window, '[data-testid="study-pane"]');
  await showChapterTop(window);
  await annotate([
    { selector: '[data-testid="bible-pane"]', text: 'The Bible pane — the reading area', side: 'bottom' },
    { selector: '[data-testid="study-pane"]', text: 'The study pane follows the verse you select', side: 'left' },
    { selector: '[data-testid="search-input"]', text: 'Search, navigate, and run commands', side: 'bottom' },
  ]);
  await cap.full(out);
});

// The picture a README links to: as many features on screen at once as fit,
// and never annotated, so it stands on its own outside these docs.
register('intro', 'intro-overview', async ({ window, cap, out }) => {
  await seedHighlights(window, [...VERSE_NUMBERS.john3OverviewHighlights]);
  // Selected last: `selectVerse` centres its verse, which keeps 3:16 on screen
  // with the highlighted verses either side of it.
  await selectVerse(window, VERSE_NUMBERS.john3_16);
  await expandStudySection(window, /Cross-?References/i);
  await expandStudySection(window, /Topics/i);
  await settle(window, '[data-testid="study-pane"]');
  await cap.full(out);
});

// ── getting-started/installation.md ────────────────────────────────────────

registerManual('installation', 'installation-windows-installer',
  'The Windows installer is an NSIS executable, not the app — Playwright cannot drive it. ' +
  'Run the built installer, screenshot its directory step by hand, and save it as ' +
  'static/img/desktop/installation-windows-installer.png.');

// ── getting-started/installing-modules.md ──────────────────────────────────

register('installing-modules', 'modules-manager-available', async ({ window, cap, out, annotate }) => {
  await runCommand(window, 'module.openManager');
  const dialog = '[data-testid="module-manager-dialog"]';
  await window.locator(dialog).waitFor({ timeout: 25_000 });
  await window.waitForTimeout(2_500);
  await annotate([
    { selector: '[data-testid="module-manager-available-tab"]', text: 'Modules you can install', side: 'bottom' },
    { selector: '[data-testid="module-manager-installed-tab"]', text: 'What you already have', side: 'bottom' },
  ]);
  await cap.element(dialog, out, 8);
});

registerNeedsSetup('installing-modules', 'modules-download-progress',
  'Needs a reachable module repository. The official one is not live yet, so the Available ' +
  'tab reports "No modules found" and there is no download to photograph. Re-run ' +
  '`--shot=modules-download-progress` once a repository is configured.');

register('installing-modules', 'modules-installed-tab', async ({ window, cap, out, annotate }) => {
  await runCommand(window, 'module.openManager');
  const dialog = '[data-testid="module-manager-dialog"]';
  await window.locator(dialog).waitFor({ timeout: 25_000 });
  await window.locator('[data-testid="module-manager-installed-tab"]').click({ force: true });
  await window.locator('[data-testid="module-list-installed"] [data-testid^="module-card-"]').first()
    .waitFor({ timeout: 30_000 });
  await window.waitForTimeout(1_200);
  await annotate([
    { selector: '[data-testid="module-list-installed"] [data-testid^="module-card-"]',
      text: 'Each installed module, with its uninstall and update controls', side: 'right' },
  ]);
  await cap.element(dialog, out, 8);
});

// ── getting-started/quick-start.md ─────────────────────────────────────────

register('quick-start', 'quick-start-main-window', async ({ window, cap, out, annotate }) => {
  await annotate([
    { selector: '[data-testid="bible-pane"]', text: 'The Bible pane, on the left', side: 'right' },
    { selector: '[data-testid="study-pane"]', text: 'The study pane, on the right', side: 'left' },
    { selector: '[data-testid="search-input"]', text: 'The search bar, across the top', side: 'bottom' },
  ]);
  await cap.full(out);
});

register('quick-start', 'quick-start-book-chapter-picker', async ({ window, cap, out }) => {
  await window.locator('[data-testid="bible-chapter-heading"]').first().click({ force: true });
  await window.locator('[role="dialog"]').first().waitFor({ state: 'visible', timeout: 15_000 });
  await window.waitForTimeout(900);
  await cap.full(out);
});

register('quick-start', 'quick-start-translation-dropdown', async ({ window, cap, out }) => {
  await openModuleSelector(window);
  await cap.full(out);
});

register('quick-start', 'quick-start-display-modes', async (ctx) => {
  await captureDisplayModeStrip(ctx, ctx.out);
});

register('quick-start', 'quick-start-verse-with-commentary', async ({ window, cap, out, annotate }) => {
  await selectVerse(window, VERSE_NUMBERS.john3_3);
  await openPane(window, 'Commentary');
  await settle(window, '[data-testid="commentary-pane"]');
  await showChapterTop(window);
  await annotate([
    { selector: '[data-testid="verse-3"]', text: 'The selected verse', side: 'right' },
    { selector: '[data-testid="commentary-pane"]', text: 'Commentary for that verse', side: 'left' },
  ]);
  await cap.full(out);
});

register('quick-start', 'quick-start-verse-context-menu', async ({ window, cap, out }) => {
  await openVerseMenu(window, VERSE_NUMBERS.john3_3);
  await cap.full(out);
});

register('quick-start', 'quick-start-verse-note', async ({ window, cap, out, annotate }) => {
  await seedVerseNote(window, VERSE_NUMBERS.john3_16, NOTES.quickStart);
  await annotate([
    { selector: '[data-testid="notes-pane"]', text: 'Notes save themselves as you write' },
  ]);
  await cap.full(out);
});

register('quick-start', 'quick-start-search-results', async ({ window, cap, out }) => {
  await runSearch(window, SEARCHES.keyword);
  await cap.full(out);
});

register('quick-start', 'quick-start-layout-dropdown', async ({ window, cap, out }) => {
  await window.locator('[data-testid="layout-dropdown-button"]').click({ force: true });
  await window.locator('[data-testid^="layout-preset-"]').first().waitFor({ timeout: 10_000 });
  await window.waitForTimeout(400);
  await cap.full(out);
});

// ── user-guide/bible-reading.md ────────────────────────────────────────────

register('bible-reading', 'bible-reading-standard-mode', async ({ window, cap, out }) => {
  await gotoPassage(window, PSALM_23);
  await setDisplayMode(window, 'Standard');
  await cap.element('[data-testid="bible-pane"]', out);
});

register('bible-reading', 'bible-reading-book-chapter-picker', async ({ window, cap, out, annotate }) => {
  await window.locator('[data-testid="bible-chapter-heading"]').first().click({ force: true });
  await window.locator('#book-chapter-picker-title').waitFor({ state: 'visible', timeout: 15_000 });
  // The chapter grid is not rendered until a book is chosen, so a picker
  // screenshot taken straight after opening shows only half the interaction.
  await window.getByRole('button', { name: /^John$/ }).first().click({ force: true });
  await window.locator('#chapter-grid-label').waitFor({ state: 'visible', timeout: 15_000 });
  await window.waitForTimeout(700);
  await annotate([
    // The picker replaces the book grid with the chapter grid once a book is
    // chosen, so the heading is all that is left of step one. Pointing "then a
    // chapter" at the grid's caption — a line of small grey text — was the
    // confusing part: it labelled the words rather than the buttons.
    { selector: '#book-chapter-picker-title', text: 'The book you chose', side: 'right' },
    { selector: '[role="group"][aria-labelledby="chapter-grid-label"]',
      text: 'Then a chapter', side: 'right' },
  ]);
  await cap.full(out);
});

register('bible-reading', 'bible-reading-translation-dropdown', async ({ window, cap, out }) => {
  await openModuleSelector(window);
  await cap.full(out);
});

register('bible-reading', 'bible-reading-parallel-view', async ({ window, cap, out }) => {
  await gotoPassage(window, PSALM_23);
  await window.locator('[data-testid="parallel-toggle"]').first().click({ force: true });

  // The toggle opens a version picker, and the comparison stays empty until at
  // least one column is chosen -- so the shot needs the picker driven, not just
  // the button pressed.
  const picker = window.locator('[data-testid="parallel-version-picker"]');
  await picker.waitFor({ state: 'visible', timeout: 20_000 });
  const selects = picker.locator('select');
  // The options are whatever Bibles this data directory has installed, so
  // prefer ASV and BSB but fall back to the first two that exist rather than
  // timing out on a translation the machine never downloaded.
  const installed = (await selects.nth(0).locator('option').evaluateAll(
    (options) => options.map((o) => (o as HTMLOptionElement).value),
  )).filter(Boolean);
  const preferred = ['ASV', 'BSB'].filter((v) => installed.includes(v));
  const columns = [...preferred, ...installed.filter((v) => !preferred.includes(v))].slice(0, 2);
  if (columns.length < 2) {
    throw new Error(`Parallel view needs two installed Bibles; found ${installed.join(', ') || 'none'}.`);
  }
  await selects.nth(0).selectOption({ value: columns[0] });
  await selects.nth(1).selectOption({ value: columns[1] });
  // Escape *cancels* the picker, which is why pressing it left the pane in
  // ordinary single-translation mode. The comparison starts on Compare.
  await picker.getByRole('button', { name: /^Compare/ }).click({ force: true });

  await window.locator('[data-testid="parallel-verse-1"]').waitFor({ timeout: 30_000 });
  await window.waitForTimeout(2_000);
  await cap.element('[data-testid="bible-pane"]', out);
});

register('bible-reading', 'bible-reading-mode-simple', async ({ window, cap, out }) => {
  await gotoPassage(window, PSALM_23);
  await setDisplayMode(window, 'Reading');
  await cap.element('[data-testid="bible-pane"]', out);
});

register('bible-reading', 'bible-reading-mode-standard', async ({ window, cap, out }) => {
  await gotoPassage(window, PSALM_23);
  await setDisplayMode(window, 'Standard');
  await cap.element('[data-testid="bible-pane"]', out);
});

register('bible-reading', 'bible-reading-mode-study', async ({ window, cap, out }) => {
  await gotoPassage(window, JOHN_3);
  await setDisplayMode(window, 'Study');
  await window.locator('[data-testid="interlinear-container"]').first().waitFor({ timeout: 40_000 });
  await window.waitForTimeout(1_500);
  await cap.element('[data-testid="bible-pane"]', out);
});

// ── user-guide/study-tools.md ──────────────────────────────────────────────

register('study-tools', 'study-tools-verse-selected', async ({ window, cap, out, annotate }) => {
  await selectVerse(window, 3);
  await settle(window, '[data-testid="study-pane"]');
  await showChapterTop(window);
  await annotate([
    { selector: '[data-testid="verse-3"]', text: 'Select a verse…', side: 'right' },
    { selector: '[data-testid="study-pane"]', text: '…and the study tools follow it', side: 'left' },
  ]);
  await cap.full(out);
});

register('study-tools', 'study-tools-commentary-entry', async ({ window, cap, out }) => {
  await selectVerse(window, 16);
  await openPane(window, 'Commentary');
  await settle(window, '[data-testid="commentary-pane"]');
  await cap.element('[data-testid="commentary-pane"]', out);
});

register('study-tools', 'study-tools-dictionary-strongs', async ({ window, cap, out }) => {
  await openDictionaryEntry(window, 'G26');
  // The pane is full-height and a lexicon entry is four lines, so a shot of the
  // pane is four fifths empty. Frame the toolbar and the entry together.
  await cap.union(
    ['[data-testid="dictionary-toolbar"]', '[data-testid="dictionary-entry"]'],
    out,
    14,
  );
});

register('study-tools', 'study-tools-dictionary-occurrences', async ({ window, cap, out, annotate }) => {
  // Listing every occurrence of a word is not a control in the Dictionary pane.
  // It is offered by the Strong's popup in Study mode, and what it produces is
  // a Strong's *search* -- the verse list the docs describe.
  await gotoPassage(window, JOHN_3);
  await setDisplayMode(window, 'Study');
  await window.locator('[data-testid="strongs-number"]').first()
    .waitFor({ state: 'visible', timeout: 40_000 });
  await window.locator('[data-testid="strongs-number"]').first().click({ force: true });

  const occurrences = window.locator('[data-testid="strongs-search-occurrences"]');
  await occurrences.waitFor({ state: 'visible', timeout: 20_000 });
  await occurrences.click({ force: true });

  await window.locator('[data-testid="search-results"]').waitFor({ state: 'visible', timeout: 40_000 });
  await window.locator('[data-testid="search-result"]').first().waitFor({ timeout: 40_000 });
  await window.waitForTimeout(1_500);
  await annotate([
    { selector: '[data-testid="search-results-pane"] .pane-header',
      text: 'Every verse using that Greek word', side: 'bottom' },
  ]);
  await cap.element('[data-testid="search-results-pane"]', out);
});

register('study-tools', 'study-tools-interlinear-stack', async ({ window, cap, out, annotate }) => {
  await gotoPassage(window, JOHN_3);
  await setDisplayMode(window, 'Study');
  const stack = '[data-testid="interlinear-container"]';
  await window.locator(stack).first().waitFor({ timeout: 40_000 });
  await window.waitForTimeout(1_200);
  await annotate([
    { selector: '[data-testid="interlinear-gloss"]', text: 'The English words', side: 'top' },
    { selector: '[data-testid="interlinear-original"]', text: 'The Greek or Hebrew behind them', side: 'bottom' },
    { selector: '[data-testid="strongs-number"]', text: 'Strong’s number — click to look it up', side: 'bottom' },
  ]);
  await cap.element(stack, out, 24);
});

register('study-tools', 'study-tools-cross-references', async ({ window, cap, out }) => {
  await selectVerse(window, 16);
  await expandStudySection(window, /Cross-?References/i);
  await settle(window, '[data-testid="study-pane"]');
  await cap.element('[data-testid="study-pane"]', out);
});

register('study-tools', 'study-tools-topics', async ({ window, cap, out }) => {
  await selectVerse(window, 16);
  await openPane(window, 'Topics');
  await settle(window, '[data-testid="topics-pane"]');
  await cap.element('[data-testid="topics-pane"]', out);
});

register('study-tools', 'study-tools-study-pane', async ({ window, cap, out }) => {
  await selectVerse(window, 16);
  await expandStudySection(window, /Cross-?References/i);
  await expandStudySection(window, /Topics/i);
  await settle(window, '[data-testid="study-pane"]');
  await cap.element('[data-testid="study-pane"]', out);
});

// ── user-guide/search.md ───────────────────────────────────────────────────

register('search', 'search-live-suggestions', async ({ window, cap, out }) => {
  const input = window.locator('[data-testid="search-input"]');
  await input.click({ force: true });
  // A whole word, typed a character at a time. The earlier version stopped at
  // "shepher" to suggest a search in mid-flight, and the app answered a partial
  // word with "No results found" — so the one picture of this feature in the
  // docs was a picture of it finding nothing.
  await input.type(SEARCHES.typeAhead, { delay: 60 });

  const dropdown = window.locator('[data-testid="live-suggestions"], [data-testid="search-dropdown"]').first();
  await dropdown.waitFor({ state: 'visible', timeout: 15_000 });

  // Wait for the suggestions themselves, and fail rather than photograph an
  // empty list: an empty-state shot filed under "live suggestions" is worse
  // than no shot, because it looks like the feature working.
  const populated = await pollUntil(
    window,
    () => {
      const el = document.querySelector('[data-testid="live-suggestions"], [data-testid="search-dropdown"]');
      const text = el?.textContent ?? '';
      return text.length > 0 && !/no results|searching/i.test(text);
    },
    undefined,
    { timeout: 20_000 },
  );
  if (!populated) {
    throw new Error(
      `The suggestions list stayed empty for "${SEARCHES.typeAhead}". ` +
      'Check that a Bible module with a search index is installed in the capture profile.',
    );
  }
  await window.waitForTimeout(500);
  await cap.rect({ x: 0, y: 0, width: VIEWPORT.width, height: 420 }, out);
});

register('search', 'search-results-distribution', async ({ window, cap, out }) => {
  await runSearch(window, SEARCHES.distribution);
  // No callout. The pane's own header already says what was searched for and
  // how many verses matched, in those words; an arrow pointing at it and
  // repeating them explained nothing the picture had not already said.
  await settle(window, '[data-testid="search-results-pane"]');
  await cap.element('[data-testid="search-results-pane"]', out);
});

register('search', 'search-advanced-dialog', async ({ window, cap, out }) => {
  await runCommand(window, 'search.openAdvanced');
  const dialog = '[data-testid="advanced-search-dialog"]';
  await window.locator(dialog).waitFor({ state: 'visible', timeout: 15_000 });
  await window.waitForTimeout(600);
  await cap.element(dialog, out, 8);
});

registerNeedsSetup('search', 'search-semantic-results',
  'Needs the semantic search feature pack: `data/semantic_index.db` and the embedding model ' +
  'under `data/models/`. Neither is present, so `search:semanticAvailable` returns false and ' +
  'the Ideas Search control never appears. Install the pack (or build the index) and re-run ' +
  '`--shot=search-semantic-results`.');

// ── user-guide/bookmarks.md ────────────────────────────────────────────────

register('bookmarks', 'bookmarks-toolbar-star', async ({ window, cap, out, annotate }) => {
  await gotoPassage(window, JOHN_3);
  await seedBookmarks(window, [VERSE_NUMBERS.john3_16]);
  await annotate([
    { selector: '[data-testid="bookmark-toggle"]', text: 'Filled: the selected verse is saved' },
  ]);
  await cap.element('[data-testid="bible-pane"]', out);
});

register('bookmarks', 'bookmarks-jump-list', async ({ window, cap, out }) => {
  await gotoPassage(window, JOHN_3);
  await seedBookmarks(window, [VERSE_NUMBERS.john3_3, VERSE_NUMBERS.john3_16]);
  await openBookmarkList(window);
  await cap.full(out);
});

register('bookmarks', 'bookmarks-replace-menu', async ({ window, cap, out }) => {
  await gotoPassage(window, JOHN_3);
  await seedBookmarks(window, [VERSE_NUMBERS.john3_3], BOOKMARKS.namedBookmark);
  // Right-click a *different* verse, so the list on offer is somewhere to move
  // the existing bookmark to.
  await openVerseMenu(window, VERSE_NUMBERS.john3_16);
  await window.locator('[data-testid="verse-bookmarks"]').click({ force: true });
  await window.locator('[data-testid="verse-add-bookmark"]')
    .waitFor({ state: 'visible', timeout: 10_000 });
  await cap.full(out);
});

register('bookmarks', 'bookmarks-manage-dialog', async ({ window, cap, out }) => {
  await gotoPassage(window, JOHN_3);
  await seedBookmarks(
    window,
    [VERSE_NUMBERS.john3_3, VERSE_NUMBERS.john3_16],
    BOOKMARKS.namedBookmark,
  );
  await openManageBookmarks(window);
  await cap.element('[data-testid="manage-bookmarks-dialog"]', out);
});

// ── user-guide/notes-and-highlights.md ─────────────────────────────────────

register('notes-and-highlights', 'notes-highlighted-verses', async ({ window, cap, out }) => {
  await gotoPassage(window, PSALM_23);
  await seedHighlights(window, [...VERSE_NUMBERS.psalm23Highlights]);
  await cap.element('[data-testid="bible-pane"]', out);
});

register('notes-and-highlights', 'notes-verse-note-open', async ({ window, cap, out, annotate }) => {
  await seedVerseNote(window, VERSE_NUMBERS.john3_16, NOTES.verseNote);
  await annotate([
    { selector: '[data-testid="bible-pane"]', text: 'The passage stays beside what you write' },
    { selector: '[data-testid="notes-pane"]', text: 'The note, saved as you type' },
  ]);
  await cap.full(out);
});

registerUnbuilt('notes-and-highlights', 'notes-journal-tab',
  'The docs describe a Journal tab, but `JournalTab` is only wired into `DetachedWindow`; ' +
  '`PanelContentRenderer` has no `journal` panel type and the New Tab page offers no Journal ' +
  'button, so there is no Journal in the main window to photograph. Either the pane needs ' +
  'building or the page needs rewriting.');

register('notes-and-highlights', 'notes-prayer-tab', async ({ window, cap, out }) => {
  await openPane(window, 'Prayer');
  await window.locator('[data-testid="prayer-pane"]').waitFor({ state: 'visible', timeout: 20_000 });
  await seedPrayers(window, PRAYERS.listName, [...PRAYERS.requests]);
  await cap.element('[data-testid="prayer-pane"]', out);
});

register('notes-and-highlights', 'notes-editor-toolbar', async ({ window, cap, out }) => {
  await seedVerseNote(window, VERSE_NUMBERS.john3_16, NOTES.formattingSample);
  // Select the text so the toolbar's state reflects a real selection.
  const editor = window.locator('.ProseMirror, [contenteditable="true"]').first();
  await editor.click({ force: true });
  await window.keyboard.press('Control+A');
  await window.keyboard.press('Control+B');
  await window.waitForTimeout(800);
  // The page is about the toolbar, and the editor below it is one styled line
  // on a full-height blank page. Crop to the band that carries both.
  const pane = await cap.box('[data-testid="notes-pane"]');
  await cap.rect({ x: pane.x, y: pane.y, width: pane.width, height: 230 }, out);
});

// ── user-guide/copy-and-export.md ──────────────────────────────────────────

register('copy-and-export', 'copy-verse-context-menu', async ({ window, cap, out, annotate }) => {
  await openVerseMenu(window, 16);
  await annotate([
    { selector: '[role="menu"][aria-label="Verse actions"] [role="menuitem"]:has-text("Copy")',
      text: 'Opens the copy dialog', side: 'right' },
  ]);
  await cap.full(out);
});

register('copy-and-export', 'copy-dialog-preview', async ({ window, cap, out, annotate }) => {
  await openCopyDialog(window);
  await annotate([
    { selector: '[data-testid="passage-reference-input"]', text: 'Adjust the range without reselecting', side: 'bottom' },
  ]);
  await cap.element('[data-testid="passage-dialog"]', out, 8);
});

register('copy-and-export', 'copy-template-editor', async ({ window, cap, out }) => {
  await openCopyDialog(window);
  await openTemplateEditor(window);
  await cap.element('[data-testid="passage-dialog"]', out, 8);
});

// ── user-guide/sessions-and-layout.md ──────────────────────────────────────

register('sessions-and-layout', 'layout-study-pane-collapsed', async ({ window, cap, out }) => {
  await window.locator('[data-testid="collapse-pane"]').first().click({ force: true });
  await window.waitForTimeout(1_500);
  await cap.full(out);
});

register('sessions-and-layout', 'layout-tab-context-menu', async ({ window, cap, out }) => {
  const tab = window.locator('.dockview-tab-content', { hasText: 'Commentary' }).first();
  await tab.click({ button: 'right', force: true });
  await window.locator('text=Split Right').first().waitFor({ state: 'visible', timeout: 10_000 });
  await window.waitForTimeout(400);
  await cap.full(out);
});

register('sessions-and-layout', 'layout-dropdown-presets', async ({ window, cap, out }) => {
  await window.locator('[data-testid="layout-dropdown-button"]').click({ force: true });
  await window.locator('[data-testid^="layout-preset-"]').first().waitFor({ timeout: 10_000 });
  await window.waitForTimeout(400);
  await cap.full(out);
});

register('sessions-and-layout', 'layout-popped-out-window', async ({ app, window, cap, out }) => {
  await selectVerse(window, 16);
  await openPane(window, 'Commentary');
  await settle(window, '[data-testid="commentary-pane"]');

  const tab = window.locator('.dockview-tab-content', { hasText: 'Commentary' }).first();
  await tab.click({ button: 'right', force: true });
  await window.locator('text=Pop Out to Window').first().click({ force: true });

  // The detached pane is a second BrowserWindow, so it needs its own page and
  // its own metrics override -- the first window's does not apply to it.
  const detached = await app.app.waitForEvent('window', { timeout: 30_000 });
  await detached.waitForSelector('[data-testid="detached-pane"], [data-testid="commentary-pane"]', { timeout: 30_000 });
  await detached.waitForTimeout(3_000);
  const detachedCap = await Capturer.attach(app.app, detached);

  // Both windows, labelled. A screenshot of the detached window alone is
  // indistinguishable from an ordinary pane -- CDP captures web contents, not
  // the OS frame around them, so nothing in the picture says "separate window".
  await window.waitForTimeout(1_500);
  const mainTile = join(TILE_DIR, 'popout-main.png');
  const detachedTile = join(TILE_DIR, 'popout-detached.png');
  await cap.full(mainTile);
  await detachedCap.full(detachedTile);
  await composite(
    [
      { path: mainTile, label: 'The main window' },
      { path: detachedTile, label: 'The Commentary pane, in a window of its own' },
    ],
    out,
    { tileWidth: 560 },
  );
});

// ── user-guide/personalizing.md ────────────────────────────────────────────

register('personalizing', 'personalizing-preferences-themes', async ({ window, cap, out }) => {
  await runCommand(window, 'app.openPreferences');
  await window.locator('#preferences-tab-themes').waitFor({ state: 'visible', timeout: 15_000 });
  await window.locator('#preferences-tab-themes').click({ force: true });
  await window.waitForTimeout(900);
  await cap.element('[role="dialog"][aria-labelledby="preferences-dialog-title"]', out, 8);
});

register('personalizing', 'personalizing-theme-comparison', async (ctx) => {
  await gotoPassage(ctx.window, PSALM_23);
  const tiles: Array<{ path: string; label: string }> = [];
  for (const [command, label] of [
    ['view.theme.light', 'Light'],
    ['view.theme.dark', 'Dark'],
    ['view.theme.sepia', 'Sepia'],
  ] as const) {
    await runCommand(ctx.window, command);
    await ctx.window.waitForTimeout(1_200);
    const tile = join(TILE_DIR, `theme-${label.toLowerCase()}.png`);
    await ctx.cap.element('[data-testid="bible-pane"]', tile);
    tiles.push({ path: tile, label });
  }
  await composite(tiles, ctx.out);
});

register('personalizing', 'personalizing-text-settings', async ({ window, cap, out }) => {
  await runCommand(window, 'app.openPreferences');
  await window.locator('#preferences-tab-typography').waitFor({ state: 'visible', timeout: 15_000 });
  await window.locator('#preferences-tab-typography').click({ force: true });
  await window.waitForTimeout(900);
  await cap.element('[role="dialog"][aria-labelledby="preferences-dialog-title"]', out, 8);
});

// ── user-guide/backup-and-restore.md ───────────────────────────────────────

register('backup-and-restore', 'backup-dialog', async ({ window, cap, out }) => {
  await runCommand(window, 'notes.export');
  const dialog = '[role="dialog"][aria-labelledby="backup-restore-title"]';
  await window.locator(dialog).waitFor({ state: 'visible', timeout: 15_000 });
  await window.waitForTimeout(600);
  await cap.element(dialog, out, 8);
});

register('backup-and-restore', 'restore-dialog', async ({ window, cap, out }) => {
  await runCommand(window, 'notes.export');
  const dialog = '[role="dialog"][aria-labelledby="backup-restore-title"]';
  await window.locator(dialog).waitFor({ state: 'visible', timeout: 15_000 });
  await window.locator(dialog).getByRole('tab', { name: /Restore/i }).click({ force: true });
  await window.waitForTimeout(800);
  await cap.element(dialog, out, 8);
});

// ── user-guide/keyboard-shortcuts.md ───────────────────────────────────────

register('keyboard-shortcuts', 'shortcuts-command-palette', async ({ window, cap, out }) => {
  await runCommand(window, 'app.openCommandMode');
  const input = window.locator('[data-testid="search-input"]');
  await input.click({ force: true });
  await input.type('theme', { delay: 60 });
  await window.locator('[data-testid="search-dropdown"]').waitFor({ state: 'visible', timeout: 15_000 });
  await window.waitForTimeout(600);
  await cap.rect({ x: 0, y: 0, width: VIEWPORT.width, height: 460 }, out);
});

// ---------------------------------------------------------------------------
// Shared multi-step helpers used by more than one shot
// ---------------------------------------------------------------------------

/**
 * Open the translation selector in the Bible pane header.
 *
 * Addressed by its accessible name: the button carries no test id, and
 * `module-selector` belongs to the list it opens rather than to the trigger --
 * waiting on that before clicking waits for something that does not exist yet.
 */
async function openModuleSelector(window: Page): Promise<void> {
  const trigger = window.locator('[aria-label^="Change translation"]').first();
  await trigger.waitFor({ state: 'visible', timeout: 20_000 });
  await trigger.click({ force: true });
  await window.locator('[data-testid="module-selector-item"]').first()
    .waitFor({ state: 'visible', timeout: 20_000 });
  await window.waitForTimeout(600);
}

/** Run a keyword search and wait for the results pane to fill. */
async function runSearch(window: Page, query: string): Promise<void> {
  const input = window.locator('[data-testid="search-input"]');
  await input.click({ force: true });
  await input.fill(query);
  await input.press('Enter');
  await window.locator('[data-testid="search-results"]').waitFor({ state: 'visible', timeout: 40_000 });
  await window.locator('[data-testid="search-result"]').first().waitFor({ timeout: 40_000 });
  await window.waitForTimeout(1_200);
}

/** Right-click a verse and choose the copy action. */
async function openCopyDialog(window: Page): Promise<void> {
  await openVerseMenu(window, 16);
  await window.locator('[role="menu"][aria-label="Verse actions"]')
    .getByRole('menuitem', { name: /copy/i }).first().click({ force: true });
  await window.locator('[data-testid="passage-dialog"]').waitFor({ state: 'visible', timeout: 20_000 });
  await window.waitForTimeout(1_000);
}

/**
 * From the open copy dialog, reach the custom-template editor.
 *
 * It is not a dialog of its own: choosing the "Custom Template" *format* swaps
 * the format options out for the template editor and its live preview, inside
 * the copy dialog that is already open.
 */
async function openTemplateEditor(window: Page): Promise<void> {
  const dialog = window.locator('[data-testid="passage-dialog"]');
  await dialog.getByText(/Custom Template/i).first().click({ force: true });
  await dialog.locator('textarea').first().waitFor({ state: 'visible', timeout: 15_000 });
  await window.waitForTimeout(1_000);
}

/** The three display modes of one passage, side by side. */
async function captureDisplayModeStrip(ctx: ShotContext, outPath: string): Promise<void> {
  await gotoPassage(ctx.window, JOHN_3);
  const tiles: Array<{ path: string; label: string }> = [];
  for (const [mode, label] of [
    ['Reading', 'Simple'],
    ['Standard', 'Standard'],
    ['Study', 'Study'],
  ] as const) {
    await setDisplayMode(ctx.window, mode);
    if (mode === 'Study') {
      await ctx.window.locator('[data-testid="interlinear-container"]').first()
        .waitFor({ timeout: 40_000 }).catch(() => undefined);
      await ctx.window.waitForTimeout(1_500);
    }
    // Each mode relays out, and Study inserts its controls panel above the
    // text; without this the tiles start at three different scroll positions.
    await showChapterTop(ctx.window);
    const tile = join(TILE_DIR, `mode-${label.toLowerCase()}.png`);
    await ctx.cap.element('[data-testid="bible-pane"]', tile);
    tiles.push({ path: tile, label });
  }
  await composite(tiles, outPath);
}

/**
 * Open the Dictionary pane on a Strong's entry.
 *
 * The pane opens on a *library* of every installed dictionary, not on a lookup
 * box -- one has to be opened as a tab first, and it has to be the right one:
 * asking a general dictionary for "G26" gets an error state, not an entry.
 * Library ids keep the module's own capitalisation (`StrongsGreek`).
 */
async function openDictionaryEntry(window: Page, key: string): Promise<void> {
  await openPane(window, 'Dictionary');
  const lexicon = window.locator('[data-testid="library-item-StrongsGreek"]');
  await lexicon.waitFor({ state: 'visible', timeout: 25_000 });
  await lexicon.click({ force: true });

  const input = window.locator('[data-testid="dictionary-lookup-input"]').first();
  await input.waitFor({ state: 'visible', timeout: 25_000 });
  await input.fill(key);
  await input.press('Enter');
  await window.locator('[data-testid="dictionary-entry"]').first()
    .waitFor({ state: 'visible', timeout: 30_000 });
  await window.waitForTimeout(1_200);
}

// ---------------------------------------------------------------------------
// Preflight
// ---------------------------------------------------------------------------

/**
 * Refuse to run without modules.
 *
 * The failure this prevents is the expensive one: 53 shots that all succeed and
 * all show an empty reading area, discovered only when someone looks at the
 * PNGs.
 */
function preflight(): void {
  const desktop = desktopPackage();
  const main = join(desktop, 'data/main.db');
  const modules = join(desktop, 'data/modules');

  if (!existsSync(main)) {
    throw new Error(
      `No module registry at ${main}.\nRun \`npm run init\` at the app repository's root.`,
    );
  }
  const bibles = existsSync(modules)
    ? readdirSync(modules).filter((f) => f.startsWith('bible_') && f.endsWith('.db'))
    : [];
  if (bibles.length === 0) {
    throw new Error(
      `No Bible modules in ${modules}.\n` +
      `Put at least one \`bible_*.db\` there and run \`npm run init\` at the app repository's root.`,
    );
  }
  console.log(`Registry:  ${main}`);
  console.log(`Modules:   ${modules}  (${bibles.length} Bible module(s))`);
}

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
  annotate: boolean;
  keepOpen?: boolean;
}

function parseArgs(argv: string[]): CliOpts {
  const opts: CliOpts = { annotate: true, shots: [] };
  for (const a of argv) {
    if (a === '--list') opts.list = true;
    else if (a === '--check') opts.check = true;
    else if (a === '--embed') opts.embed = true;
    else if (a === '--annotate') opts.annotate = true;
    else if (a === '--no-annotate') opts.annotate = false;
    else if (a === '--keep-open') opts.keepOpen = true;
    else if (a.startsWith('--page=')) opts.page = a.slice('--page='.length);
    // Comma-separated, and repeatable. Re-taking a handful of shots after a
    // fix is the common case, and each desktop shot boots its own Electron
    // process, so naming several in one run matters more here than for the web.
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
 * Run one shot in an Electron process of its own.
 *
 * See the header for why per-shot isolation is worth the boot cost.
 */
async function runShot(shot: Shot, opts: CliOpts): Promise<void> {
  const app = await launchApp({ userDataDir: freshUserDataDir(shot.name) });
  try {
    await dismissWelcomeBar(app.window);
    const cap = await Capturer.attach(app.app, app.window);

    const ctx: ShotContext = {
      app,
      window: app.window,
      cap,
      out: placeholders.pngPath(shot.name),
      annotate: async (callouts) => {
        if (opts.annotate) await drawCallouts(app.window, callouts);
      },
      clearAnnotations: async () => clearCallouts(app.window),
    };

    await shot.fn(ctx);
  } finally {
    if (!opts.keepOpen) await app.app.close().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.list) {
    for (const s of shots) {
      const tag = s.kind === 'auto' ? '' : `  (${s.kind})`;
      console.log(`${s.page.padEnd(26)} ${s.name}${tag}`);
    }
    const by = (k: ShotKind) => shots.filter((s) => s.kind === k).length;
    console.log(
      `\n${shots.length} shots — ${by('auto')} automatic, ${by('manual')} by hand, ` +
      `${by('needs-setup')} awaiting setup, ${by('unbuilt')} documenting unbuilt UI.`,
    );
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

  if (placeholders.check(shots) > 0) {
    throw new Error('Shots and doc placeholders do not line up (see above). Compare with --list.');
  }

  preflight();

  const selected = filterShots(opts);
  if (selected.length === 0) {
    throw new Error(
      `No shots matched: page=${opts.page ?? '*'} shot=${opts.shots.length > 0 ? opts.shots.join(',') : '*'}`,
    );
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });
  mkdirSync(TILE_DIR, { recursive: true });

  const capturable = selected.filter((s) => s.kind === 'auto');
  const skipped = selected.filter((s) => s.kind !== 'auto');

  console.log(`\nCapturing ${capturable.length} shot(s) at ${VIEWPORT.width}×${VIEWPORT.height} @2×`);
  console.log(`Output: ${OUTPUT_DIR}\n`);

  let failures = 0;
  for (const shot of capturable) {
    const start = Date.now();
    console.log(`  ${shot.name} …`);
    try {
      await runShot(shot, opts);
      console.log(`  ${shot.name} done (${Math.round((Date.now() - start) / 1000)}s)`);
    } catch (err) {
      failures++;
      console.error(`  ${shot.name} FAILED: ${(err as Error).message.split('\n')[0]}`);
    }
  }

  if (skipped.length > 0) {
    console.log('\nNot captured here:');
    for (const s of skipped) {
      console.log(`  [${s.kind}] ${s.name}\n      ${s.note}`);
    }
  }

  console.log(`\nDone. ${capturable.length - failures}/${capturable.length} shot(s) captured.`);
  if (failures > 0) {
    console.log('Re-run a single failure with --shot=<name> to see it in isolation.');
    process.exitCode = 1;
  } else {
    console.log('Next: npm run screenshots:desktop:embed  to put them into the docs.');
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
