import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Alert } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { getSupabase } from "../sync/supabaseClient";
import { isSyncConfigured } from "../sync/config";

// Finalizes an auth session that completed via a web popup redirect (web only;
// a no-op on native). Safe to call once at module load per Expo's guidance.
WebBrowser.maybeCompleteAuthSession();

/** Collect params from both the query string and the URL fragment of a deep link. */
function paramsFromUrl(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const grab = (segment: string | undefined) => {
    if (!segment) return;
    for (const pair of segment.split("&")) {
      if (!pair) continue;
      const [k, v] = pair.split("=");
      if (k) out[decodeURIComponent(k)] = decodeURIComponent(v ?? "");
    }
  };
  const [beforeHash, hash] = url.split("#");
  grab(beforeHash.split("?")[1]);
  grab(hash);
  return out;
}

export type Role = "owner" | "staff";

interface AuthValue {
  configured: boolean;
  loading: boolean;
  userId: string | null;
  /** Server truck id once the user owns/joined a truck. */
  truckId: string | null;
  role: Role | null;
  /** Server truck invite code (owner shares this with staff). */
  inviteCode: string | null;
  /** Server-side truck plan tier (from truck.plan_tier), null until loaded. */
  serverPlanTier: "free" | "paid" | null;
  email: string | null;
  /** Signed in but not yet attached to any truck -> show onboarding. */
  needsOnboarding: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  /** OAuth login via Kakao (Supabase web flow, no native SDK). */
  signInWithKakao: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Create a new truck and become its owner. */
  createTruck: (truckName: string, ownerName: string) => Promise<void>;
  /** Join an existing truck as staff via invite code. */
  joinTruck: (inviteCode: string, staffName: string) => Promise<void>;
  /** Reflect a locally-rotated invite code so the signed-in UI stays in sync. */
  updateInviteCode: (code: string) => void;
}

const AuthContext = createContext<AuthValue | null>(null);

