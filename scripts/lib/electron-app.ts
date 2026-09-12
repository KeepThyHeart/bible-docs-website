/**
 * Launching the desktop app for screenshots
 * =========================================
 *
 * The Electron app is launched from *this* repository rather than from the app
 * repository's `apps/desktop`, so that everything the docs site needs to build
 * its own images lives in one place. Two consequences shape this module:
 *
 *   1. `playwright`'s `_electron.launch()` resolves the `electron` binary from
 *      the current working directory's `node_modules`, and this package does
 *      not depend on Electron. The path is therefore resolved explicitly out
 *      of the app repository's `apps/desktop/node_modules/electron`
 *      (`path.txt` beside `dist/`, which is how the `electron` package itself
 *      reports its binary). `app-repo.ts` is what finds that repository.
 *
 *   2. The app must already be built. `out/main/index.js` is what Electron is
 *      pointed at, and its native modules must have been rebuilt for Electron's
 *      ABI — `npm run build` at the app repository's root does both.
 *
 * The launch options mirror the app repository's
 * `apps/desktop/e2e/fixtures/electron.fixture.ts` deliberately. That fixture is the tested statement of what the app needs in
 * order to come up under automation (no sandbox, a basic password store, an
 * isolated `userData`), and a screenshot run that diverged from it would be
 * rediscovering the same failures from scratch. What this module adds is a
 * *seeded* profile rather than an empty one: pictures of an app with no notes
 * and no highlights would illustrate nothing.
 */

import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

import { desktopPackage } from './app-repo';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const PACKAGE_ROOT = resolve(__dirname, '../..');

/**
 * `out/main/index.js` in the app repository.
 *
 * Resolved on call rather than at import: this site is a separate repository,
 * and `--list` / `--check` must work in a checkout that has no app repository
 * beside it. See `app-repo.ts`.
 */
function mainJs(): string {
  return join(desktopPackage(), 'out/main/index.js');
}

/**
 * The Electron executable inside `apps/desktop`.
 *
 * `require('electron')` returns the path, but only when resolved from a
 * directory that has Electron installed — hence the explicit `createRequire`
 * anchored on the desktop package rather than a bare import.
 */
function electronExecutable(): string {
  const desktop = desktopPackage();
  const requireFromDesktop = createRequire(join(desktop, 'package.json'));
  const binary = requireFromDesktop('electron') as unknown;
  if (typeof binary !== 'string' || !existsSync(binary)) {
    throw new Error(
      `Could not find the Electron binary via ${desktop}.\n` +
      `Run \`npm install\` at the app repository's root first.`,
    );
  }
  return binary;
}

export interface LaunchOptions {
  /**
   * A `userData` directory to launch against. Pass the same one twice to keep
   * state (a note written by one shot, read by the next); omit it for a profile
   * wiped on every launch, which is what most shots want.
   */
  userDataDir?: string;
  /** Extra environment for the app process. */
  env?: Record<string, string>;
  /**
   * Extra Chromium switches, prepended to the app's own arguments.
   *
   * `--force-device-scale-factor=2` is the one that matters here: it is what
   * makes the captures 2× crisp, and it has to be a launch switch because
   * device pixel ratio is fixed when the renderer starts.
   */
  extraArgs?: string[];
}

export interface LaunchedApp {
  app: ElectronApplication;
  window: Page;
  userDataDir: string;
}

/** A fresh, empty `userData` directory under the OS temp dir. */
export function freshUserDataDir(label = 'default'): string {
  const dir = join(tmpdir(), 'bible-docs-shots', label);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Launch the app and wait until it is genuinely usable.
 *
 * "Usable" means more than `app-loaded`, which fires when the React tree mounts
 * — well before dockview has laid out its panels. Waiting on the tab strip is
 * the condition every caller actually depends on.
 */
export async function launchApp(opts: LaunchOptions = {}): Promise<LaunchedApp> {
  const mainEntry = mainJs();
  if (!existsSync(mainEntry)) {
    throw new Error(
      `The desktop app is not built.\n` +
      `  Expected: ${mainEntry}\n` +
      `  Run \`npm run build\` at the app repository's root (it also rebuilds native modules for Electron).`,
    );
  }

  const userDataDir = opts.userDataDir ?? freshUserDataDir();

  const app = await electron.launch({
    executablePath: electronExecutable(),
    cwd: desktopPackage(),
    args: [
      // Mirrors the e2e fixture — see the note at the top of this file.
      '--password-store=basic',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      ...(opts.extraArgs ?? []),
      mainEntry,
    ],
    env: {
      ...process.env,
      // Bypasses the OS keychain for encryption keys, exactly as the e2e run does.
      NODE_ENV: 'test',
      ELECTRON_USER_DATA: userDataDir,
      ...opts.env,
    } as Record<string, string>,
  });

  const window = await app.firstWindow();
  await window.waitForSelector('[data-testid="app-loaded"]', { timeout: 60_000 });
  await window.waitForSelector('.dockview-tab-content', { timeout: 30_000 }).catch(() => undefined);
  await dismissFirstRunDialog(window);

  return { app, window, userDataDir };
}

/**
 * Get past the first-run onboarding dialog.
 *
 * It is modal, and its scrim is only `bg-black/40` — so everything behind it
 * stays *visible* while every click lands on the scrim. A screenshot taken
 * without dismissing it is a picture of the dialog, and any shot that tries to
 * click first fails for reasons that look nothing like the real cause.
 *
 * Lifted from the e2e fixture, including its tolerance of the dialog's two
 * shapes (it opens straight on the second step when only one language is
 * selectable) and of its absence altogether.
 */
async function dismissFirstRunDialog(window: Page): Promise<void> {
  const dialog = window.locator('[data-testid="first-run-language-dialog"]');

  const appeared = await dialog
    .waitFor({ state: 'visible', timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  if (!appeared) return;

  for (let step = 0; step < 4; step++) {
    const done = window.locator('[data-testid="first-run-language-done"]:visible');
    const advance = (await done.count()) > 0
      ? done.first()
      : window.locator('[data-testid="first-run-language-continue"]:visible').first();

    if (await advance.count() === 0) break;
    await advance.click();

    const gone = await dialog
      .waitFor({ state: 'detached', timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (gone) return;
  }

  await dialog.waitFor({ state: 'detached', timeout: 5_000 });
}

/**
 * Dismiss the non-modal first-run welcome bar.
 *
 * Unlike the language dialog it blocks nothing, but it is a band across the top
 * of the window that has no business in a picture of the app's normal state.
 */
export async function dismissWelcomeBar(window: Page): Promise<void> {
  const dismiss = window.locator('[data-testid="onboarding-welcome-dismiss"]');
  if (await dismiss.count() === 0) return;
  await dismiss.click({ force: true }).catch(() => undefined);
  await window
    .locator('[data-testid="onboarding-welcome-bar"]')
    .waitFor({ state: 'detached', timeout: 5_000 })
    .catch(() => undefined);
}

/**
 * Run one of the app's registered commands.
 *
 * The alternative is driving the Electron application menu, which Playwright
 * cannot see — it is native OS chrome, not DOM. The command registry is the
 * same surface the menu items themselves call into, so this reaches File →
 * Preferences and its neighbours without any of that.
 */
export async function runCommand(window: Page, commandId: string): Promise<void> {
  await window.waitForFunction(() => Boolean(globalThis.__services), null, { timeout: 20_000 });
  await window.waitForFunction(
    (id) => globalThis.__services!.registry.list().some((c) => c.id === id),
    commandId,
    { timeout: 20_000 },
  );
  await window.evaluate((id) => globalThis.__services!.registry.execute(id), commandId);
}
