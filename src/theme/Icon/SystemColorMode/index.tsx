import React, {type ComponentProps, type ReactNode} from 'react';

/**
 * The navbar's colour-mode button, in its default ("follow the system") state.
 *
 * Swizzled from `@docusaurus/theme-classic`. The stock icon is a circle whose
 * right half is filled solid, which at 24px reads as a half-eaten disc rather
 * than as anything to do with light and dark — and it is the icon almost every
 * visitor sees, because "system" is where the toggle starts.
 *
 * A display glyph says the same thing plainly: the site is taking its cue from
 * the machine. Clicking through still gives the theme's own sun and moon for
 * the two explicit choices, which are left alone.
 *
 * Drawn on the same 24×24 grid and in `currentColor`, so it inherits the
 * navbar's colour and the button's hover treatment like the icons beside it.
 */
export default function IconSystemColorMode(
  props: ComponentProps<'svg'>,
): ReactNode {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} {...props}>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round">
        <rect x="2.75" y="4" width="18.5" height="12.5" rx="1.75" />
        <path d="M8.5 20.25h7" />
        <path d="M12 16.5v3.75" />
      </g>
    </svg>
  );
}
