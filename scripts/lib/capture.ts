/**
 * Taking the picture
 * ==================
 *
 * Three things here that a plain `page.screenshot()` does not give us.
 *
 * **A fixed, screen-independent viewport.** The Electron window is a real OS
 * window, so its size is whatever the desktop allows and its device pixel ratio
 * is whatever the display reports. Screenshots taken that way differ between
 * machines and go stale the moment someone runs the script on a laptop. CDP's
 * `Emulation.setDeviceMetricsOverride` detaches layout from the window: the
 * renderer lays out at exactly 1440×900 CSS pixels and rasterises at 2×,
 * whatever the monitor underneath is doing.
 *
 * **2× output.** Playwright's own `screenshot()` normalises back to the
 * browser context's scale factor, which for Electron is 1 — the override is
 * honoured for layout and then thrown away for the raster. Calling
 * `Page.captureScreenshot` over CDP directly keeps it, so the PNGs are
 * retina-sharp and can be displayed at half size in the docs.
 *
 * **Annotations.** Callouts are drawn as a DOM overlay measured from the real
 * elements' bounding boxes, rather than composited onto the PNG afterwards at
 * hardcoded coordinates. When the UI moves, the arrow moves with it; when it
 * doesn't, the shot fails loudly instead of pointing at empty space.
 */

import type { CDPSession, ElectronApplication, Page } from 'playwright';
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** The CSS viewport every shot is laid out in. */
export const VIEWPORT = { width: 1440, height: 900 };

/** Raster multiplier. 2 makes the PNGs usable on a high-density display. */
export const SCALE = 2;

export interface Rect { x: number; y: number; width: number; height: number }

/**
 * Runs in the renderer: what, if anything, is still loading?
 *
 * Returns a short description of the first thing found, or null when the
 * window looks settled -- a description rather than a boolean so a shot that
 * gives up after the timeout says *what* it gave up on.
 *
 * The app exposes no single readiness flag, so this reads the DOM for what a
 * half-loaded window looks like: a spinner, an element marked busy, or a leaf
 * whose whole visible text is a loading placeholder.
 */
function windowBlocker(): string | null {
  // Visibility matters: spinners linger in the DOM for closed panels, and
  // matching those would hold every shot for the full timeout.
  for (const busy of Array.from(document.querySelectorAll('.fa-spin, .animate-spin, [aria-busy="true"]'))) {
    const rect = busy.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return `spinner: ${busy.getAttribute('class') ?? busy.tagName}`;
    }
  }
  for (const el of Array.from(document.querySelectorAll('body *'))) {
    if (el.children.length > 0) continue;
    const text = (el.textContent ?? '').trim();
    if (!/^(loading|searching)\b/i.test(text)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return `text: "${text.slice(0, 40)}"`;
  }
  return null;
}

export class Capturer {
  private constructor(
    private readonly page: Page,
    private readonly cdp: CDPSession,
  ) {}

