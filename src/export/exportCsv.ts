/**
 * CSV file export + share sheet — platform helper.
 *
 * Native (iOS/Android): writes the CSV into the cache directory with expo-file-
 * system's new (SDK 56) File/Paths API, then opens the OS share sheet via
 * expo-sharing. Web has no share sheet, so it falls back to a Blob + <a download>
 * click (and an Alert if even that is unavailable).
 */
import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

export interface CsvFile {
  /** File name including extension, e.g. "todaysales_orders_20260704.csv". */
  filename: string;
  /** Full CSV contents (already BOM-prefixed by core/csv). */
  content: string;
}

/**
 * Write each CSV to a file and present it. On native the files are shared
 * sequentially through the OS share sheet; on web they download one by one.
 * Throws on write/share failure so callers can surface an Alert.
 */
export async function exportCsvFiles(files: CsvFile[]): Promise<void> {
  if (files.length === 0) return;

  if (Platform.OS === "web") {
    webDownload(files);
    return;
  }

  const canShare = await Sharing.isAvailableAsync();
  for (const f of files) {
    // New API: constructing a File does not touch disk; write() creates it.
    // overwrite so a repeated same-day export replaces the prior file.
    const file = new File(Paths.cache, f.filename);
    file.create({ overwrite: true });
    file.write(f.content);
    if (canShare) {
      await Sharing.shareAsync(file.uri, {
        mimeType: "text/csv",
        dialogTitle: f.filename,
        UTI: "public.comma-separated-values-text",
      });
    }
  }
}

/** Web fallback: trigger a browser download for each CSV. */
function webDownload(files: CsvFile[]): void {
  const doc = typeof document !== "undefined" ? document : null;
  if (!doc) {
    throw new Error("이 환경에서는 파일 내보내기를 지원하지 않아요.");
  }
  for (const f of files) {
    const blob = new Blob([f.content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = doc.createElement("a");
    a.href = url;
    a.download = f.filename;
    doc.body.appendChild(a);
    a.click();
    doc.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
