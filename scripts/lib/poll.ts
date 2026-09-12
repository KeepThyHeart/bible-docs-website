/**
 * Waiting for a condition in a page that forbids `eval`
 * ====================================================
 *
 * Both apps serve a Content Security Policy without `unsafe-eval`. Playwright's
 * `page.waitForFunction` compiles its polling harness with `new Function`, so
 * under that policy it does not poll at all — it rejects on the first tick.
 * Every call site here wrapped that rejection in a `.catch()` that logged a
 * warning and carried on, which meant the waits looked like they were working
 * and in fact returned immediately. The visible symptom was screenshots of
 * panes still reading "Loading commentary…".
 *
 * `page.evaluate` goes over the debugger protocol, which CSP does not police,
 * so polling it by hand works where `waitForFunction` cannot. This is the same
 * technique `capture.ts` and the two capture scripts already use for their
 * top-level idle checks, lifted into one place so a new wait cannot
 * accidentally reintroduce the broken form.
 */

import type { Page } from 'playwright';

export interface PollOptions {
  /** Give up after this long. Default 30s. */
  timeout?: number;
  /** How often to re-evaluate. Default 200ms. */
  interval?: number;
}

/**
 * Poll `predicate` inside the page until it returns true.
 *
 * Returns true when the condition was met, false when it timed out — callers
 * decide whether a timeout is fatal or merely worth a warning. `predicate` is
 * serialised into the page, so it must not close over anything; pass what it
 * needs through `arg`.
 */
export async function pollUntil<T>(
  page: Page,
  predicate: (arg: T) => boolean,
  arg: T,
  options: PollOptions = {},
): Promise<boolean> {
  const timeout = options.timeout ?? 30_000;
  const interval = options.interval ?? 200;
  const deadline = Date.now() + timeout;

  for (;;) {
    // A predicate that throws (a selector matching nothing, say) counts as
    // "not yet", not as a failure — the element it wants may still be coming.
    // Playwright types `evaluate`'s argument as `Unboxed<T>`, which strips the
    // JSHandle wrappers this helper is never given. The cast keeps the
    // caller-facing signature in terms of the plain value they pass.
    const ok = await page
      .evaluate(predicate as (arg: unknown) => boolean, arg as unknown)
      .catch(() => false);
    if (ok) return true;
    if (Date.now() >= deadline) return false;
    await page.waitForTimeout(interval);
  }
}

/**
 * Wait for a container to stop showing loading placeholders.
 *
 * Panels fetch independently and each renders its own "Loading …" line, so a
 * shot taken as soon as the container exists catches a page of placeholders.
 * Matching the text as well as the spinner classes covers both: some sections
 * spin, others only say so in words.
 *
 * Visibility is the whole difficulty. Both apps keep spinners mounted inside
 * collapsed panels and unhovered tab cards — the commentary tab bar's
 * availability badge is one — and a bare `querySelector` finds every one of
 * them. Matching those held the commentary shots for the full timeout and then
 * captured them anyway, so the wait produced exactly the "Loading commentary…"
 * picture it existed to prevent. Only what is on screen counts.
 *
 * The text test reads leaf elements rather than the container's whole
 * `textContent`, so a commentary that merely discusses loading does not keep
 * the wait alive for ever.
 */
export async function pollSettled(
  page: Page,
  selector: string,
  options: PollOptions = {},
): Promise<boolean> {
  return pollUntil(
    page,
    (sel: string) => {
      const root = document.querySelector(sel);
      if (!root) return false;

      const onScreen = (el: Element): boolean => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      const spinners = root.querySelectorAll(
        '.fa-spin, .animate-spin, .spinner, [aria-busy="true"]',
      );
      for (const spinner of Array.from(spinners)) {
        if (onScreen(spinner)) return false;
      }

      for (const el of Array.from(root.querySelectorAll('*'))) {
        if (el.children.length > 0) continue;
        const text = (el.textContent ?? '').trim();
        if (!/^(loading|searching)\b/i.test(text)) continue;
        if (onScreen(el)) return false;
      }
      return true;
    },
    selector,
    options,
  );
}
