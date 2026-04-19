"use client";

/**
 * Terminal-paste hero animation.
 *
 * Square (1:1) block intended to sit next to the landing-page H1. A 10s loop:
 *   $ linky < session-urls.txt
 *   → reading 8 URLs
 *   · github.com/... (×8, streamed)
 *   ✓ bundled 8 URLs · short link:
 *   [ getalinky.com/l/s4nxq2 ]   ← holds on the highlighted result
 *
 * Design system:
 *   - Monochrome: ink/paper/mute/line only (no gradients, no hues).
 *   - IBM Plex Mono throughout (display face not used in the hero).
 *   - Square caps, hairline borders, zero radius.
 *   - Scanline scrim baked at 0.024 opacity to match other terminal surfaces.
 *   - `prefers-reduced-motion`: loop disabled, final frame shown statically.
 *
 * Usage:
 *   <HeroTerminal />
 *
 * All timing is scoped via a local animation-name prefix so this can be
 * dropped alongside other animated components without keyframe collisions.
 */

import styles from "./hero-terminal.module.css";

type UrlEntry = { host: string };

const DEFAULT_URLS: UrlEntry[] = [
  { host: "github.com/linky/pr/482" },
  { host: "linear.app/LIN-3041" },
  { host: "notion.so/launch-plan-v3" },
  { host: "figma.com/file/hero" },
  { host: "vercel.com/deploy" },
  { host: "neon.tech/console" },
  { host: "sentry.io/issues" },
  { host: "stripe.com/dashboard" },
];

export function HeroTerminal({
  urls = DEFAULT_URLS,
  shortLink = "getalinky.com/l/s4nxq2",
  showFootline = true,
}: {
  urls?: UrlEntry[];
  shortLink?: string;
  showFootline?: boolean;
}) {
  return (
    <div
      className={styles.hero}
      role="img"
      aria-label={`Terminal demo: bundling ${urls.length} URLs into ${shortLink}`}
    >
      <div className={styles.progress} aria-hidden />
      <span className={`${styles.crosshair} ${styles.tl}`} aria-hidden />
      <span className={`${styles.crosshair} ${styles.tr}`} aria-hidden />
      <span className={`${styles.crosshair} ${styles.bl}`} aria-hidden />
      <span className={`${styles.crosshair} ${styles.br}`} aria-hidden />

      <div className={styles.term}>
        <div className={styles.termHeader}>
          <span className={styles.title}>
            <span className={styles.headerDot} aria-hidden />
            zsh · linky
          </span>
          <span>~/session</span>
        </div>

        <div className={styles.lines}>
          <div className={`${styles.line} ${styles.lCmd}`}>
            <span className={styles.prompt}>$</span>
            <span className={styles.typed}>linky &lt; session-urls.txt</span>
            <span className={styles.caret} aria-hidden />
          </div>
          <div className={`${styles.line} ${styles.lRead}`}>
            <span className={styles.arrow}>→</span>
            <span className={styles.hint}>reading {urls.length} URLs</span>
          </div>
          {urls.slice(0, 8).map((u, i) => (
            <div
              key={u.host}
              className={`${styles.line} ${styles[`lU${i + 1}` as keyof typeof styles]}`}
            >
              <span className={styles.arrow}>·</span>
              <span className={styles.val}>{u.host}</span>
            </div>
          ))}
          <div className={`${styles.line} ${styles.lBundle}`}>
            <span className={styles.ok}>✓</span>
            <span className={styles.hint}>
              bundled {urls.length} URLs · short link:
            </span>
          </div>
          <div className={`${styles.line} ${styles.lResult}`}>
            <span className={styles.resultBox}>
              <span className={styles.typed}>{shortLink}</span>
            </span>
            <span className={styles.pointer}>
              <span className={styles.tick} aria-hidden />
              SHARE
            </span>
          </div>
        </div>
      </div>

      {showFootline && (
        <div className={styles.footline}>
          <span>MADE WITH LINKY</span>
          <span>10s LOOP</span>
        </div>
      )}
    </div>
  );
}
