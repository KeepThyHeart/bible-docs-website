import type {ReactNode} from 'react';
import {useEffect, useState} from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import type {ClientBranding} from '@site/src/branding';

import styles from './download.module.css';

/**
 * Download page.
 *
 * Deliberately links to the GitHub release rather than hosting installers on
 * this site. The release workflow already publishes them there with a
 * `SHA256SUMS` manifest and a Sigstore build-provenance attestation, and that
 * attestation verifies against the repository — serving the same bytes from a
 * second origin would break the chain a careful user follows.
 *
 * The OS guess is a convenience only. Every platform stays visible and
 * reachable, because a wrong guess must never hide the download someone needs.
 */

type Platform = 'windows' | 'macos' | 'linux' | 'unknown';

function useBranding(): ClientBranding {
  const {siteConfig} = useDocusaurusContext();
  return siteConfig.customFields!.branding as ClientBranding;
}

/**
 * `owner/repo` for the `gh attestation verify` example.
 *
 * Derived from `githubUrl` because `ClientBranding` deliberately does not expose
 * `githubOrg`/`githubRepo` separately to browser code.
 */
function repoSlug(branding: ClientBranding): string {
  return branding.githubUrl.replace(/^https:\/\/github\.com\//, '');
}

/**
 * Best-effort platform guess from the user agent. Runs in an effect, never
 * during render: Docusaurus prerenders these pages in Node, where `navigator`
 * does not exist, and a value read during SSR would be baked into the static
 * HTML and served to everyone.
 */
function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return 'windows';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macos';
  if (/Linux|X11/i.test(ua)) return 'linux';
  return 'unknown';
}

interface PlatformCard {
  id: Platform;
  name: string;
  file: string;
  note: ReactNode;
}

const PLATFORMS: PlatformCard[] = [
  {
    id: 'windows',
    name: 'Windows',
    file: 'Setup .exe (64-bit)',
    note: (
      <>
        Installs for the current user, so no administrator prompt is needed. The
        beta is not yet code-signed, so Windows SmartScreen will warn you the
        first time — choose <strong>More info → Run anyway</strong>, and verify
        the checksum below if you would like to be certain of what you have.
      </>
    ),
  },
  {
    id: 'macos',
    name: 'macOS',
    file: '.dmg (Apple silicon and Intel)',
    note: (
      <>
        The beta is not yet signed or notarized, so macOS will refuse to open it
        on the first attempt. Right-click the app and choose{' '}
        <strong>Open</strong>, then confirm. Signed builds are planned before
        1.0, after which this step goes away.
      </>
    ),
  },
  {
    id: 'linux',
    name: 'Linux',
    file: '.AppImage or .deb',
    note: (
      <>
        The <code>.deb</code> upgrades in place and keeps your notes, modules and
        settings, which live in <code>~/.config</code> and are never touched by
        the package. Install it with{' '}
        <code>sudo apt install ./&lt;file&gt;.deb</code> so dependencies resolve.
        The AppImage needs no installation — mark it executable and run it.
      </>
    ),
  },
];

function PlatformSection({
  platform,
  branding,
  highlighted,
}: {
  platform: PlatformCard;
  branding: ClientBranding;
  highlighted: boolean;
}) {
  return (
    <div className={highlighted ? styles.cardHighlighted : styles.card}>
      <Heading as="h3">{platform.name}</Heading>
      <p className={styles.file}>{platform.file}</p>
      <Link
        className="button button--primary"
        href={branding.downloadsUrl}>
        Download for {platform.name}
      </Link>
      <p className={styles.note}>{platform.note}</p>
    </div>
  );
}

export default function Download(): ReactNode {
  const branding = useBranding();
  const [platform, setPlatform] = useState<Platform>('unknown');

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  return (
    <Layout
      title="Download"
      description={`Download ${branding.productName} for Windows, macOS, and Linux.`}>
      <main className="container margin-vert--lg">
        <Heading as="h1">Download {branding.productName}</Heading>
        <p className={styles.lead}>
          Free and open source under the {branding.licenseName}. The app works
          fully offline — it asks before it contacts the internet for anything,
          and that permission is off until you turn it on.
        </p>

        <div className={styles.grid}>
          {PLATFORMS.map((p) => (
            <PlatformSection
              key={p.id}
              platform={p}
              branding={branding}
              highlighted={p.id === platform}
            />
          ))}
        </div>

        <Heading as="h2">Getting started</Heading>
        <p>
          The installer includes enough to study offline straight away: the King
          James Version, Matthew Henry's commentary, a synthesis commentary,
          Strong's Greek and Hebrew lexicons, ISBE, Nave's and Torrey's topical
          indexes, and the Treasury of Scripture Knowledge.
        </p>
        <p>
          On first launch the app asks which language you read in and offers
          matching study content. Everything beyond the bundled set — additional
          translations, more commentaries, and meaning-based semantic search — is
          optional and downloaded only when you ask for it. Downloading anything
          requires turning on <strong>Allow web requests</strong>, which the app
          will prompt you for.
        </p>

        <Heading as="h2">Verifying your download</Heading>
        <p>
          Each release ships a <code>SHA256SUMS</code> file and a Sigstore
          build-provenance attestation that ties the installer to the exact
          public commit it was built from. Neither depends on trusting this
          website.
        </p>
        <pre>
          <code>
            {'# Linux / macOS / Git Bash\n'}
            {'sha256sum -c SHA256SUMS\n\n'}
            {'# Windows PowerShell\n'}
            {'Get-FileHash <file> -Algorithm SHA256\n\n'}
            {'# Build provenance (requires the GitHub CLI)\n'}
            {`gh attestation verify <file> --repo ${repoSlug(branding)}\n`}
          </code>
        </pre>
        <p>
          <Link href={`${branding.githubUrl}/blob/main/docs/ReleaseVerification.md`}>
            More on how releases are built and verified
          </Link>
        </p>
      </main>
    </Layout>
  );
}