  /**
   * Attach to a window and pin its metrics.
   *
   * Call once per launched app. The override survives navigation within the
   * window but not a new window, so a popped-out pane needs its own Capturer.
   */
  static async attach(app: ElectronApplication, page: Page): Promise<Capturer> {
    const cdp = await app.context().newCDPSession(page);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: VIEWPORT.width,
      height: VIEWPORT.height,
      deviceScaleFactor: SCALE,
      mobile: false,
    });
    // The app relays out on resize; without settling here the first shot of a
    // run catches dockview mid-reflow.
    await page.waitForTimeout(600);
    return new Capturer(page, cdp);
  }

  /**
   * Wait until nothing in the window is still fetching.
   *
   * Individual shots can call `settle()` on the one pane they care about, but
   * a commentary or cross-reference panel elsewhere on screen finishes on its
   * own schedule and lands in the picture reading "Loading ..." regardless.
   * Running this before every capture is the check none of them can forget.
   *
   * The app exposes no single readiness flag, so this reads the DOM for what a
   * half-loaded window looks like: a spinner, an element marked busy, or a leaf
   * whose whole visible text is a loading placeholder. A timeout only warns --
   * a slightly early shot beats no shot at all.
   */
  private async settle(): Promise<void> {
    // Polled by hand rather than with `waitForFunction`. The app serves a CSP
    // that forbids `eval`, and Playwright compiles that call's polling harness
    // with `new Function` -- so it rejected instantly on every shot and the
    // warning below fired while nothing had actually been waited for. The
    // giveaway was the timing: 4s shots against a 30s timeout. `page.evaluate`
    // goes over the debugger protocol, which CSP does not police.
    const deadline = Date.now() + 30_000;
    let blocker: string | null = null;
    for (;;) {
      blocker = await this.page.evaluate(windowBlocker);
      if (blocker === null || Date.now() > deadline) break;
      await this.page.waitForTimeout(200);
    }
    if (blocker !== null) {
      console.warn(`    [warn] window still loading; capturing anyway (${blocker})`);
    }
    await this.page.waitForTimeout(250);
  }

  /** The whole window. */
  async full(path: string): Promise<void> {
    await this.settle();
    await this.write(path, await this.cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    }));
  }

  /**
   * One element, plus optional padding in CSS pixels.
   *
   * Padding is clamped to the viewport: a clip that runs off the edge comes
   * back from CDP as a black band rather than an error.
   */
  async element(selector: string, path: string, padding = 0): Promise<void> {
    const box = await this.box(selector);
    await this.rect(pad(box, padding), path);
  }

  /** An explicit rectangle in CSS pixels. */
  async rect(rect: Rect, path: string): Promise<void> {
    await this.settle();
    // `scale: 1` — the device metrics override already supplies the 2×. Passing
    // `scale: SCALE` here multiplies on top of it and yields a 4× image.
    await this.write(path, await this.cdp.send('Page.captureScreenshot', {
      format: 'png',
      clip: { ...clamp(rect), scale: 1 },
    }));
  }

  /** The union of several elements' boxes — for "these two panes together". */
  async union(selectors: string[], path: string, padding = 0): Promise<void> {
    const boxes = await Promise.all(selectors.map((s) => this.box(s)));
    const left = Math.min(...boxes.map((b) => b.x));
    const top = Math.min(...boxes.map((b) => b.y));
    const right = Math.max(...boxes.map((b) => b.x + b.width));
    const bottom = Math.max(...boxes.map((b) => b.y + b.height));
    await this.rect(pad({ x: left, y: top, width: right - left, height: bottom - top }, padding), path);
  }

  /** A locator's bounding box, failing with the selector rather than `null`. */
  async box(selector: string): Promise<Rect> {
    const locator = this.page.locator(selector).first();
    await locator.waitFor({ state: 'visible', timeout: 20_000 });
    const box = await locator.boundingBox();
    if (!box) throw new Error(`"${selector}" has no bounding box (is it display:none?)`);
    return box;
  }

  private async write(path: string, res: { data: string }): Promise<void> {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, Buffer.from(res.data, 'base64'));
  }
}

function pad(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, width: r.width + by * 2, height: r.height + by * 2 };
}

function clamp(r: Rect): Rect {
  const x = Math.max(0, Math.round(r.x));
  const y = Math.max(0, Math.round(r.y));
  return {
    x,
    y,
    width: Math.min(Math.round(r.width), VIEWPORT.width - x),
    height: Math.min(Math.round(r.height), VIEWPORT.height - y),
  };
}

// ---------------------------------------------------------------------------
// Annotations
// ---------------------------------------------------------------------------

export interface Callout {
  /** The element being pointed at. */
  selector: string;
  /** The note itself. Keep it to a short phrase — this is a label, not prose. */
  text: string;
  /**
   * Which side of the element the bubble sits on. Default: whichever has room.
   *
   * Ignored for targets big enough to count as a *region* (a whole pane), where
   * there is no "outside" left on screen to put a bubble in — see `corner`.
   */
  side?: 'top' | 'right' | 'bottom' | 'left';
  /**
   * For region-sized targets: which of its own corners the label sits in.
   * Defaults to the corner nearest the middle of the window, so labels for
   * side-by-side panes lean toward each other instead of hugging the edges.
   */
  corner?: 'tl' | 'tr' | 'bl' | 'br';
}

/**
 * Past this fraction of the viewport in either axis, a target is a *region*.
 *
 * The distinction matters because the two cases want opposite treatments. A
 * button gets a tight ring and a bubble beside it. A pane has no beside — its
 * edges are the window's edges — so it gets a soft dashed boundary and a label
 * tucked into one of its own corners. Annotating a pane the first way produced
 * a red box around half the screen with its caption clipped off the bottom.
 */
const REGION_FRACTION = 0.5;

/**
 * Draw numbered callouts over the live page.
 *
 * Deliberately fails when a selector matches nothing. A screenshot whose
 * annotations silently vanished is worse than no screenshot: it looks correct,
 * and the missing explanation is exactly what the reader came for.
 *
 * The overlay is `position: fixed` at the top layer with `pointer-events: none`,
 * so it changes nothing about the page underneath — no reflow, no hover states
 * lost, and `clearCallouts` restores the page exactly.
 */
