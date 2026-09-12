/**
 * Remark plugin: substitute `{{token}}` placeholders in Markdown with values
 * from the shared branding constants.
 *
 * Docs pages should never hardcode the product name, a domain, or a GitHub URL.
 * Write `{{productName}}` / `{{downloadsUrl}}` instead and this plugin fills it
 * in at build time, so settling a name later means editing `branding.json` only.
 *
 * Supported tokens are the keys of the `Branding` object — `productName`,
 * `productNameShort`, `tagline`, `appId`, `siteUrl`, `githubUrl`, `issuesUrl`,
 * `downloadsUrl`, `moduleRepositoryUrl`, `supportEmail`, `licenseName`, and so
 * on. See `src/branding.ts`.
 *
 * Substitution applies to prose, inline code, fenced code blocks, and link and
 * image URLs — so a download link can be written as
 * `[Download]({{downloadsUrl}})`.
 *
 * Note: this targets `.md` files, which the site parses as plain CommonMark
 * (see `markdown.format: 'detect'` in docusaurus.config.ts). In a `.mdx` file
 * `{{...}}` is a JSX expression and would be evaluated before this plugin ever
 * sees it — in MDX, import `branding` from `@site/src/branding` and use
 * `{branding.productName}` instead.
 *
 * An unknown token is left untouched rather than silently blanked, so a typo
 * shows up as a literal `{{typo}}` on the page instead of disappearing.
 */

import type {Transformer} from 'unified';
import type {Node, Parent} from 'unist';
import {branding} from '../branding';

/** Nodes whose `value` holds user-authored text. */
const VALUE_NODES = new Set(['text', 'inlineCode', 'code']);
/** Nodes whose `url` holds a user-authored destination. */
const URL_NODES = new Set(['link', 'image', 'definition']);

const TOKEN_PATTERN = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g;

const replacements: Record<string, string> = Object.fromEntries(
  Object.entries(branding)
    .filter(([, value]) => typeof value === 'string')
    .map(([key, value]) => [key, value as string]),
);

function substitute(input: string): string {
  return input.replace(TOKEN_PATTERN, (original, token: string) =>
    // Leave unrecognised tokens alone so typos are visible, not invisible.
    Object.hasOwn(replacements, token) ? replacements[token]! : original,
  );
}

interface ValueNode extends Node {
  value: string;
}

interface UrlNode extends Node {
  url: string;
}

function visit(node: Node): void {
  if (VALUE_NODES.has(node.type)) {
    const valueNode = node as ValueNode;
    if (typeof valueNode.value === 'string') {
      valueNode.value = substitute(valueNode.value);
    }
  }

  if (URL_NODES.has(node.type)) {
    const urlNode = node as UrlNode;
    if (typeof urlNode.url === 'string') {
      urlNode.url = substitute(urlNode.url);
    }
  }

  const children = (node as Parent).children;
  if (Array.isArray(children)) {
    for (const child of children) {
      visit(child);
    }
  }
}

export default function remarkBranding(): Transformer {
  return (tree: Node) => {
    visit(tree);
  };
}
