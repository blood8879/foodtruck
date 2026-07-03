import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppData } from "../data/AppData";
import { AppButton, Card, Icon } from "../ui/components";
import { colors, fontSize, fontWeight, radii, spacing, tabularNums } from "../theme/tokens";
import { activePlans, dateKey } from "../core";
import type { PlanView } from "../core/types";

const TZ_KST = 540;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

// --- 순수 달력 계산 (KST 이슈 없음: 오늘 키 비교에만 dateKey 사용) ------------

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** y년 m월(0-indexed) d일을 "YYYY-MM-DD" 키로. */
function makeDateStr(y: number, m: number, d: number): string {
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}

export interface MonthCell {
  day: number;
  dateStr: string;
}

/**
 * y년 m월(0-indexed)의 달력 셀 배열. 첫 주 앞의 빈 칸은 null,
 * 이후 1일~말일까지 채운다. 7의 배수가 되도록 뒤도 null로 채운다.
 */
export function buildMonthGrid(y: number, m: number): (MonthCell | null)[] {
  const firstWeekday = new Date(y, m, 1).getDay(); // 0=일 ~ 6=토 (요일만 사용)
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells: (MonthCell | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, dateStr: makeDateStr(y, m, d) });
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** 활성 계획을 날짜별로 묶는다. */
export function groupPlansByDate(plans: PlanView[]): Map<string, PlanView[]> {
  const map = new Map<string, PlanView[]>();
  for (const p of plans) {
    const arr = map.get(p.date);
    if (arr) arr.push(p);
    else map.set(p.date, [p]);
  }
  return map;
}

function formatKoreanDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map((s) => Number(s));
  const weekday = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return `${y}년 ${m}월 ${d}일 (${weekday})`;
}

// --- 화면 ------------------------------------------------------------------

