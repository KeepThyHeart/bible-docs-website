/**
 * Branding drift check
 * ====================
 *
 * `branding.json` at this repository's root is a copy. The source of truth is
 * the app repository's `admin/brand/branding.json`, because the product name,
 * domains and download URLs it holds are also compiled into the desktop and web
 * apps. The docs site keeps its own copy so that it builds and deploys on its
 * own, with no second checkout — which is exactly the arrangement that lets the
 * two drift apart unnoticed.
 *
 * A fork's `branding.local.json`, which overrides individual keys beside the
 * source, is applied before comparing, so the check reflects the values the apps
 * actually build with.
 *
 * The same holds for `static/img/logo.svg`, copied from the app repository's
 * `admin/brand/icon.svg`. The apps generate their icon sets from that file, so a
 * logo that has drifted means the site shows a different mark from the product
 * it documents. Each copy carries its own leading comment, so only the markup is
 * compared.
 *
 * This compares both, when the app repository is at hand:
 *
 *     npm run branding:diff                  # ../bible, or $BIBLE_REPO
 *     BIBLE_REPO=/path/to/bible npm run branding:diff
 *
 * Exit code 1 on any difference, so it can gate a deploy. With no app
 * repository to compare against it says so and exits 0 — a docs-only checkout
 * is a supported way to work, not a failure.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { appRepoRoot, brandingSources, iconSource, SITE_ROOT } from './lib/app-repo';

type Json = Record<string, unknown>;

function load(path: string): Json {
  return JSON.parse(readFileSync(path, 'utf8')) as Json;
}

function render(value: unknown): string {
  return typeof value === 'undefined' ? '(absent)' : JSON.stringify(value);
}

/** SVG markup with comments and collapsible whitespace removed, for comparison. */
function svgShape(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Compares `branding.json` with the app repository's. Returns true if they differ. */
function checkBranding(): boolean {
  const { source, local } = brandingSources();
  const minePath = join(SITE_ROOT, 'branding.json');
  if (!existsSync(minePath)) {
    throw new Error(`This site has no branding.json at ${minePath}. Copy ${source} there.`);
  }
  const mine = load(minePath);
  const theirs = existsSync(local) ? { ...load(source), ...load(local) } : load(source);
  const theirsPath = existsSync(local) ? `${source} + ${local}` : source;

  const keys = [...new Set([...Object.keys(mine), ...Object.keys(theirs)])].sort();
  const differences = keys.filter(
    (k) => JSON.stringify(mine[k]) !== JSON.stringify(theirs[k]),
  );

  if (differences.length === 0) {
    console.log(`branding.json matches ${theirsPath}.`);
    return false;
  }

  console.error(`branding.json differs from ${theirsPath}:\n`);
  for (const key of differences) {
    console.error(`  ${key}`);
    console.error(`    here:  ${render(mine[key])}`);
    console.error(`    there: ${render(theirs[key])}`);
  }
  console.error(`\nThe app repository's copy is the source of truth. Copy it over:`);
  console.error(`  cp ${source} ${minePath}\n`);
  return true;
}

/** Compares the site logo with the app repository's icon. Returns true if they differ. */
function checkIcon(): boolean {
  const source = iconSource();
  const minePath = join(SITE_ROOT, 'static/img/logo.svg');
  if (!existsSync(minePath)) {
    throw new Error(`This site has no logo at ${minePath}. Copy ${source} there.`);
  }
  if (!existsSync(source)) {
    console.log(`The app repository has no ${source}, so there is no icon to compare.`);
    return false;
  }
  if (svgShape(minePath) === svgShape(source)) {
    console.log(`static/img/logo.svg matches ${source}.`);
    return false;
  }

  console.error(`static/img/logo.svg differs from ${source}.`);
  console.error(`The app repository's copy is the source of truth. Copy it over:`);
  console.error(`  cp ${source} ${minePath}\n`);
  return true;
}

function main(): void {
  try {
    appRepoRoot();
  } catch (err) {
    // A `$BIBLE_REPO` that points somewhere wrong is a mistake worth reporting;
    // no app repository at all is a supported way to work on the docs alone.
    if (process.env.BIBLE_REPO) throw err;
    console.log('No app repository found, so there is nothing to compare against.');
    console.log('Clone it as ../bible or set BIBLE_REPO to check for drift.');
    return;
  }

  // Both checks run before exiting, so one command reports every drift at once.
  const drifted = [checkBranding(), checkIcon()].some(Boolean);
  if (drifted) process.exitCode = 1;
}

main();
