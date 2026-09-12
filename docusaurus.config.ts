import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import {branding} from './src/branding';
import remarkBranding from './src/remark/branding';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

// Names, domains, and URLs all come from `branding.json` at this repository's
// root, a copy of the app repository's file of the same name (see
// `src/branding.ts`). Several values are still provisional — `npm run
// branding:check` in the app repository lists which. Never hardcode them here or
// in a docs page; use the constant, or the `{{token}}` placeholders the remark
// plugin substitutes.
const config: Config = {
  title: branding.productName,
  tagline: branding.tagline,
  favicon: 'img/logo.svg',

  future: {
    v4: true,
  },

  url: branding.siteUrl,
  baseUrl: branding.siteBaseUrl,

  organizationName: branding.githubOrg,
  projectName: branding.githubRepo,

  // Exposes the constants to browser-side code (see src/pages/index.tsx),
  // which cannot read branding.json directly.
  //
  // Spelled out field by field on purpose. Docusaurus serialises customFields
  // with JSON.stringify to generate its client config, and handing it the
  // imported module object trips a "circular structure" error under its config
  // loader. A fresh plain literal also keeps build-only concerns (the
  // `undecided` list) out of the client bundle.
  customFields: {
    branding: {
      productName: branding.productName,
      productNameShort: branding.productNameShort,
      tagline: branding.tagline,
      siteUrl: branding.siteUrl,
      githubUrl: branding.githubUrl,
      issuesUrl: branding.issuesUrl,
      downloadsUrl: branding.downloadsUrl,
      moduleRepositoryUrl: branding.moduleRepositoryUrl,
      supportEmail: branding.supportEmail,
      licenseName: branding.licenseName,
      copyrightHolder: branding.copyrightHolder,
    },
  },

  onBrokenLinks: 'throw',
  markdown: {
    // Parse .md as plain CommonMark and .mdx as MDX. This keeps angle-bracket
    // placeholders in prose and code samples (e.g. `<module-id>`) from being
    // interpreted as JSX. Use .mdx for any page that needs JSX.
    format: 'detect',
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        // The default docs plugin is disabled — desktop and web are each
        // registered as their own plugin instance below so that they get
        // separate URL roots, sidebars, and breadcrumbs.
        docs: false,
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  plugins: [
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'desktop',
        path: 'desktop',
        routeBasePath: 'desktop',
        sidebarPath: './sidebars-desktop.ts',
        beforeDefaultRemarkPlugins: [remarkBranding],
      },
    ],
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'web',
        path: 'web',
        routeBasePath: 'web',
        sidebarPath: './sidebars-web.ts',
        beforeDefaultRemarkPlugins: [remarkBranding],
      },
    ],
  ],

  themeConfig: {
    // The link-preview image (Open Graph / Twitter card). The product mark
    // rather than a composed card: it is generated from `img/logo.svg`, so it
    // cannot drift from the icon the apps ship. Square, which the summary-card
    // layouts render as-is and the wide layouts letterbox.
    image: 'img/logo.png',
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      // No `title` on purpose. The brand lockup — the product name stacked
      // over its "Bible Reader" descriptor — lives in the swizzled
      // `src/theme/Navbar/Logo`, which owns both the image and the text.
      logo: {
        alt: `${branding.productName} logo`,
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          docsPluginId: 'desktop',
          sidebarId: 'desktopSidebar',
          position: 'left',
          label: 'Desktop',
        },
        {
          type: 'docSidebar',
          docsPluginId: 'web',
          sidebarId: 'webSidebar',
          position: 'left',
          label: 'Web',
        },
        {to: '/download', label: 'Download', position: 'right'},
        {
          href: branding.githubUrl,
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Desktop',
          items: [
            {label: 'Overview', to: '/desktop'},
            {label: 'Installation', to: '/desktop/getting-started/installation'},
            {label: 'Quick Start', to: '/desktop/getting-started/quick-start'},
          ],
        },
        {
          title: 'Web',
          items: [
            {label: 'Overview', to: '/web'},
            {label: 'Sign In', to: '/web/getting-started/installation'},
            {label: 'Quick Start', to: '/web/getting-started/quick-start'},
          ],
        },
        {
          title: 'Project',
          items: [
            {label: 'GitHub', href: branding.githubUrl},
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} ${branding.copyrightHolder}. Licensed under the ${branding.licenseName}.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
