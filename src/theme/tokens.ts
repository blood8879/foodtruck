/**
 * Design tokens — mirrors design_handoff_foodtruck_pos/README.md.
 * Single source of truth for colors, typography, spacing, radii, shadows.
 */

export const colors = {
  bg: "#F6F2EC", // app/screen background (warm off-white)
  surface: "#FFFFFF", // card / sheet surface
  surfaceAlt: "#F1ECE4", // disabled / input background
  ink: "#2B2521", // primary text
  ink2: "#6B6259", // secondary text
  muted: "#9B928A", // labels / captions
  muted2: "#B0A89E", // disabled icon / text
  line: "#ECE6DE", // card border
  line2: "#F1ECE4", // list divider
  accent: "#E85D3A", // primary action / active tab / emphasis number
  accentSoft: "#FCE9E1", // accent tint background
  accentPress: "#C7401C", // accent dark text
  inkPanel: "#15110E", // dark card / sidebar / bezel
  gold: "#C2912E", // paid / lock indicator
  goldSoft: "#F4EAD2", // paid badge tint
  goldSoftAlt: "#FCEFD9",
  green: "#2F9E6B", // net profit / online / ok
  greenSoft: "#E7F4EC", // success tint
  greenSoftAlt: "#EEF4F0",
  danger: "#C9443B", // cancelled
  dangerSoft: "#F7E0DE", // cancelled badge tint
  staff: "#6A5594", // staff role badge
  staffSoft: "#EDE7F2",
  // chart secondary / gauge
  chart1: "#D9B68E",
  chart2: "#E8C9A0",
  chart3: "#EBBF9A",
  chart4: "#E8884F",
  white: "#FFFFFF",
  knobOff: "#D9D2C8",
  adBezel: "#241D18", // ad creative bezel fill
  adBezelBorder: "#322A23", // ad creative bezel border
  adSkipBg: "rgba(255,255,255,0.14)", // ad skip button background
} as const;

export type ColorToken = keyof typeof colors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radii = {
  card: 18,
  cardSm: 16,
  input: 12,
  chip: 12,
  button: 16,
  buttonLg: 18,
  toggle: 14,
  pill: 999,
} as const;

export const fontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
  heavy: "800",
} as const;

/** Type scale (mobile). */
export const fontSize = {
  screenTitle: 22,
  bigNumber: 26,
  bigNumberSm: 19,
  body: 15,
  bodySm: 14,
  label: 13,
  caption: 12,
  micro: 11,
} as const;

export const shadow = {
  accentButton: {
    shadowColor: colors.accent,
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 9 },
    elevation: 6,
  },
  sheet: {
    shadowColor: colors.inkPanel,
    shadowOpacity: 0.1,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: -10 },
    elevation: 12,
  },
  card: {
    shadowColor: colors.inkPanel,
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
} as const;

/**
 * Pretendard is the target Korean UI font. We register it at runtime where
 * available and fall back to the system font otherwise.
 */
export const fontFamily = {
  base: "Pretendard",
} as const;

/** tabular-nums style for aligned numerals. */
export const tabularNums = { fontVariant: ["tabular-nums" as const] };
