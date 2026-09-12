/**
 * Renderer globals the desktop capture script reaches inside `page.evaluate`.
 *
 * A narrower twin of `apps/desktop/e2e/renderer-globals.d.ts`, declaring
 * only what the screenshot run actually drives. It cannot simply import that
 * file: this package is deliberately outside the npm workspaces, so it has no
 * path into the desktop package's TypeScript project.
 *
 * If a capture starts failing because one of these shapes has changed, the
 * desktop copy is the source of truth — this file follows it.
 */

/** Command and i18n services the renderer attaches for automation. */
interface DocsShotServices {
  registry: {
    execute: (id: string, args?: unknown) => Promise<unknown>;
    list: () => ReadonlyArray<{ id: string; title?: unknown }>;
  };
  i18n: {
    t: (key: string, params?: Record<string, unknown>) => string;
    currentLocale: string;
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __services: DocsShotServices | undefined;
}

export {};
