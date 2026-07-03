import { describe, expect, it } from "bun:test";
import { ordersToCsv, toCsv } from "../index";
import type { OrderView } from "../types";

const BOM = "﻿";

/** Build an OrderView with sane defaults for testing. */
function order(partial: Partial<OrderView> & Pick<OrderView, "orderId" | "ts">): OrderView {
  const lines = partial.lines ?? [
    { menuId: "m1", menuName: "떡볶이", qty: 1, unitPrice: 4000, unitCost: 1500 },
  ];
  const lineSum = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const cost = lines.reduce((s, l) => s + l.unitCost * l.qty, 0);
  const gross = partial.gross ?? lineSum;
  return {
    sessionId: "s1",
    enteredBy: "staff1",
    lines,
    gross,
    cost,
    net: gross - cost,
    voided: false,
    lateSynced: false,
    ...partial,
  };
}

describe("toCsv", () => {
  it("prefixes a UTF-8 BOM", () => {
    const csv = toCsv(["a"], [["b"]]);
    expect(csv.startsWith(BOM)).toBe(true);
  });

  it("uses CRLF line separators", () => {
    const csv = toCsv(["a"], [["b"], ["c"]]);
    expect(csv).toBe(`${BOM}a\r\nb\r\nc`);
  });

  it("escapes fields with commas, quotes, and newlines (RFC4180)", () => {
    const csv = toCsv(["h"], [["a,b"], ['he said "hi"'], ["line1\nline2"]]);
    expect(csv).toBe(
      `${BOM}h\r\n"a,b"\r\n"he said ""hi"""\r\n"line1\nline2"`,
    );
  });

  it("leaves plain fields unquoted and stringifies numbers", () => {
    const csv = toCsv(["h"], [["plain", 42]]);
    expect(csv).toBe(`${BOM}h\r\nplain,42`);
  });
});

describe("ordersToCsv", () => {
  // 2026-07-03 09:05 KST == 2026-07-03T00:05:00Z
  const KST_TS = Date.UTC(2026, 6, 3, 0, 5, 0);

  function bodyRows(csv: string): string[] {
    const lines = csv.slice(BOM.length).split("\r\n");
    return lines.slice(1); // drop header
  }

  it("includes the BOM and Korean header", () => {
    const csv = ordersToCsv([]);
    expect(csv.startsWith(BOM)).toBe(true);
    const header = csv.slice(BOM.length).split("\r\n")[0];
    expect(header).toBe(
      "날짜,시간,주문ID,메뉴,수량,단가,금액,원가,결제수단,취소여부,장소,조정총액",
    );
  });

  it("emits one row per menu line", () => {
    const o = order({
      orderId: "o1",
      ts: KST_TS,
      lines: [
        { menuId: "m1", menuName: "떡볶이", qty: 2, unitPrice: 4000, unitCost: 1500 },
        { menuId: "m2", menuName: "순대", qty: 1, unitPrice: 5000, unitCost: 2000 },
      ],
      paymentMethod: "card",
    });
    const rows = bodyRows(ordersToCsv([o]));
    expect(rows).toHaveLength(2);
    // 날짜,시간,주문ID,메뉴,수량,단가,금액,원가,결제수단,취소여부,장소,조정총액
    expect(rows[0]).toBe("2026-07-03,09:05,o1,떡볶이,2,4000,8000,3000,카드,N,,");
    expect(rows[1]).toBe("2026-07-03,09:05,o1,순대,1,5000,5000,2000,카드,N,,");
  });

  it("computes KST date/time directly at the day boundary", () => {
    // 2026-07-02T15:00:00Z == 2026-07-03 00:00 KST (crosses into next day)
    const ts = Date.UTC(2026, 6, 2, 15, 0, 0);
    const o = order({ orderId: "o1", ts });
    const row = bodyRows(ordersToCsv([o]))[0];
    expect(row.startsWith("2026-07-03,00:00,")).toBe(true);
  });

  it("labels payment methods in Korean, undefined → 기타", () => {
    const o1 = order({ orderId: "o1", ts: KST_TS, paymentMethod: "transfer" });
    const o2 = order({ orderId: "o2", ts: KST_TS }); // no paymentMethod
    const rows = bodyRows(ordersToCsv([o1, o2]));
    expect(rows[0].split(",")[8]).toBe("계좌이체");
    expect(rows[1].split(",")[8]).toBe("기타");
  });

  it("marks voided orders with Y but still includes their rows", () => {
    const o = order({ orderId: "o1", ts: KST_TS, voided: true });
    const rows = bodyRows(ordersToCsv([o]));
    expect(rows).toHaveLength(1);
    expect(rows[0].split(",")[9]).toBe("Y");
  });

  it("escapes menu names containing commas, quotes, and newlines", () => {
    const o = order({
      orderId: "o1",
      ts: KST_TS,
      lines: [
        { menuId: "m1", menuName: 'A,B "C"\nD', qty: 1, unitPrice: 1000, unitCost: 500 },
      ],
    });
    const row = bodyRows(ordersToCsv([o]))[0];
    expect(row).toContain('"A,B ""C""\nD"');
  });

  it("shows 조정총액 only on the first line row when manualTotal overrides", () => {
    const o = order({
      orderId: "o1",
      ts: KST_TS,
      lines: [
        { menuId: "m1", menuName: "떡볶이", qty: 1, unitPrice: 4000, unitCost: 1500 },
        { menuId: "m2", menuName: "순대", qty: 1, unitPrice: 5000, unitCost: 2000 },
      ],
      gross: 8000, // manual override: differs from line sum 9000
    });
    const rows = bodyRows(ordersToCsv([o]));
    expect(rows[0].split(",")[11]).toBe("8000");
    expect(rows[1].split(",")[11]).toBe("");
    // 금액 per line is untouched by the override
    expect(rows[0].split(",")[6]).toBe("4000");
    expect(rows[1].split(",")[6]).toBe("5000");
  });

  it("leaves 조정총액 blank when gross equals the line sum", () => {
    const o = order({ orderId: "o1", ts: KST_TS });
    const row = bodyRows(ordersToCsv([o]))[0];
    expect(row.split(",")[11]).toBe("");
  });

  it("resolves 장소 from locationBySession, blank when missing", () => {
    const o1 = order({ orderId: "o1", ts: KST_TS, sessionId: "s1" });
    const o2 = order({ orderId: "o2", ts: KST_TS, sessionId: "s2" });
    const locationBySession = new Map([["s1", "강남 야시장"]]);
    const rows = bodyRows(ordersToCsv([o1, o2], { locationBySession }));
    expect(rows[0].split(",")[10]).toBe("강남 야시장");
    expect(rows[1].split(",")[10]).toBe("");
  });

  it("honors a custom tz offset", () => {
    // UTC render (offset 0): 2026-07-03T00:05Z → 00:05 UTC
    const o = order({ orderId: "o1", ts: KST_TS });
    const row = bodyRows(ordersToCsv([o], { tzOffsetMinutes: 0 }))[0];
    expect(row.startsWith("2026-07-03,00:05,")).toBe(true);
  });
});