export async function drawCallouts(page: Page, callouts: Callout[]): Promise<void> {
  const boxes: Array<{
    box: Rect; text: string; side?: string; corner?: string; regionFraction: number;
  }> = [];
  for (const c of callouts) {
    const locator = page.locator(c.selector).first();
    await locator.waitFor({ state: 'visible', timeout: 15_000 });
    const box = await locator.boundingBox();
    if (!box) throw new Error(`callout target "${c.selector}" has no bounding box`);
    boxes.push({ box, text: c.text, side: c.side, corner: c.corner, regionFraction: REGION_FRACTION });
  }

  await page.evaluate((items) => {
    const NS = 'http://www.w3.org/2000/svg';
    const root = document.createElement('div');
    root.id = '__docs_callouts';
    root.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;pointer-events:none;' +
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;";

    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', String(innerWidth));
    svg.setAttribute('height', String(innerHeight));
    svg.style.cssText = 'position:absolute;inset:0;overflow:visible';
    root.appendChild(svg);
    // Attached *before* the bubbles are laid out. Measuring `offsetWidth` on a
    // detached subtree returns 0, which silently placed every bubble as if it
    // were a point — labels ran off the right edge and off the bottom.
    document.body.appendChild(root);

    // A calm indigo rather than a warning red. The callouts explain a feature;
    // in red they read as errors being pointed out, which is the opposite of
    // what a getting-started page wants to say.
    const ACCENT = '#4f5bd5';
    const GAP = 14;
    const INSET = 12;

    /** Bubbles already positioned, so later ones can be nudged clear. */
    const placed: Array<{ x: number; y: number; w: number; h: number }> = [];

    items.forEach((item, i) => {
      const n = i + 1;
      const { box } = item;
      const isRegion =
        box.width > innerWidth * item.regionFraction ||
        box.height > innerHeight * item.regionFraction;

      // The boundary. Tight and solid around a control; soft and dashed around
      // a whole pane, where a heavy box would dominate the picture.
      const ring = document.createElementNS(NS, 'rect');
      const inset = isRegion ? 2 : -3;
      ring.setAttribute('x', String(box.x + inset));
      ring.setAttribute('y', String(box.y + inset));
      ring.setAttribute('width', String(box.width - inset * 2));
      ring.setAttribute('height', String(box.height - inset * 2));
      ring.setAttribute('rx', isRegion ? '3' : '6');
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', ACCENT);
      ring.setAttribute('stroke-width', isRegion ? '2' : '2.5');
      if (isRegion) {
        ring.setAttribute('stroke-dasharray', '7 5');
        ring.setAttribute('opacity', '0.75');
      }
      svg.appendChild(ring);

      const bubble = document.createElement('div');
      bubble.style.cssText =
        'position:absolute;display:flex;align-items:center;gap:8px;' +
        'background:' + ACCENT + ';color:#fff;padding:7px 12px 7px 9px;' +
        'border-radius:8px;font-size:14px;line-height:1.25;font-weight:500;' +
        'box-shadow:0 3px 10px rgba(31,35,90,.22);max-width:280px;white-space:normal;';

      const badge = document.createElement('span');
      badge.textContent = String(n);
      badge.style.cssText =
        'flex:0 0 auto;width:20px;height:20px;border-radius:50%;background:#fff;' +
        'color:' + ACCENT + ';font-weight:700;font-size:12px;display:flex;' +
        'align-items:center;justify-content:center;';
      bubble.appendChild(badge);

      const label = document.createElement('span');
      label.textContent = item.text;
      bubble.appendChild(label);
      root.appendChild(bubble);

      // Measured after insertion — the bubble's size depends on its text.
      const bw = bubble.offsetWidth;
      const bh = bubble.offsetHeight;
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;

      let bx: number;
      let by: number;
      let connector: [number, number, number, number] | null = null;

      if (isRegion) {
        // Inside one of its own corners. Default leans toward the middle of the
        // window so two side-by-side panes label toward each other.
        // The *outer* corner by default. Leaning the labels toward the middle
        // put the two halves of a split window's captions on top of each other.
        const corner = item.corner ?? (cx < innerWidth / 2 ? 'tl' : 'tr');
        bx = corner.includes('l') ? box.x + INSET : box.x + box.width - bw - INSET;
        by = corner.startsWith('t') ? box.y + INSET : box.y + box.height - bh - INSET;
      } else {
        const room = {
          right: innerWidth - (box.x + box.width),
          left: box.x,
          bottom: innerHeight - (box.y + box.height),
          top: box.y,
        };
        // Only consider a side that can actually hold the bubble.
        const needed = { right: bw + GAP + 8, left: bw + GAP + 8, bottom: bh + GAP + 8, top: bh + GAP + 8 };
        const side = (item.side && room[item.side as keyof typeof room] >= needed[item.side as keyof typeof needed]
          ? item.side
          : Object.entries(room)
              .filter(([k, v]) => v >= needed[k as keyof typeof needed])
              .sort((a, b) => b[1] - a[1])[0]?.[0]
            ?? 'bottom') as keyof typeof room;

        switch (side) {
          case 'right':
            bx = box.x + box.width + GAP; by = cy - bh / 2;
            connector = [bx, cy, box.x + box.width + 3, cy];
            break;
          case 'left':
            bx = box.x - GAP - bw; by = cy - bh / 2;
            connector = [bx + bw, cy, box.x - 3, cy];
            break;
          case 'bottom':
            bx = cx - bw / 2; by = box.y + box.height + GAP;
            connector = [cx, by, cx, box.y + box.height + 3];
            break;
          default:
            bx = cx - bw / 2; by = box.y - GAP - bh;
            connector = [cx, by + bh, cx, box.y - 3];
        }
      }

      // Keep the bubble on screen whatever the arithmetic above decided.
      bx = Math.max(8, Math.min(bx, innerWidth - bw - 8));
      by = Math.max(8, Math.min(by, innerHeight - bh - 8));

      // Two callouts whose preferred spots overlap would otherwise print on top
      // of each other — which happened on every three-pane layout shot. Nudge
      // the later one clear rather than dropping it.
      for (let attempt = 0; attempt < 12; attempt++) {
        const clash = placed.find((p) =>
          bx < p.x + p.w + 6 && bx + bw + 6 > p.x && by < p.y + p.h + 6 && by + bh + 6 > p.y);
        if (!clash) break;
        by = clash.y + clash.h + 10;
        if (by + bh > innerHeight - 8) { by = 8; bx = Math.max(8, bx - bw - 12); }
      }
      placed.push({ x: bx, y: by, w: bw, h: bh });

      bubble.style.left = bx + 'px';
      bubble.style.top = by + 'px';

      if (connector) {
        const line = document.createElementNS(NS, 'line');
        line.setAttribute('x1', String(connector[0]));
        line.setAttribute('y1', String(connector[1]));
        line.setAttribute('x2', String(connector[2]));
        line.setAttribute('y2', String(connector[3]));
        line.setAttribute('stroke', ACCENT);
        line.setAttribute('stroke-width', '2.5');
        svg.appendChild(line);
      }
    });
  }, boxes);

  // One frame for the browser to paint the overlay before anything captures it.
  await page.waitForTimeout(150);
}

