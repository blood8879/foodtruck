import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppDataProvider } from "../data/AppData";
import { AuthProvider, useAuth } from "../auth/AuthContext";
import { colors } from "../theme/tokens";

export const unstable_settings = {
  initialRouteName: "session-start",
};

/**
 * Redirects between the sign-in screen and the app based on auth.
 * No-op when sync is unconfigured (local-only M1 mode = no login required).
 */
function AuthGate() {
  const { configured, loading, userId, truckId, needsOnboarding } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!configured || loading) return;
    const top = segments[0];
    // Login is OPTIONAL: guests use the app locally. Only logged-in users are
    // routed through onboarding / out of the auth screens.
    if (userId && needsOnboarding && !truckId) {
      if (top !== "onboarding") router.replace("/onboarding");
    } else if (userId && truckId && (top === "sign-in" || top === "onboarding")) {
      router.replace("/session-start");
    }
  }, [configured, loading, userId, truckId, needsOnboarding, segments, router]);

  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppDataProvider>
          <StatusBar style="dark" />
          <AuthGate />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
            }}
          >
            <Stack.Screen name="sign-in" />
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="session-start" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="menu-edit" options={{ presentation: "modal" }} />
            <Stack.Screen name="truck-edit" options={{ presentation: "modal" }} />
            <Stack.Screen name="order/[id]" options={{ presentation: "modal" }} />
            <Stack.Screen name="close-summary" options={{ presentation: "modal" }} />
            <Stack.Screen name="ad" options={{ presentation: "fullScreenModal", animation: "fade" }} />
          </Stack>
        </AppDataProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
