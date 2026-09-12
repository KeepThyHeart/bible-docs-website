/**
 * Screenshot placeholders in the docs
 * ===================================
 *
 * Both capture scripts — `capture-screenshots.ts` for the web app and
 * `capture-desktop-screenshots.ts` for the Electron app — keep the same
 * contract with their Markdown: a page marks where a picture belongs with
 *
 *     <!-- shot: search-keyword-results — Standard Search results for a query -->
 *
 * and the capture script registers a shot of the same name. `--check` compares
 * the two sets in *both* directions, so neither a renamed shot nor a new
 * placeholder can slip through unnoticed; `--embed` turns each placeholder into
 * a real Markdown image once its PNG exists.
 *
 * This module holds that logic once. It was extracted from the web script when
 * the desktop script arrived rather than copied, because the two halves of the
 * check are only useful if they cannot drift: a fix to the duplicate detection
 * in one copy would otherwise silently not apply to the other.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** `<!-- shot: name — caption -->`, with an em dash or a plain double hyphen. */
const PLACEHOLDER_RE = /<!--\s*shot:\s*([a-z0-9-]+)\s*(?:—|--)\s*([\s\S]*?)\s*-->/g;

export interface Placeholder {
  name: string;
  caption: string;
  file: string;
  /** True once `--embed` has turned it into a Markdown image. */
  embedded: boolean;
}

/** The minimum a capture script must tell us about each shot it registers. */
export interface RegisteredShot {
  name: string;
}

export interface PlaceholderConfig {
  /** Root of the Markdown to scan, e.g. `<website>/desktop`. */
  docsDir: string;
  /** Where the PNGs are written, e.g. `<website>/static/img/desktop`. */
  outputDir: string;
  /** How the docs reference those PNGs, e.g. `/img/desktop`. */
  publicImgPath: string;
}

export class PlaceholderIndex {
  private readonly embeddedRe: RegExp;

  constructor(private readonly config: PlaceholderConfig) {
    // Built per instance because it embeds the public image path, which differs
    // between the web and desktop docs.
    this.embeddedRe = new RegExp(
      String.raw`!\[([^\]]*)\]\(` + config.publicImgPath + String.raw`/([a-z0-9-]+)\.png\)`,
      'g',
    );
  }

  /** Every Markdown file under `docsDir`. */
  docFiles(): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.md')) out.push(full);
      }
    };
    walk(this.config.docsDir);
    return out;
  }

  /**
   * Every shot the docs ask for, in either form.
   *
   * The embedded form has to be counted alongside the comment form. Without it,
   * running `--embed` would make every shot look orphaned and the next capture
   * run would refuse to start.
   */
  read(): Placeholder[] {
    const found: Placeholder[] = [];
    for (const file of this.docFiles()) {
      const text = readFileSync(file, 'utf-8');
      for (const m of text.matchAll(PLACEHOLDER_RE)) {
        found.push({ name: m[1], caption: m[2].replace(/\s+/g, ' ').trim(), file, embedded: false });
      }
      for (const m of text.matchAll(this.embeddedRe)) {
        found.push({ name: m[2], caption: m[1], file, embedded: true });
      }
    }
    return found;
  }

  /**
   * Compare the registered shots against the placeholders in the docs.
   * Returns the number of problems found; prints each one.
   */
  check(shots: readonly RegisteredShot[]): number {
    const placeholders = this.read();
    const docNames = new Set(placeholders.map((p) => p.name));
    const shotNames = new Set(shots.map((s) => s.name));

    const missingShots = [...docNames].filter((n) => !shotNames.has(n));
    const orphanShots = [...shotNames].filter((n) => !docNames.has(n));

    const dupes = new Map<string, number>();
    for (const p of placeholders) dupes.set(p.name, (dupes.get(p.name) ?? 0) + 1);
    const repeated = [...dupes].filter(([, n]) => n > 1).map(([name]) => name);

    for (const name of missingShots) {
      const where = placeholders.find((p) => p.name === name)!.file;
      console.error(`  docs reference "${name}" but no shot is registered  (${where})`);
    }
    for (const name of orphanShots) {
      console.error(`  shot "${name}" is registered but no doc references it`);
    }
    for (const name of repeated) {
      console.error(`  "${name}" appears in the docs more than once`);
    }

    const problems = missingShots.length + orphanShots.length + repeated.length;
    if (problems === 0) {
      const embedded = placeholders.filter((p) => p.embedded).length;
      const pending = placeholders.length - embedded;
      const captured = placeholders.filter((p) => existsSync(this.pngPath(p.name))).length;
      console.log(
        `OK — ${placeholders.length} shots referenced (${embedded} embedded, ${pending} awaiting capture), ` +
        `${shots.length} registered, all matched. ${captured} PNG(s) on disk.`,
      );
    }
    return problems;
  }

  /**
   * Replace placeholders with Markdown images, for every shot whose PNG exists.
   * A placeholder whose image has not been captured is left alone, so the docs
   * never end up pointing at a file that isn't there.
   */
  embed(): void {
    let embedded = 0;
    let skipped = 0;

    for (const file of this.docFiles()) {
      const before = readFileSync(file, 'utf-8');
      const after = before.replace(PLACEHOLDER_RE, (whole, name: string, caption: string) => {
        if (!existsSync(this.pngPath(name))) {
          skipped++;
          return whole;
        }
        embedded++;
        const alt = caption.replace(/\s+/g, ' ').trim().replace(/\]/g, '');
        return `![${alt}](${this.config.publicImgPath}/${name}.png)`;
      });
      if (after !== before) writeFileSync(file, after, 'utf-8');
    }

    console.log(`Embedded ${embedded} image(s).`);
    if (skipped > 0) {
      console.log(`Left ${skipped} placeholder(s) alone — no PNG captured for them yet.`);
    }
  }

  pngPath(name: string): string {
    return join(this.config.outputDir, `${name}.png`);
  }
}
