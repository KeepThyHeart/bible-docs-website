/**
 * Branding constants for the docs/marketing site.
 *
 * Values come from `branding.json` at this repository's root. That file is a
 * copy of the app repository's `branding.json`, which is the source of truth for
 * the product's public names, domains and URLs — the docs site is deployed on
 * its own and cannot reach across to it at build time. Keep the two in step
 * (`npm run branding:diff`). Nothing here should hardcode a product name,
 * domain, or GitHub URL; import from this module instead so that settling a name
 * later is a one-line change.
 *
 * This file is imported by `docusaurus.config.ts` (Node, build time) and by the
 * remark plugin that substitutes `{{token}}` placeholders in Markdown. The
 * values themselves are re-exposed to browser code through
 * `customFields.branding`. Browser code never imports this module -- the one
 * helper it needs lives in `productDescriptor.ts`, which imports no JSON.
 */

import raw from '../branding.json';

export interface Branding {
  /** Full display name, e.g. in page titles and prose. */
  productName: string;
  /** Shorter form for tight spaces (navbar, buttons). */
  productNameShort: string;
  tagline: string;
  /** Reverse-DNS application identifier used by the installers. */
  appId: string;

  /** Production origin of this site, no trailing slash. */
  siteUrl: string;
  /** Path the site is served under, with leading and trailing slash. */
  siteBaseUrl: string;

  githubOrg: string;
  githubRepo: string;
  /** Repository home, derived from org + repo. */
  githubUrl: string;
  /** Issue tracker, derived from githubUrl. */
  issuesUrl: string;

  /** Where users go to get installers. */
  downloadsUrl: string;
  /** Default module catalog the app ships pointed at. */
  moduleRepositoryUrl: string;

  supportEmail: string;

  license: string;
  licenseName: string;
  copyrightHolder: string;

  /** Keys whose values are still provisional. See `npm run branding:check`. */
  undecided: readonly string[];
}

/**
 * The subset of branding handed to browser code through
 * `customFields.branding` in docusaurus.config.ts. Build-only fields such as
 * `undecided` are deliberately not exposed.
 */
export type ClientBranding = Pick<
  Branding,
  | 'productName'
  | 'productNameShort'
  | 'tagline'
  | 'siteUrl'
  | 'githubUrl'
  | 'issuesUrl'
  | 'downloadsUrl'
  | 'moduleRepositoryUrl'
  | 'supportEmail'
  | 'licenseName'
  | 'copyrightHolder'
>;

const githubUrl = `https://github.com/${raw.githubOrg}/${raw.githubRepo}`;

/**
 * Build-time environment, read through `globalThis` rather than a bare
 * `process`. This module is Node-only today, but Docusaurus does not shim
 * `process` in the browser, so anything that pulled it into the client bundle
 * would throw at hydration on a bare reference rather than fall back quietly.
 */
const env: Record<string, string | undefined> =
  (globalThis as {process?: {env?: Record<string, string | undefined>}}).process
    ?.env ?? {};

export const branding: Branding = {
  productName: raw.productName,
  productNameShort: raw.productNameShort,
  tagline: raw.tagline,
  appId: raw.appId,

  // SITE_URL / SITE_BASE_URL let a deploy build for an address that is not the
  // one recorded in branding.json -- a staging host, or the docs domain while
  // `siteUrl` is still provisional. They are read at build time only; the
  // values reach client code via `customFields.branding`, never through this
  // constant.
  siteUrl: env.SITE_URL ?? raw.siteUrl,
  siteBaseUrl: env.SITE_BASE_URL ?? raw.siteBaseUrl,

  githubOrg: raw.githubOrg,
  githubRepo: raw.githubRepo,
  githubUrl,
  issuesUrl: `${githubUrl}/issues`,

  downloadsUrl: raw.downloadsUrl,
  moduleRepositoryUrl: raw.moduleRepositoryUrl,

  supportEmail: raw.supportEmail,

  license: raw.license,
  licenseName: raw.licenseName,
  copyrightHolder: raw.copyrightHolder,

  undecided: raw._undecided,
};

export default branding;
