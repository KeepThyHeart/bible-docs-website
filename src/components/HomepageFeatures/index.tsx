import type {ReactNode} from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

/**
 * The three cards under the hero.
 *
 * The icons are inline SVG rather than the `undraw_docusaurus_*.svg`
 * illustrations the template ships with. Those are pleasant drawings of
 * dinosaurs and trees that say nothing about a Bible reader, and they carry
 * Docusaurus's own green whatever the site palette is set to. Drawn here in
 * `currentColor` on a 24-unit grid, each icon takes the site's primary colour
 * and follows the light and dark themes without a second asset.
 */

type FeatureItem = {
  title: string;
  Icon: () => ReactNode;
  description: ReactNode;
};

/** Shared frame: one stroke weight and one grid for all three icons. */
function Glyph({children}: {children: ReactNode}): ReactNode {
  return (
    <svg
      className={styles.featureIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-hidden="true">
      {children}
    </svg>
  );
}

const FeatureList: FeatureItem[] = [
  {
    title: 'Bible-Centric',
    // An open book with a ribbon marker.
    Icon: () => (
      <Glyph>
        <path d="M12 6.4C10.3 5.1 8.2 4.5 5.6 4.5H3.4v13h2.2c2.6 0 4.7.6 6.4 1.9" />
        <path d="M12 6.4c1.7-1.3 3.8-1.9 6.4-1.9h2.2v13h-2.2c-2.6 0-4.7.6-6.4 1.9" />
        <path d="M12 6.4v13" />
        <path d="M15.6 4.8v5l1.7-1.2 1.7 1.2v-5" />
      </Glyph>
    ),
    description: (
      <>
        The Bible text is the visual anchor of every layout. Study tools support
        reading rather than competing with it.
      </>
    ),
  },
  {
    title: 'Cross-Platform',
    // A desktop display with a phone standing beside it.
    Icon: () => (
      <Glyph>
        <rect x="2.5" y="4.5" width="13" height="9.5" rx="1.5" />
        <path d="M6.5 19.5h5" />
        <path d="M9 14v5.5" />
        <rect x="17" y="9.5" width="4.5" height="10" rx="1.2" />
        <path d="M18.9 17.6h.7" />
      </Glyph>
    ),
    description: (
      <>
        One feature set, two builds: a native desktop app for Windows, macOS, and
        Linux, plus a web app you can use anywhere.
      </>
    ),
  },
  {
    title: 'Open Source',
    // Angle brackets around a slash — the plainest "this is source" mark.
    Icon: () => (
      <Glyph>
        <path d="M8.2 7.5 3.5 12l4.7 4.5" />
        <path d="M15.8 7.5 20.5 12l-4.7 4.5" />
        <path d="M13.4 5.5l-2.8 13" />
      </Glyph>
    ),
    description: (
      <>
        Free and open source, with a clean data model, a plugin-friendly
        architecture, and no vendor lock-in for your notes.
      </>
    ),
  },
];

function Feature({title, Icon, description}: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        <span className={styles.featureIconWrap}>
          <Icon />
        </span>
      </div>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
