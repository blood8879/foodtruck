/**
 * UUIDv7 (time-ordered) id generation. Time-ordering matters for the M2 sync
 * design (monotone cursor / deterministic merge ordering), so we use it now to
 * avoid a later migration.
 */

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  const g = globalThis.crypto;
  if (g && typeof g.getRandomValues === "function") {
    g.getRandomValues(out);
    return out;
  }
  for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}

const HEX: string[] = [];
for (let i = 0; i < 256; i++) HEX.push((i + 0x100).toString(16).slice(1));

/** Generate a UUIDv7 string. `now` is injectable for deterministic tests. */
export function uuidv7(now: number = Date.now()): string {
  const ts = Math.max(0, Math.floor(now));
  const bytes = randomBytes(16);

  // 48-bit big-endian timestamp (ms)
  bytes[0] = (ts / 2 ** 40) & 0xff;
  bytes[1] = (ts / 2 ** 32) & 0xff;
  bytes[2] = (ts / 2 ** 24) & 0xff;
  bytes[3] = (ts / 2 ** 16) & 0xff;
  bytes[4] = (ts / 2 ** 8) & 0xff;
  bytes[5] = ts & 0xff;

  // version 7
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  // variant 10xx
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const h = (i: number) => HEX[bytes[i]];
  return (
    h(0) + h(1) + h(2) + h(3) + "-" +
    h(4) + h(5) + "-" +
    h(6) + h(7) + "-" +
    h(8) + h(9) + "-" +
    h(10) + h(11) + h(12) + h(13) + h(14) + h(15)
  );
}

/** Short human-friendly invite code, e.g. "9F4K2". */
export function inviteCode(len = 5): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}
