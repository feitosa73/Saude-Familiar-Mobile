/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#19322c',
    tint: '#1f6b5b',

    // Core surfaces
    background: '#f5f8f6',
    foreground: '#19322c',

    // Cards / elevated surfaces
    card: '#ffffff',
    cardForeground: '#19322c',

    // Primary action color (buttons, links, active states)
    primary: '#1f6b5b',
    primaryForeground: '#ffffff',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#e5f0eb',
    secondaryForeground: '#1f564a',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#edf3f0',
    mutedForeground: '#61746c',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#f6e4df',
    accentForeground: '#8d4f43',

    // Destructive actions (delete, error states)
    destructive: '#b94a45',
    destructiveForeground: '#ffffff',

    // Borders and input outlines
    border: '#d7e5df',
    input: '#c6d9d1',
  },

  dark: {
    text: '#edf7f2',
    tint: '#83c8b4',
    background: '#10231f',
    foreground: '#edf7f2',
    card: '#18342d',
    cardForeground: '#edf7f2',
    primary: '#83c8b4',
    primaryForeground: '#10231f',
    secondary: '#24483d',
    secondaryForeground: '#dff4eb',
    muted: '#1b3a31',
    mutedForeground: '#a7c2b8',
    accent: '#5a3934',
    accentForeground: '#ffd9cf',
    destructive: '#f08b80',
    destructiveForeground: '#35100d',
    border: '#2c5145',
    input: '#3a6356',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 18,
};

export default colors;