export default function ScheduleScreen() {
  const { plans, addPlan, removePlan } = useAppData();

  const todayKey = useMemo(() => dateKey(Date.now(), TZ_KST), []);
  const active = useMemo(() => activePlans(plans), [plans]);
  const byDate = useMemo(() => groupPlansByDate(active), [active]);

  // 표시 중인 달 (오늘이 속한 달로 시작).
  const [year, setYear] = useState(() => Number(todayKey.slice(0, 4)));
  const [month, setMonth] = useState(() => Number(todayKey.slice(5, 7)) - 1); // 0-indexed
  const [selected, setSelected] = useState<string>(todayKey);

  // 추가 폼 상태.
  const [location, setLocation] = useState("");
  const [memo, setMemo] = useState("");

  const cells = useMemo(() => buildMonthGrid(year, month), [year, month]);

  const upcoming = useMemo(
    () => active.filter((p) => p.date >= todayKey).slice(0, 5),
    [active, todayKey],
  );

  const selectedPlans = byDate.get(selected) ?? [];

  function goPrevMonth() {
    if (month === 0) {
      setYear((y) => y - 1);
      setMonth(11);
    } else {
      setMonth((m) => m - 1);
    }
  }
  function goNextMonth() {
    if (month === 11) {
      setYear((y) => y + 1);
      setMonth(0);
    } else {
      setMonth((m) => m + 1);
    }
  }

  function submit() {
    const loc = location.trim();
    const mm = memo.trim();
    if (!loc && !mm) return; // 장소·메모 둘 다 비면 추가하지 않음
    addPlan({ date: selected, locationTag: loc || undefined, memo: mm || undefined });
    setLocation("");
    setMemo("");
  }

  function confirmRemove(plan: PlanView) {
    const label = plan.locationTag || plan.memo || "이 일정";
    Alert.alert("일정 삭제", `"${label}" 일정을 삭제할까요?`, [
      { text: "취소", style: "cancel" },
      { text: "삭제", style: "destructive", onPress: () => removePlan(plan.planId) },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Icon name="arrow-back-ios-new" size={20} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>영업 일정</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* 월 네비게이션 */}
        <Card style={styles.calCard}>
          <View style={styles.monthNav}>
            <Pressable onPress={goPrevMonth} hitSlop={10} style={styles.navBtn}>
              <Icon name="chevron-left" size={24} color={colors.ink} />
            </Pressable>
            <Text style={styles.monthLabel}>
              {year}년 {month + 1}월
            </Text>
            <Pressable onPress={goNextMonth} hitSlop={10} style={styles.navBtn}>
              <Icon name="chevron-right" size={24} color={colors.ink} />
            </Pressable>
          </View>

          {/* 요일 헤더 */}
          <View style={styles.weekRow}>
            {WEEKDAYS.map((w, i) => (
              <View key={w} style={styles.weekCell}>
                <Text
                  style={[
                    styles.weekText,
                    i === 0 && styles.sunText,
                    i === 6 && styles.satText,
                  ]}
                >
                  {w}
                </Text>
              </View>
            ))}
          </View>

          {/* 날짜 그리드 */}
          <View style={styles.grid}>
            {cells.map((cell, idx) => {
              if (!cell) return <View key={`blank-${idx}`} style={styles.dayCell} />;
              const isToday = cell.dateStr === todayKey;
              const isSelected = cell.dateStr === selected;
              const isPast = cell.dateStr < todayKey;
              const hasPlan = byDate.has(cell.dateStr);
              const weekdayIdx = idx % 7;
              return (
                <Pressable
                  key={cell.dateStr}
                  style={styles.dayCell}
                  onPress={() => setSelected(cell.dateStr)}
                >
                  <View
                    style={[
                      styles.dayInner,
                      isToday && styles.dayToday,
                      isSelected && !isToday && styles.daySelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        weekdayIdx === 0 && styles.sunText,
                        weekdayIdx === 6 && styles.satText,
                        isPast && styles.dayPast,
                        isToday && styles.dayTodayText,
                      ]}
                    >
                      {cell.day}
                    </Text>
                  </View>
                  <View style={styles.dotWrap}>
                    {hasPlan ? (
                      <View style={[styles.dot, isToday && styles.dotOnToday]} />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Card>

        {/* 선택 날짜 상세 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{formatKoreanDate(selected)}</Text>

          <Card style={styles.detailCard}>
            {selectedPlans.length > 0 ? (
              selectedPlans.map((p, i) => (
                <Pressable
                  key={p.planId}
                  onPress={() => confirmRemove(p)}
                  style={[styles.planRow, i > 0 && styles.rowBorder]}
                >
                  <View style={styles.planIcon}>
                    <Icon name="place" size={18} color={colors.accent} />
                  </View>
                  <View style={styles.flex1}>
                    <Text style={styles.planLoc}>{p.locationTag || "장소 미정"}</Text>
                    {p.memo ? <Text style={styles.planMemo}>{p.memo}</Text> : null}
                  </View>
                  <Icon name="delete-outline" size={20} color={colors.muted2} />
                </Pressable>
              ))
            ) : (
              <Text style={styles.emptyText}>등록된 일정이 없어요.</Text>
            )}
          </Card>

          {/* 일정 추가 폼 */}
          <Card style={styles.formCard}>
            <Text style={styles.formLabel}>일정 추가</Text>
            <TextInput
              value={location}
              onChangeText={setLocation}
              placeholder="장소 (예: 한강공원 반포지구)"
              placeholderTextColor={colors.muted2}
              style={styles.input}
            />
            <TextInput
              value={memo}
              onChangeText={setMemo}
              placeholder="메모 (예: 점심 11시~14시)"
              placeholderTextColor={colors.muted2}
              style={styles.input}
            />
            <AppButton title="추가" variant="accent" icon="add" onPress={submit} />
          </Card>
        </View>

        {/* 다가오는 일정 */}
        {upcoming.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>다가오는 일정</Text>
            <Card style={styles.upcomingCard}>
              {upcoming.map((p, i) => (
                <Pressable
                  key={p.planId}
                  onPress={() => {
                    setYear(Number(p.date.slice(0, 4)));
                    setMonth(Number(p.date.slice(5, 7)) - 1);
                    setSelected(p.date);
                  }}
                  style={[styles.upcomingRow, i > 0 && styles.rowBorder]}
                >
                  <View style={styles.upcomingDate}>
                    <Text style={styles.upcomingMonth}>{Number(p.date.slice(5, 7))}월</Text>
                    <Text style={styles.upcomingDay}>{Number(p.date.slice(8, 10))}</Text>
                  </View>
                  <View style={styles.flex1}>
                    <Text style={styles.planLoc}>{p.locationTag || "장소 미정"}</Text>
                    {p.memo ? <Text style={styles.planMemo}>{p.memo}</Text> : null}
                  </View>
                </Pressable>
              ))}
            </Card>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: { fontSize: fontSize.body, fontWeight: fontWeight.heavy, color: colors.ink },
  headerSpacer: { width: 20 },
  body: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
  flex1: { flex: 1 },

  // calendar
  calCard: { gap: spacing.md },
  monthNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  navBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.chip,
    backgroundColor: colors.surfaceAlt,
  },
  monthLabel: { fontSize: fontSize.body, fontWeight: fontWeight.heavy, color: colors.ink, ...tabularNums },
  weekRow: { flexDirection: "row" },
  weekCell: { flex: 1, alignItems: "center", paddingVertical: spacing.xs },
  weekText: { fontSize: fontSize.caption, fontWeight: fontWeight.bold, color: colors.muted },
  sunText: { color: colors.danger },
  satText: { color: colors.staff },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: { width: `${100 / 7}%`, alignItems: "center", paddingVertical: 4 },
  dayInner: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  dayToday: { backgroundColor: colors.accent },
  daySelected: { borderWidth: 1.5, borderColor: colors.accent },
  dayText: { fontSize: fontSize.bodySm, fontWeight: fontWeight.semibold, color: colors.ink, ...tabularNums },
  dayTodayText: { color: colors.white, fontWeight: fontWeight.heavy },
  dayPast: { color: colors.muted2, fontWeight: fontWeight.regular },
  dotWrap: { height: 8, alignItems: "center", justifyContent: "center" },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.accent },
  dotOnToday: { backgroundColor: colors.accent },

  // sections
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: fontSize.label, fontWeight: fontWeight.bold, color: colors.muted, paddingLeft: 4 },

  // detail plan list
  detailCard: { padding: 0, overflow: "hidden" },
  planRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.line2 },
  planIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  planLoc: { fontSize: fontSize.body, fontWeight: fontWeight.bold, color: colors.ink },
  planMemo: { fontSize: fontSize.bodySm, color: colors.ink2, marginTop: 2 },
  emptyText: { fontSize: fontSize.bodySm, color: colors.muted, padding: spacing.lg, textAlign: "center" },

  // add form
  formCard: { gap: spacing.sm },
  formLabel: { fontSize: fontSize.label, fontWeight: fontWeight.bold, color: colors.muted },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.input,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: fontSize.body,
    color: colors.ink,
  },

  // upcoming
  upcomingCard: { padding: 0, overflow: "hidden" },
  upcomingRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg },
  upcomingDate: {
    width: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.chip,
    paddingVertical: 6,
  },
  upcomingMonth: { fontSize: fontSize.micro, fontWeight: fontWeight.bold, color: colors.muted, ...tabularNums },
  upcomingDay: { fontSize: fontSize.body, fontWeight: fontWeight.heavy, color: colors.accent, ...tabularNums },
});
