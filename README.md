Bible App Documentation Website
===============================
Site for documenting the Keep Thy Heart Bible Reader apps (web, desktop), built with [Docusaurus](https://docusaurus.io/).  This will also include the download links in the future for the desktop apps.

## Setting Up Screenshots
There is a screenshot script which takes screenshots of the real web and desktop apps.  Thus, to re-do these, you will need to set up the `KeepThyHeart/bible` repository, with enough modules for the screenshots to work properly.  The scripts look for the Bible repo in the following places:

1. `$BIBLE_REPO`, if set (absolute, or relative to the working directory)
2. `../bible` — cloned beside this repository, the expected layout
3. `../../bible`

E.g., you can set it up this way:

```
Git/
  bible/           the application (packages/core, apps/desktop, apps/web)
  bible-website/   this repository
```

Everything else — `npm start`, `npm run build`, `npm run screenshots:check`,
`npm run screenshots:desktop:list` — works in a checkout with no app repository
beside it. The resolution lives in `scripts/lib/app-repo.ts`, and a missing
checkout produces an error listing what it tried.

## Install

```bash
npm install
```

## Local development

```bash
npm start
```

Opens the dev site at <http://localhost:3000> with hot reload.

## Production build

```bash
npm run build
```

Outputs static files to `build/`. Serve with any static host.

## Docs are split by product

The desktop app and the web app are separate products with separate user
documentation, registered as separate Docusaurus docs plugin instances:

| Section | URL root | Source folder | Sidebar |
| --- | --- | --- | --- |
| Desktop app docs | `/desktop` | `desktop/` | `sidebars-desktop.ts` |
| Web app docs | `/web` | `web/` | `sidebars-web.ts` |

The classic preset's default `docs` plugin is disabled in
`docusaurus.config.ts` — both sections are registered as explicit
`@docusaurus/plugin-content-docs` instances. Each has its own sidebar,
breadcrumbs, and "Getting Started", so users browsing the desktop docs never
see web-only content and vice versa.

## Product name, domains, and URLs are placeholders

The product name, site domain, download location, module repository, and support
address are **not final yet**. None of them may be hardcoded in this site.

They live in **`branding.json` at this repository's root**, read through
`src/branding.ts`.

That file is a **copy**. The source of truth is the app repository's
`admin/brand/branding.json`, because the same names and URLs are compiled into
the desktop and web apps; this site keeps its own copy so that it builds and
deploys without a second checkout. Settle a value there, then copy it here:

```bash
npm run branding:diff     # compare the two, when the app repository is at hand
```

`npm run branding:check` **in the app repository** prints which values are still
provisional and lists every file outside `branding.json` that holds its own copy
(electron-builder configs, the NSIS script, localized UI strings, SQL
migrations), so a rename doesn't miss any.

To settle a value: edit it in the app repository's `admin/brand/branding.json`,
remove its key from the `_undecided` array, and copy the file here. A fork
overrides individual keys with a `branding.local.json` beside it rather than
editing the tracked file; `branding:diff` applies that override before
comparing, so it reports the values the apps actually build with.

### The logo

`static/img/logo.svg` is the same arrangement in image form: a copy of the app
repository's `admin/brand/icon.svg`, which is the source of truth for every icon
in the product. `branding:diff` compares it too, ignoring the leading comment
each copy carries. It serves as both the navbar mark and the favicon.

`static/img/logo.png` is a 512px raster of that SVG, used as the link-preview
image (`themeConfig.image`) and available to anything that cannot take an SVG.
It is committed so the site builds without extra tooling, but it is *derived* —
after copying a new `logo.svg` over, regenerate it:

```bash
convert -background none -density 384 static/img/logo.svg \
  -resize 512x512 static/img/logo.png
```

### Using the values

**In Markdown docs** — write `{{token}}` and a remark plugin substitutes it at
build time:

```markdown
Download {{productName}} from the [downloads page]({{downloadsUrl}}).
Report a bug on the [issue tracker]({{issuesUrl}}) or email {{supportEmail}}.
```

Tokens work in prose, headings, inline code, fenced code blocks, and link/image
URLs. The plugin is registered as a `beforeDefaultRemarkPlugins` entry so that
substitution happens before Docusaurus extracts a page's title from its H1 —
otherwise a token in an H1 would survive into the page metadata.
Available tokens are the string fields of `src/branding.ts`: `productName`,
`productNameShort`, `tagline`, `appId`, `siteUrl`, `githubUrl`, `issuesUrl`,
`downloadsUrl`, `moduleRepositoryUrl`, `supportEmail`, `license`, `licenseName`,
`copyrightHolder`. An unrecognised token is left as-is so typos are visible.

> This applies to `.md` files. In `.mdx`, `{{...}}` is a JSX expression and is
> evaluated before the plugin runs — there, import the constants instead:
> `import {branding} from '@site/src/branding'` and write `{branding.productName}`.

**In `docusaurus.config.ts`** — `import {branding} from './src/branding'`.

**In React components** — read `siteConfig.customFields.branding`, typed as
`ClientBranding`. See `src/pages/index.tsx`. Note that `customFields` is
serialised with `JSON.stringify`, so it is populated field by field rather than
by handing over the whole imported object.

## Adding a doc page

1. Decide which product the page belongs to and create a new `.md` file under
   the corresponding source folder, e.g. `desktop/user-guide/my-page.md`.
2. Add frontmatter with `title` and (optionally) `sidebar_position`:

   ```markdown
   ---
   sidebar_position: 5
   title: My Page
   ---
   ```

3. The sidebar is auto-generated from the folder structure, so the new page
   appears automatically. Each section's label and order is set in its
   `_category_.json` file.

Write it according to [`admin/doc-style.md`](admin/doc-style.md), which covers
tone, formatting, and what not to change in existing pages.

## Screenshots for the web docs

> The desktop docs have their own capture script — see [Screenshots for the
> desktop docs](#screenshots-for-the-desktop-docs) below. The two share the
> placeholder syntax and the `--check` / `--embed` machinery.

The pages under `web/` carry screenshot placeholders that look like this:

```html
<!-- shot: search-keyword-results — Standard Search results for a query -->
```

`scripts/capture-screenshots.ts` takes one PNG per placeholder and can then
rewrite the placeholders into real Markdown images. The name before the em dash
matches a `register(...)` call in that script; `--check` enforces the match in
both directions, so a renamed shot or a new placeholder cannot slip through
unnoticed.

```bash
cd bible-website
npm install
npx playwright install chromium     # once

npm run screenshots:check           # do the docs and the script agree?
npm run screenshots                 # capture everything into static/img/web/
npm run screenshots:embed           # rewrite the placeholders into ![]() images
```

Useful flags: `--page=search`, `--shot=search-keyword-results`, `--keep-server`.

**`static/img/web/` is gitignored.** The captures are a few hundred KB each and
would have added ~7 MB to a 23 MB repository, so they are not committed — the
Markdown references them, but the files themselves have to exist before the
site is built. Run `npm run screenshots` as a build step, or capture them once
and keep them wherever the site is deployed from. `npm run screenshots:check`
tells you which placeholders are still waiting on a PNG.

By default the script **starts its own copy of the web app**, from the app
repository's `apps/web`. It has to: the server's default data directory is
that repository's shared `data/`, which is usually empty because `npm run init`
puts the modules under `apps/desktop/data`, and a server started with the
defaults comes up with no Bibles at all. The script finds a directory that really
has a registry and modules, copies the registry into `.screenshot-data/` next to
this repository, writes a `site-config.json` that
switches on every documented feature (Ideas Search, entity cards, offline
downloads), and runs the server against that copy with `NO_AUTH=1`. Your own
data directory is only ever read.

Module visibility comes from that directory's `settings.json` when it has one.
When it does not — and a directory produced by `npm run init` does not — the
script writes a `modules` section listing every installed Bible, commentary and
dictionary from the registry, because a server with no module config lists
none at all.

To shoot against a server you are already running, set `BIBLE_WEB_URL`. If that
server is behind the shared-password gate, the script submits `SITE_PASSWORD`
(default `bible3`) when it sees the login page.

```bash
BIBLE_WEB_URL=http://localhost:3100 SITE_PASSWORD=... npm run screenshots
```

A shot of browser or OS chrome (outside Playwright's reach) can be registered
with `registerManual`, which prints a note instead of capturing; take it by
hand and drop it into `static/img/web/` under the same filename. None are
registered at present.

`--embed` only replaces a placeholder whose PNG actually exists, so the docs
never end up pointing at a missing image.

## Screenshots for the desktop docs

The pages under `desktop/` carry the same placeholders, and
`scripts/capture-desktop-screenshots.ts` fills them by driving the real Electron
application through Playwright. The placeholder syntax, `--check` and `--embed`
are shared with the web script — both use `scripts/lib/placeholders.ts`.

```bash
cd ../bible && npm run build        # THE APP REPOSITORY: builds the app and
                                    # rebuilds its native modules for Electron
cd ../bible-website
npm install

npm run screenshots:desktop:list    # what is registered, and what cannot be shot
npm run screenshots:desktop:check   # do the docs and the script agree?
npm run screenshots:desktop         # capture everything into static/img/desktop/
npm run screenshots:desktop:embed   # rewrite the placeholders into ![]() images
```

Useful flags: `--page=study-tools`, `--shot=bible-reading-parallel-view`,
`--no-annotate`, `--keep-open`.

**Prerequisites are the app's, not the site's.** In the app repository, the
script needs `apps/desktop/out/main/index.js` to exist and
`apps/desktop/data/` to hold `main.db` plus module `.db` files — what
`npm run init` there produces. It checks both before launching anything, because
the failure it is guarding against is 47 shots that all "succeed" and all show an
empty reading area. Electron itself is resolved out of that repository's
`apps/desktop/node_modules`; this one does not depend on it.

**Every shot gets its own Electron process**, launched against a wiped
`userData` (about seven seconds each, so a full run is roughly eight minutes).
The app persists sessions, layout, theme and open tabs, so sharing one process
would leak a shot's second Bible tab or dark theme into every screenshot after
it, and `--shot=` would no longer reproduce what the full run saw.

**Several shots seed their own state** — highlights, a written note, a prayer
list — because the pages document things a fresh install does not have, and a
picture of an empty pane teaches nothing.

### How the pictures are taken

`scripts/lib/capture.ts` does three things a plain `page.screenshot()` does not.

- **A fixed viewport.** The Electron window is a real OS window, so its size and
  device pixel ratio are whatever the machine offers. CDP's
  `Emulation.setDeviceMetricsOverride` pins layout to 1440×900 CSS pixels
  regardless, so the images are the same on any display.
- **2× output.** Playwright's `screenshot()` normalises back to the browser
  context's scale factor, which for Electron is 1. Calling
  `Page.captureScreenshot` over CDP directly keeps the 2×.
- **Callouts.** `drawCallouts()` overlays numbered labels measured from the real
  elements' bounding boxes, so a moved control takes its label with it and a
  removed one fails the shot instead of leaving an arrow pointing at nothing.
  Whole-pane targets get a dashed boundary and a label inside one of their own
  corners; small controls get a ring and a bubble beside them. `--no-annotate`
  turns all of it off.

`composite()` lays several captures out side by side with labels, for the three
shots that ask for a comparison (the display modes, the themes, and the main
window beside a popped-out pane).

### Shots this machine cannot take

`npm run screenshots:desktop:list` marks them, and a run prints why:

| Kind | Meaning |
| --- | --- |
| `manual` | Real UI, outside Playwright's reach — the Windows installer is NSIS, not the app. Shoot it by hand into `static/img/desktop/<name>.png`. |
| `needs-setup` | Real UI needing something this machine lacks: a reachable module repository, or the semantic-search feature pack. Install it and re-run with `--shot=`. |
| `unbuilt` | The docs describe UI the current build does not render. These are documentation bugs, not capture failures. |

**`static/img/desktop/` is gitignored**, on the same reasoning as the web
captures: a few hundred KB each, reproducible from this script, and built at
deploy time rather than committed.

## Project structure

```
admin/
  doc-style.md       How the user docs are written
desktop/             Desktop product user docs (route: /desktop)
  intro.md
  getting-started/
  user-guide/
web/                 Web product user docs (route: /web)
  intro.md
  getting-started/
  user-guide/
src/                 Everything that is site rather than docs: the landing
                     pages, the branding loader, and the Docusaurus overrides
  pages/index.tsx    Marketing landing page
  pages/download.tsx Download page
  components/        React components for those pages
  theme/             Swizzled Docusaurus components: the navbar brand lockup
                     and the system colour-mode icon
  remark/branding.ts Remark plugin substituting {{tokens}} into the docs
  branding.ts        branding.json typed for build-time TypeScript
  productDescriptor.ts  Second line of the brand lockup, derived from the name
  css/custom.css     Site-wide theme variables and overrides
static/img/
  logo.svg           Navbar mark and favicon (copy of the app repository's
                     admin/brand/icon.svg; `npm run branding:diff` checks it)
  logo.png           512px raster of logo.svg, used as the link-preview image
  web/, desktop/     Screenshots (gitignored; see above)
scripts/
  capture-screenshots.ts          Web docs screenshots (drives apps/web)
  capture-desktop-screenshots.ts  Desktop docs screenshots (drives Electron)
  branding-diff.ts                branding.json and logo.svg vs. the app repository's
  lib/app-repo.ts                 Finds the app repository (../bible, $BIBLE_REPO)
branding.json        Product names, domains, URLs (copy of the app repository's
                     admin/brand/branding.json; see above)
docusaurus.config.ts Site config (registers the two docs plugin instances)
sidebars-desktop.ts  Sidebar for the desktop docs plugin
sidebars-web.ts      Sidebar for the web docs plugin
```
