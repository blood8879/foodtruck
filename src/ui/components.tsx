import { MaterialIcons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import { colors, fontSize, fontWeight, radii, shadow, spacing, tabularNums } from "../theme/tokens";

type IconName = keyof typeof MaterialIcons.glyphMap;

export function Icon({
  name,
  size = 20,
  color = colors.ink,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return <MaterialIcons name={name} size={size} color={color} />;
}

export function Card({
  children,
  style,
  dark,
}: {
  children: ReactNode;
  style?: ViewStyle;
  dark?: boolean;
}) {
  return (
    <View style={[styles.card, dark && styles.cardDark, style]}>{children}</View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

export function ScreenTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.titleRow}>
      <Text style={styles.title}>{children}</Text>
      {right}
    </View>
  );
}

type BadgeTone = "accent" | "green" | "gold" | "staff" | "danger" | "neutral";

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  const map: Record<BadgeTone, { bg: string; fg: string }> = {
    accent: { bg: colors.accentSoft, fg: colors.accentPress },
    green: { bg: colors.greenSoft, fg: colors.green },
    gold: { bg: colors.goldSoft, fg: colors.gold },
    staff: { bg: colors.staffSoft, fg: colors.staff },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
    neutral: { bg: colors.surfaceAlt, fg: colors.ink2 },
  };
  const c = map[tone];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.fg }]}>{children}</Text>
    </View>
  );
}

export function LockChip({ label }: { label: string }) {
  return (
    <View style={styles.lockChip}>
      <Icon name="lock" size={13} color={colors.gold} />
      <Text style={styles.lockChipText}>{label}</Text>
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

type ButtonVariant = "accent" | "dark" | "gold" | "ghost" | "danger";

export function AppButton({
  title,
  onPress,
  variant = "accent",
  icon,
  large,
  disabled,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  large?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const bg: Record<ButtonVariant, string> = {
    accent: colors.accent,
    dark: colors.inkPanel,
    gold: colors.gold,
    ghost: colors.surface,
    danger: colors.danger,
  };
  const fg = variant === "ghost" ? colors.ink : colors.white;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!disabled }}
      style={[
        styles.button,
        large && styles.buttonLarge,
        { backgroundColor: bg[variant] },
        variant === "ghost" && styles.buttonGhost,
        variant === "accent" && !disabled && shadow.accentButton,
        disabled && styles.buttonDisabled,
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={large ? 22 : 18} color={fg} /> : null}
      <Text style={[styles.buttonText, large && styles.buttonTextLarge, { color: fg }]}>
        {title}
      </Text>
    </Pressable>
  );
}

export function Toggle({ value, onValueChange }: { value: boolean; onValueChange?: (v: boolean) => void }) {
  return (
    <Pressable
      onPress={() => onValueChange?.(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel="토글"
      style={[styles.toggle, { backgroundColor: value ? colors.accent : colors.knobOff }]}
    >
      <View style={[styles.knob, value ? styles.knobOn : styles.knobOff]} />
    </Pressable>
  );
}

export function QtyStepper({
  qty,
  onDec,
  onInc,
}: {
  qty: number;
  onDec: () => void;
  onInc: () => void;
}) {
  return (
    <View style={styles.stepper}>
      <Pressable
        onPress={onDec}
        accessibilityRole="button"
        accessibilityLabel="수량 감소"
        style={styles.stepBtn}
        hitSlop={6}
      >
        <Icon name="remove" size={18} color={colors.ink} />
      </Pressable>
      <Text style={styles.stepQty}>{qty}</Text>
      <Pressable
        onPress={onInc}
        accessibilityRole="button"
        accessibilityLabel="수량 증가"
        style={styles.stepBtn}
        hitSlop={6}
      >
        <Icon name="add" size={18} color={colors.ink} />
      </Pressable>
    </View>
  );
}

export function MoneyText({
  value,
  size = fontSize.bigNumber,
  color = colors.ink,
  style,
}: {
  value: string;
  size?: number;
  color?: string;
  style?: TextStyle;
}) {
  return (
    <Text style={[{ fontSize: size, fontWeight: fontWeight.heavy, color }, tabularNums, style]}>
      {value}
    </Text>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    ...shadow.card,
  },
  cardDark: { backgroundColor: colors.inkPanel, borderColor: colors.inkPanel },
  divider: { height: 1, backgroundColor: colors.line2 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: fontSize.screenTitle,
    fontWeight: fontWeight.heavy,
    color: colors.ink,
    letterSpacing: -0.5,
  },
  badge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: radii.pill, alignSelf: "flex-start" },
  badgeText: { fontSize: fontSize.micro, fontWeight: fontWeight.bold },
  lockChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.goldSoft,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  lockChipText: { fontSize: fontSize.micro, fontWeight: fontWeight.bold, color: colors.gold },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radii.chip,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipActive: { backgroundColor: colors.inkPanel, borderColor: colors.inkPanel },
  chipText: { fontSize: fontSize.bodySm, fontWeight: fontWeight.bold, color: colors.ink2 },
  chipTextActive: { color: colors.white },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: radii.button,
  },
  buttonLarge: { paddingVertical: 18, borderRadius: radii.buttonLg },
  buttonGhost: { borderWidth: 1, borderColor: colors.line },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { fontSize: fontSize.body, fontWeight: fontWeight.bold },
  buttonTextLarge: { fontSize: 17, fontWeight: fontWeight.heavy },
  toggle: { width: 42, height: 25, borderRadius: radii.toggle, padding: 2, justifyContent: "center" },
  knob: { width: 21, height: 21, borderRadius: 11, backgroundColor: colors.white },
  knobOn: { alignSelf: "flex-end" },
  knobOff: { alignSelf: "flex-start" },
  stepper: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  stepQty: { fontSize: fontSize.body, fontWeight: fontWeight.bold, color: colors.ink, minWidth: 18, textAlign: "center", ...tabularNums },
});
