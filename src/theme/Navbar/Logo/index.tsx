import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import {useThemeConfig} from '@docusaurus/theme-common';
import type {ClientBranding} from '@site/src/branding';
import {productDescriptor} from '@site/src/productDescriptor';

import styles from './styles.module.css';

/**
 * The navbar brand lockup.
 *
 * Swizzled from `@docusaurus/theme-classic`, whose `Navbar/Logo` renders
 * `navbar.title` as a single bold run of text. The product is called "Keep Thy
 * Heart Bible Reader", which on one line either overruns the navbar or gets
 * truncated to the point of saying nothing; setting `navbar.title` to the short
 * name alone drops "Bible Reader" and leaves visitors to guess what the site
 * is. Stacking the two — name over descriptor — says the whole name in the
 * width of the short one. This is the same lockup the web app's own header
 * uses (`apps/web/src/components/Header.tsx`).
 *
 * `navbar__brand` and `navbar__logo` are kept on the link and the image so that
 * Infima's navbar rules and Docusaurus's mobile sidebar keep styling this the
 * way they style the stock component.
 */
export default function NavbarLogo(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  const {
    navbar: {logo},
  } = useThemeConfig();
  const branding = siteConfig.customFields!.branding as ClientBranding;

  const logoLink = useBaseUrl(logo?.href ?? '/');
  const logoSrc = useBaseUrl(logo?.src ?? 'img/logo.svg');
  const descriptor = productDescriptor(branding);

  return (
    <Link to={logoLink} className="navbar__brand">
      <div className="navbar__logo">
        <img src={logoSrc} alt={logo?.alt ?? ''} className={logo?.className} />
      </div>
      <div className={styles.wordmark}>
        <b className={styles.wordmarkName}>{branding.productNameShort}</b>
        {/* Suppressed when the descriptor collapses to the whole product name,
            which is what `productDescriptor` returns if the full name ever
            stops starting with the short one — better a single line than the
            name printed twice. */}
        {descriptor !== branding.productName && (
          <span className={styles.wordmarkDescriptor}>{descriptor}</span>
        )}
      </div>
    </Link>
  );
}
