/**
 * Finding the Bible application repository
 * ========================================
 *
 * This site is its own repository. The docs it builds are prose and images, and
 * a plain `npm run build` needs nothing but this checkout — that is the point of
 * the split, and it is why nothing here resolves the app repository at import
 * time.
 *
 * The screenshot scripts are the exception. They photograph the real web and
 * desktop applications, so they need the app repository (`apps/web`,
 * `apps/desktop`) on disk, built and initialised. They call into this module
 * when they are about to launch something; `--list` and `--check`, which only
 * read the docs, never do.
 *
 * Where it looks, in order:
 *
 *   1. `$BIBLE_REPO` — an explicit path, absolute or relative to the working
 *      directory. Set this when the checkout lives somewhere unusual, or in CI.
 *   2. `../bible` — the app repository cloned as a sibling of this one, which is
 *      the layout the README asks for.
 *   3. `../../bible` — one level further out, for a site checked out inside a
 *      grouping directory of its own.
 *
 * A candidate counts only if it actually looks like the app repository, so a
 * stale or empty directory named `bible` produces the "here is what I tried"
 * error rather than a confusing failure several steps later.
 */

import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Root of *this* repository (the docs site). */
export const SITE_ROOT = resolve(__dirname, '../..');

/** Relative locations tried when `$BIBLE_REPO` is unset. */
const SIBLING_CANDIDATES = ['../bible', '../../bible'];

/** What a real app repository has that an empty directory of the same name does not. */
const MARKERS = ['apps/web/package.json', 'apps/desktop/package.json'];

function looksLikeAppRepo(dir: string): boolean {
  return MARKERS.every((m) => existsSync(join(dir, m)));
}

let cached: string | undefined;

/**
 * Absolute path to the Bible application repository.
 *
 * Throws with the full list of what was tried — the failure is nearly always a
 * missing clone or an unusual layout, and both are fixed by reading that list.
 */
export function appRepoRoot(): string {
  if (cached) return cached;

  const fromEnv = process.env.BIBLE_REPO;
  if (fromEnv) {
    const dir = isAbsolute(fromEnv) ? fromEnv : resolve(process.cwd(), fromEnv);
    if (!looksLikeAppRepo(dir)) {
      throw new Error(
        `BIBLE_REPO points at ${dir}, which does not look like the Bible app repository.\n` +
        `Expected to find ${MARKERS.join(' and ')} under it.`,
      );
    }
    cached = dir;
    return cached;
  }

  for (const rel of SIBLING_CANDIDATES) {
    const dir = resolve(SITE_ROOT, rel);
    if (looksLikeAppRepo(dir)) {
      cached = dir;
      return cached;
    }
  }

  const tried = SIBLING_CANDIDATES.map((rel) => `  - ${resolve(SITE_ROOT, rel)}`).join('\n');
  throw new Error(
    'Could not find the Bible app repository, which the screenshot scripts drive.\n' +
    'Looked in:\n' + tried + '\n\n' +
    'Clone it beside this one:\n' +
    `  git clone <app-repo-url> ${resolve(SITE_ROOT, '..')}/bible\n` +
    'or point at an existing checkout:\n' +
    '  BIBLE_REPO=/path/to/bible npm run screenshots\n\n' +
    'Building the docs themselves (`npm run build`) does not need it — only the\n' +
    'screenshot capture does.',
  );
}

/** `apps/web` inside the app repository. */
export function webPackage(): string {
  return join(appRepoRoot(), 'apps/web');
}

/** `apps/desktop` inside the app repository. */
export function desktopPackage(): string {
  return join(appRepoRoot(), 'apps/desktop');
}

/**
 * The app repository's `branding.json`, of which this site's root copy is a
 * duplicate — and, beside it, the optional `branding.local.json` a fork adds to
 * override individual keys. Returned as paths rather than parsed content so the
 * caller decides what to do when one is missing.
 */
export function brandingSources(): { source: string; local: string } {
  const repo = appRepoRoot();
  return {
    source: join(repo, 'admin/brand/branding.json'),
    local: join(repo, 'admin/brand/branding.local.json'),
  };
}

/**
 * The app repository's `admin/brand/icon.svg` — the source of truth for the
 * product icon, of which this site's `static/img/logo.svg` is a copy. The apps
 * generate their own icon sets from it, so a logo that has drifted from this
 * file is a site showing a different mark from the product it documents.
 */
export function iconSource(): string {
  return join(appRepoRoot(), 'admin/brand/icon.svg');
}
