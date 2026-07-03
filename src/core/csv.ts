/**
 * CSV export — platform-agnostic. Produces Excel-friendly UTF-8 CSV for
 * Korean users (BOM prefix, CRLF line endings, RFC4180 escaping).
 *
 * No React Native / Expo imports here so it stays unit-testable with `bun test`.
 */

import { dateKey } from "./fold";
import { EXPENSE_CATEGORY_LABELS, PAYMENT_METHOD_LABELS } from "./types";
import type { ExpenseView, OrderView } from "./types";

/** UTF-8 BOM — makes Excel on Korean Windows read the file as UTF-8. */
const BOM = "﻿";
const CRLF = "\r\n";

/** KST offset in minutes east of UTC. */
const KST_OFFSET_MINUTES = 540;

/** Escape a single CSV field per RFC4180: wrap in quotes when it contains a
 * comma, double-quote, CR or LF; double up any inner quotes. */
function escapeField(value: string | number): string {
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Generic CSV builder. Prefixes a UTF-8 BOM, joins fields with commas and rows
 * with CRLF. Every field is RFC4180-escaped.
 */
export function toCsv(header: string[], rows: (string | number)[][]): string {
  const lines = [header, ...rows].map((row) => row.map(escapeField).join(","));
  return BOM + lines.join(CRLF);
}

/** "HH:MM" in the given tz offset, computed directly (no dependence on the
 * host Date's local timezone). */
function timeHHMM(ts: number, tzOffsetMinutes: number): string {
  const d = new Date(ts + tzOffsetMinutes * 60_000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export interface OrdersToCsvOptions {
  /** Timezone offset (minutes east of UTC). Defaults to KST (540). */
  tzOffsetMinutes?: number;
  /** Optional sessionId → 장소 (location label) lookup. */
  locationBySession?: Map<string, string>;
}

/**
 * Export orders as a line-level CSV (one row per menu line of each order).
 *
 * Columns (Korean): 날짜, 시간, 주문ID, 메뉴, 수량, 단가, 금액(=단가×수량),
 * 원가, 결제수단, 취소여부, 장소, 조정총액.
 *
 * - 날짜/시간 use the tz offset (KST by default), 시간 computed directly.
 * - 결제수단 uses the Korean label; undefined → "기타".
 * - 취소여부 is Y/N; voided orders are still included as rows.
 * - 장소 resolved from locationBySession by sessionId (blank when absent).
 * - 조정총액 (manualTotal override) is shown only on the order's FIRST line row
 *   and only when the order's gross differs from the plain line sum; otherwise
 *   blank. It sits in the trailing column so per-line 금액 stays untouched.
 */
export function ordersToCsv(orders: OrderView[], opts?: OrdersToCsvOptions): string {
  const tz = opts?.tzOffsetMinutes ?? KST_OFFSET_MINUTES;
  const locationBySession = opts?.locationBySession;

  const header = [
    "날짜",
    "시간",
    "주문ID",
    "메뉴",
    "수량",
    "단가",
    "금액",
    "원가",
    "결제수단",
    "취소여부",
    "장소",
    "조정총액",
  ];

  const rows: (string | number)[][] = [];

  for (const o of orders) {
    const date = dateKey(o.ts, tz);
    const time = timeHHMM(o.ts, tz);
    const method = PAYMENT_METHOD_LABELS[o.paymentMethod ?? "other"];
    const voided = o.voided ? "Y" : "N";
    const location =
      (o.sessionId != null && locationBySession?.get(o.sessionId)) || "";

    // manualTotal override is detectable as gross != Σ(unitPrice×qty).
    const lineSum = o.lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
    const adjusted = o.gross !== lineSum ? o.gross : "";

    if (o.lines.length === 0) {
      // Preserve orders with no lines (e.g. manualTotal-only) as a single row.
      rows.push([date, time, o.orderId, "", "", "", "", o.cost, method, voided, location, adjusted]);
      continue;
    }

    o.lines.forEach((l, i) => {
      rows.push([
        date,
        time,
        o.orderId,
        l.menuName,
        l.qty,
        l.unitPrice,
        l.unitPrice * l.qty,
        l.unitCost * l.qty,
        method,
        voided,
        location,
        i === 0 ? adjusted : "", // 조정총액 only on the first line row
      ]);
    });
  }

  return toCsv(header, rows);
}

export interface ExpensesToCsvOptions {
  /** Timezone offset (minutes east of UTC). Defaults to KST (540). */
  tzOffsetMinutes?: number;
}

/**
 * Export expenses as a CSV (one row per expense).
 *
 * Columns (Korean): 날짜, 시간, 카테고리, 금액, 메모, 취소여부.
 *
 * - 날짜/시간 use the tz offset (KST by default), 시간 computed directly.
 * - 카테고리 uses the Korean label.
 * - 취소여부 is Y/N; voided expenses are still included as rows.
 */
export function expensesToCsv(expenses: ExpenseView[], opts?: ExpensesToCsvOptions): string {
  const tz = opts?.tzOffsetMinutes ?? KST_OFFSET_MINUTES;

  const header = ["날짜", "시간", "카테고리", "금액", "메모", "취소여부"];

  const rows: (string | number)[][] = expenses.map((e) => [
    dateKey(e.ts, tz),
    timeHHMM(e.ts, tz),
    EXPENSE_CATEGORY_LABELS[e.category],
    e.amount,
    e.memo ?? "",
    e.voided ? "Y" : "N",
  ]);

  return toCsv(header, rows);
}
