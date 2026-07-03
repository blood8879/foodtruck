import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getSupabase } from "../sync/supabaseClient";
import { isSyncConfigured } from "../sync/config";

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
  email: string | null;
  /** Signed in but not yet attached to any truck -> show onboarding. */
  needsOnboarding: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Create a new truck and become its owner. */
  createTruck: (truckName: string, ownerName: string) => Promise<void>;
  /** Join an existing truck as staff via invite code. */
  joinTruck: (inviteCode: string, staffName: string) => Promise<void>;
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
        const { data: t } = await sb.from("truck").select("invite_code").eq("id", row.truck_id).limit(1);
        setInviteCode((t as { invite_code: string }[] | null)?.[0]?.invite_code ?? null);
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

  const value: AuthValue = {
    configured,
    loading,
    userId,
    truckId,
    role,
    inviteCode,
    email,
    needsOnboarding,
    error,
    signIn,
    signUp,
    signOut,
    createTruck,
    joinTruck,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
