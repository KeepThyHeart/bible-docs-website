import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import Heading from '@theme/Heading';
import type {ClientBranding} from '@site/src/branding';
import {productDescriptor} from '@site/src/productDescriptor';

import styles from './index.module.css';

/**
 * Branding constants, passed through `customFields` in docusaurus.config.ts.
 * Browser code cannot read branding.json directly, so it comes through config.
 */
function useBranding(): ClientBranding {
  const {siteConfig} = useDocusaurusContext();
  return siteConfig.customFields!.branding as ClientBranding;
}

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  const branding = useBranding();
  const descriptor = productDescriptor(branding);
  const stacked = descriptor !== branding.productName;
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        {/* Same lockup as the navbar and the web app's header: the short name
            carries the heading, with the rest of the product name stacked
            beneath it as a descriptor. On one line "Keep Thy Heart Bible
            Reader" reads as a run-on phrase and wraps unpredictably at hero
            type sizes. When the two names do not nest, `productDescriptor`
            hands back the whole product name and the heading stays one line. */}
        <Heading as="h1" className="hero__title">
          {stacked ? branding.productNameShort : branding.productName}
          {stacked && (
            <span className={styles.heroDescriptor}>{descriptor}</span>
          )}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link
            className="button button--secondary button--lg"
            to="/desktop">
            Desktop App
          </Link>
          <Link
            className="button button--secondary button--lg"
            style={{marginLeft: '1rem'}}
            to="/web">
            Web App
          </Link>
          <Link
            className="button button--outline button--secondary button--lg"
            style={{marginLeft: '1rem'}}
            href={branding.githubUrl}>
            View on GitHub
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={siteConfig.title}
      description={siteConfig.tagline}>
      <HomepageHeader />
      <main>
        <HomepageFeatures />
      </main>
    </Layout>
  );
}
