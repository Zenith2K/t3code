import type { CSSProperties } from "react";

/** Row sizing shared by every Pierre file tree: roomy rows that fit 13px names. */
export const PIERRE_TREE_LAYOUT = { density: "default", itemHeight: 28 } as const;

/** Shadow-root overrides that make a Pierre file tree read as part of the app chrome. */
export const PIERRE_TREE_UNSAFE_CSS = `
  :host {
    --trees-bg-override: transparent;
    --trees-selected-bg-override: color-mix(in srgb, currentColor 12%, transparent);
    --trees-hover-bg-override: color-mix(in srgb, currentColor 7%, transparent);
    --trees-border-color-override: color-mix(in srgb, currentColor 14%, transparent);
    --trees-font-family-override: var(--font-sans);
    --trees-font-size-override: 0.8125rem;
    /* Tight left edge: rows start 4px in, their content 6px further. */
    --trees-padding-inline-override: 4px;
    --trees-item-padding-x-override: 6px;
    --trees-icon-width-override: 14px;
    /* Pierre indents a level by row gap + half an icon + level gap. A negative level
       gap brings that to 10px while indent guides stay under the parent chevron. */
    --trees-level-gap-override: calc(
      10px + 0.5px - var(--trees-icon-width) / 2 - var(--trees-item-row-gap)
    );
  }
  button[data-type='item'], button[data-type='item']::before { border-radius: var(--radius-md); }
  /* Pierre draws every icon at 16px; fit file icons to the 14px slot and shrink chevrons. */
  [data-item-section='icon'] > svg { width: 14px; height: 14px; }
  [data-item-section='icon'] > svg[data-icon-name='file-tree-icon-chevron'] { width: 11px; height: 11px; }
  svg[data-icon-name='t3-tree-icon-loading'] { opacity: 0.6; }
  @media (prefers-reduced-motion: no-preference) {
    svg[data-icon-name='t3-tree-icon-loading'] { animation: t3-tree-spin 1s linear infinite; }
  }
  @keyframes t3-tree-spin { to { transform: rotate(360deg); } }
`;

/** Host styles that keep a Pierre tree on the active color scheme and foreground. */
export function pierreTreeStyle(colorScheme: "light" | "dark"): CSSProperties {
  return {
    colorScheme,
    ["--trees-fg-override" as string]: "var(--contrast-foreground)",
  };
}
