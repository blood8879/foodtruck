/** Frequency-cap storage — native (AsyncStorage, persists across app restarts). */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CapStorage } from "./frequencyCap";

export const capStorage: CapStorage = {
  get: (key) => AsyncStorage.getItem(key),
  set: (key, value) => AsyncStorage.setItem(key, value),
};