interface MembershipRow {
  truck_id: string;
  role: Role;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSyncConfigured();
  const [loading, setLoading] = useState(configured);
  const [userId, setUserId] = useState<string | null>(null);
  const [truckId, setTruckId] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [serverPlanTier, setServerPlanTier] = useState<"free" | "paid" | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // session -> userId/email
  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }
    const sb = getSupabase();
    if (!sb) {
      setLoading(false);
      return;
    }
    let active = true;
    const apply = (session: { user?: { id: string; email?: string | null } } | null) => {
      if (!active) return;
      const u = session?.user;
      setUserId(u?.id ?? null);
      setEmail(u?.email ?? null);
      if (!u) {
        setTruckId(null);
        setRole(null);
        setInviteCode(null);
        setNeedsOnboarding(false);
      }
    };
    sb.auth.getSession().then(({ data }) => {
      apply(data.session);
      setLoading(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => apply(session));
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [configured]);

  // Resolve the user's membership (truck + role). If none -> onboarding.
  useEffect(() => {
    if (!userId || truckId) return;
    const sb = getSupabase();
    if (!sb) return;
    let cancelled = false;
    let attempts = 0;
    const resolve = async () => {
      attempts += 1;
      const { data, error: e } = await sb
        .from("membership")
        .select("truck_id, role")
        .eq("user_id", userId)
        .limit(1);
      if (cancelled) return;
      if (e) {
        if (attempts < 3) setTimeout(resolve, 1500 * attempts);
        return;
      }
      const row = (data as MembershipRow[] | null)?.[0];
      if (row) {
        setTruckId(row.truck_id);
        setRole(row.role);
        const { data: t } = await sb
          .from("truck")
          .select("invite_code, plan_tier")
          .eq("id", row.truck_id)
          .limit(1);
        const truckRow = (t as { invite_code: string; plan_tier: string }[] | null)?.[0];
        setInviteCode(truckRow?.invite_code ?? null);
        setServerPlanTier(truckRow?.plan_tier === "paid" ? "paid" : "free");
        setNeedsOnboarding(false);
      } else {
        setNeedsOnboarding(true);
      }
    };
    resolve();
    return () => {
      cancelled = true;
    };
  }, [userId, truckId]);

  const signIn = useCallback(async (mail: string, password: string) => {
    setError(null);
    const sb = getSupabase();
    if (!sb) return;
    const { error: e } = await sb.auth.signInWithPassword({ email: mail, password });
    if (e) setError(e.message);
  }, []);

  const signUp = useCallback(async (mail: string, password: string) => {
    setError(null);
    const sb = getSupabase();
    if (!sb) return;
    const { error: e } = await sb.auth.signUp({ email: mail, password });
    if (e) setError(e.message);
  }, []);

  const signInWithKakao = useCallback(async () => {
    setError(null);
    const sb = getSupabase();
    if (!sb) return;
    // Deep link back into the app (uses app.json `scheme`); dev builds get the
    // Expo host URL automatically via Linking.createURL.
    const redirectTo = Linking.createURL("auth/callback");
    const { data, error: e } = await sb.auth.signInWithOAuth({
      provider: "kakao",
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (e || !data?.url) {
      if (e) Alert.alert("카카오 로그인", e.message);
      return;
    }
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    // User dismissed / cancelled the browser -> return silently.
    if (result.type !== "success" || !result.url) return;

    const p = paramsFromUrl(result.url);
    if (p.error || p.error_description) {
      Alert.alert("카카오 로그인", p.error_description || p.error);
      return;
    }
    // The client uses the implicit flow (no `flowType: 'pkce'`), so tokens come
    // back in the URL fragment. Establish the session; onAuthStateChange then
    // runs the same membership/onboarding flow as email login.
    if (p.access_token && p.refresh_token) {
      const { error: sErr } = await sb.auth.setSession({
        access_token: p.access_token,
        refresh_token: p.refresh_token,
      });
      if (sErr) Alert.alert("카카오 로그인", sErr.message);
      return;
    }
    Alert.alert("카카오 로그인", "로그인 정보를 받지 못했습니다. 다시 시도해주세요.");
  }, []);

  const signOut = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return;
    await sb.auth.signOut();
    setUserId(null);
    setTruckId(null);
    setRole(null);
    setEmail(null);
    setNeedsOnboarding(false);
  }, []);

  const createTruck = useCallback(async (truckName: string, ownerName: string) => {
    setError(null);
    const sb = getSupabase();
    if (!sb) return;
    const { data, error: e } = await sb.rpc("create_truck", {
      p_name: truckName,
      p_owner_name: ownerName,
    });
    if (e) {
      setError(`트럭 생성 실패: ${e.message}`);
      return;
    }
    const truck = (Array.isArray(data) ? data[0] : data) as { id?: string; invite_code?: string } | null;
    if (truck?.id) {
      setTruckId(truck.id);
      setRole("owner");
      setInviteCode(truck.invite_code ?? null);
      setNeedsOnboarding(false);
    }
  }, []);

  const joinTruck = useCallback(async (inviteCode: string, staffName: string) => {
    setError(null);
    const sb = getSupabase();
    if (!sb) return;
    const { data, error: e } = await sb.rpc("join_truck", {
      p_invite_code: inviteCode,
      p_staff_name: staffName,
    });
    if (e) {
      setError(`합류 실패: ${e.message}`);
      return;
    }
    const truck = (Array.isArray(data) ? data[0] : data) as { id?: string; invite_code?: string } | null;
    if (truck?.id) {
      setTruckId(truck.id);
      setRole("staff");
      setInviteCode(truck.invite_code ?? null);
      setNeedsOnboarding(false);
    }
  }, []);

  const updateInviteCode = useCallback((code: string) => {
    setInviteCode(code);
  }, []);

  const value: AuthValue = {
    configured,
    loading,
    userId,
    truckId,
    role,
    inviteCode,
    serverPlanTier,
    email,
    needsOnboarding,
    error,
    signIn,
    signUp,
    signInWithKakao,
    signOut,
    createTruck,
    joinTruck,
    updateInviteCode,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