export async function clearCallouts(page: Page): Promise<void> {
  await page.evaluate(() => document.getElementById('__docs_callouts')?.remove());
}

// ---------------------------------------------------------------------------
// Compositing
// ---------------------------------------------------------------------------

export interface CompositeTile {
  /** PNG on disk. */
  path: string;
  /** Caption printed under the tile. */
  label: string;
}

/**
 * Lay several PNGs out side by side into one labelled image.
 *
 * Three of the doc pages ask for a comparison — the three display modes, the
 * three themes — as a single picture. Compositing them in a headless Chromium
 * page rather than with an image library keeps the dependency list at what this
 * package already has, and makes the labels real text laid out by a browser
 * instead of something hand-kerned into a bitmap.
 */
export async function composite(
  tiles: CompositeTile[],
  outPath: string,
  opts: { tileWidth?: number; gap?: number; background?: string } = {},
): Promise<void> {
  const tileWidth = opts.tileWidth ?? 460;
  const gap = opts.gap ?? 20;
  const background = opts.background ?? '#f4f4f5';

  const encoded = tiles.map((t) => ({
    label: t.label,
    src: 'data:image/png;base64,' + readFileSync(t.path).toString('base64'),
  }));

  const browser = await chromium.launch();
  try {
    // The viewport has to hold the whole row. An element wider than the
    // viewport is clipped rather than scrolled into frame, which silently cut
    // the last tile off every comparison image.
    const page = await browser.newPage({
      deviceScaleFactor: SCALE,
      viewport: {
        width: tiles.length * tileWidth + (tiles.length + 1) * gap + 40,
        height: 900,
      },
    });
    await page.setContent(
      `<style>
         *{box-sizing:border-box}
         body{margin:0;background:${background};
              font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
         .row{display:flex;gap:${gap}px;padding:${gap}px;align-items:flex-start}
         .tile{width:${tileWidth}px;flex:0 0 auto}
         .tile img{width:100%;display:block;border:1px solid #d4d4d8;border-radius:6px;
                   box-shadow:0 1px 4px rgba(0,0,0,.10);background:#fff}
         .tile .label{margin-top:9px;text-align:center;font-size:15px;
                      font-weight:600;color:#3f3f46}
       </style>
       <div class="row">${encoded
         .map((t) => `<div class="tile"><img src="${t.src}"><div class="label">${escapeHtml(t.label)}</div></div>`)
         .join('')}</div>`,
      { waitUntil: 'load' },
    );
    const row = page.locator('.row');
    await row.screenshot({ path: outPath });
  } finally {
    await browser.close();
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}
