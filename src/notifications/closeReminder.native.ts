/**
 * Close reminder — native (expo-notifications). Schedules a one-shot local
 * notification 8 hours after a business session opens, nudging the owner to run
 * the close-out (정산) instead of leaving the session open overnight. The
 * reminder is cancelled when the session is closed.
 *
 * Every function is fail-safe (wrapped in try/catch, never throws): a
 * notification hiccup — denied permission, OS error — must never block the
 * open/close flow.
 */
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { capStorage } from "../ads/capStorage";

/** KV key holding the scheduled notification id (empty string == none). */
const STORAGE_KEY = "closeReminder.id";
/** Android channel the reminder posts to. */
const CHANNEL_ID = "reminder";
/** Fire 8 hours after the session opens. */
const REMINDER_SECONDS = 8 * 60 * 60;

/**
 * Request permission and (re)schedule the +8h reminder. Silently no-ops if the
 * user denies notification permission. Any previously scheduled reminder is
 * cancelled first, so re-opening a session never stacks duplicates.
 */
export async function scheduleCloseReminder(): Promise<void> {
  try {
    // Clear a stale reminder before scheduling a fresh one.
    await cancelCloseReminder();

    const { granted } = await Notifications.requestPermissionsAsync();
    if (!granted) return;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: "마감 리마인더",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "아직 영업 중이에요",
        body: "8시간째 영업 중 — 마감 정산을 잊지 마세요!",
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: REMINDER_SECONDS,
        channelId: CHANNEL_ID,
      },
    });

    await capStorage.set(STORAGE_KEY, id);
  } catch {
    // Best-effort: never block the session-open flow on a notification error.
  }
}

/**
 * Cancel the stored reminder and clear the key. No-op when nothing is stored.
 */
export async function cancelCloseReminder(): Promise<void> {
  try {
    const id = await capStorage.get(STORAGE_KEY);
    if (!id) return;
    await Notifications.cancelScheduledNotificationAsync(id);
    await capStorage.set(STORAGE_KEY, "");
  } catch {
    // Ignore — worst case a stale reminder fires later, which is harmless.
  }
}
