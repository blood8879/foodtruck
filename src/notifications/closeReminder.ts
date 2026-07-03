/**
 * Close reminder — default/web no-op. Web has no local scheduled notifications
 * here, so both calls resolve without doing anything. Native resolves
 * closeReminder.native.ts (expo-notifications) via Metro.
 */

/** Schedule the +8h "still open" reminder. No-op on web. */
export async function scheduleCloseReminder(): Promise<void> {
  // web / Expo Go without notifications: nothing to schedule.
}

/** Cancel any scheduled close reminder. No-op on web. */
export async function cancelCloseReminder(): Promise<void> {
  // web: nothing was ever scheduled.
}
