import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createStore } from "../db/createStore";
import type { Store } from "../db/contract";
import { capStorage } from "../ads/capStorage";
import { useAuth } from "../auth/AuthContext";
import { SyncEngine } from "../sync/engine";
import { StoreSyncLocal } from "../sync/storeLocal";
import { createSupabaseSyncPort } from "../sync/supabasePort";
import { syncMenus } from "../sync/menuSync";
import { isSyncConfigured } from "../sync/config";
import { getSupabase } from "../sync/supabaseClient";
import {
  dateKey,
  filterByDateKey,
  foldExpenses,
  foldOrders,
  foldPlans,
  getActiveSession,
  inviteCode,
  lineFromMenu,
  makeExpenseAdded,
  makeExpenseVoided,
  makeOrderPlaced,
  makeOrderVoided,
  makePlanAdded,
  makePlanRemoved,
  makeSessionClosed,
  makeSessionOpened,
  makeSoldOutMarked,
  summarize,
} from "../core";
import type {
  DomainEvent,
  ExpenseCategory,
  ExpenseView,
  Menu,
  OrderLineSnapshot,
  OrderView,
  PaymentMethod,
  PlanTier,
  PlanView,
  SalesSummary,
  SessionView,
  Staff,
  Truck,
  WeatherStamp,
} from "../core/types";

export interface PlaceOrderArgs {
  lines: OrderLineSnapshot[];
  discountMemo?: string;
  manualTotal?: number | null;
  paymentMethod?: PaymentMethod;
  enteredBy: string;
}

export interface AddExpenseArgs {
  category: ExpenseCategory;
  amount: number;
  memo?: string;
  enteredBy: string;
}

export interface OpenSessionArgs {
  locationTag?: string;
  weather?: WeatherStamp;
}

export interface AddPlanArgs {
  date: string; // "YYYY-MM-DD"
  locationTag?: string;
  memo?: string;
}

interface AppDataValue {
  loading: boolean;
  truck: Truck | null;
  staff: Staff[];
  menus: Menu[];
  events: DomainEvent[];
  // derived
  categories: string[];
  activeSession: SessionView | null;
  ordersToday: OrderView[];
  summaryToday: SalesSummary;
  expensesToday: ExpenseView[];
  plans: PlanView[];
  pendingSync: number;
  syncEnabled: boolean;
  // mutations
  saveMenu: (menu: Menu) => void;
  deleteMenu: (id: string) => void;
  loadSampleMenus: () => void;
  toggleSoldOut: (id: string, soldOut: boolean) => void;
  openSession: (by: string, opts?: OpenSessionArgs) => void;
  closeSession: (by: string) => void;
  addPlan: (args: AddPlanArgs) => void;
  removePlan: (planId: string) => void;
  placeOrder: (args: PlaceOrderArgs) => void;
  voidOrder: (orderId: string, by: string) => void;
  addExpense: (args: AddExpenseArgs) => void;
  voidExpense: (expenseId: string, by: string) => void;
  setPlanTier: (tier: PlanTier) => void;
  /** Epoch ms until which the rewarded-ad trial is active, or null if none. */
  trialUntil: number | null;
  /** Grant a rewarded-ad trial for `hours` (default 24) from now, persisted. */
  startTrial: (hours?: number) => void;
  /** Rotate the invite code (invalidates the previous one). Local-first. */
  regenerateInviteCode: () => void;
  /** Edit business name + owner display name. Local-first. */
  updateTruckInfo: (info: { name: string; ownerName: string }) => void;
  ownerId: string;
}

const AppDataContext = createContext<AppDataValue | null>(null);

const TZ_KST = 540; // minutes east of UTC (Asia/Seoul)
const TRIAL_UNTIL_KEY = "trial.until"; // capStorage key: epoch ms of trial expiry

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [repo] = useState<Store>(() => createStore());
  const [loading, setLoading] = useState(true);
  const [truck, setTruck] = useState<Truck | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [events, setEvents] = useState<DomainEvent[]>([]);
  const [pendingSync, setPendingSync] = useState(0);
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [trialUntil, setTrialUntil] = useState<number | null>(null);
  const auth = useAuth();
  const engineRef = useRef<SyncEngine | null>(null);
  const truckIdRef = useRef<string | null>(null);
  const syncEnabledRef = useRef(false);
  const triggerRef = useRef<() => void>(() => {});

  const refresh = useCallback(() => {
    setTruck(repo.getTruck());
    setStaff(repo.listStaff());
    setMenus(repo.listMenus());
    setEvents(repo.listEvents());
    // Outbox depth is meaningful only when a sync backend is connected.
    setPendingSync(syncEnabledRef.current ? repo.pendingSyncCount() : 0);
  }, [repo]);

  useEffect(() => {
    repo.init();
    const t = repo.ensureTruck({ name: "내 푸드트럭", ownerName: "사장님" });
    // Seed demo menus only for local-only mode. When a sync backend is
    // configured the catalog comes from the server (no fake data, no dupes).
    if (!isSyncConfigured() && repo.listMenus().length === 0) seedDemoMenus(repo);
    setTruck(t);
    refresh();
    setLoading(false);
    // Restore any previously granted trial (persisted via capStorage). Expiry is
    // evaluated at each use site against Date.now(), so we simply load the value.
    capStorage
      .get(TRIAL_UNTIL_KEY)
      .then((v) => {
        const ts = v ? Number(v) : NaN;
        if (Number.isFinite(ts)) setTrialUntil(ts);
      })
      .catch(() => {
        /* storage unavailable — no trial restored */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startTrial = useCallback((hours = 24) => {
    const until = Date.now() + hours * 60 * 60 * 1000;
    setTrialUntil(until);
    capStorage.set(TRIAL_UNTIL_KEY, String(until)).catch(() => {
      /* storage unavailable — trial still active in-memory for this session */
    });
  }, []);

  const append = useCallback(
    (e: DomainEvent) => {
      repo.appendEvent(e);
      refresh();
      triggerRef.current(); // push to backend when sync is connected (no-op otherwise)
    },
    [repo, refresh],
  );

  const triggerSync = useCallback(() => {
    const eng = engineRef.current;
    const tid = truckIdRef.current;
    if (!eng) return;
    (async () => {
      await eng.syncOnce(); // events (orders/voids/sessions)
      if (tid) await syncMenus(repo, tid); // menu masters (LWW)
    })()
      .then(() => refresh())
      .catch(() => {
        /* offline / transient — retried on next trigger or interval */
      });
  }, [refresh, repo]);
  triggerRef.current = triggerSync;

  // Build the sync engine when a backend is configured AND the user is signed in
  // with a bootstrapped truck. Unconfigured/local-only stays a pure no-op (M1).
  useEffect(() => {
    const enabled = auth.configured && !!auth.userId && !!auth.truckId;
    syncEnabledRef.current = enabled;
    setSyncEnabled(enabled);
    if (!enabled) {
      engineRef.current = null;
      truckIdRef.current = null;
      return;
    }
    truckIdRef.current = auth.truckId as string;
    const port = createSupabaseSyncPort();
    if (!port) return;
    engineRef.current = new SyncEngine(port, new StoreSyncLocal(repo), {
      truckId: auth.truckId as string,
      userId: auth.userId as string,
      role: auth.role ?? "owner",
    });
    triggerSync();
    const iv = setInterval(triggerSync, 15000);
    return () => clearInterval(iv);
  }, [auth.configured, auth.userId, auth.truckId, auth.role, repo, triggerSync]);

  const ownerId = useMemo(() => staff.find((s) => s.role === "owner")?.id ?? "owner", [staff]);

  const activeSession = useMemo(() => getActiveSession(events), [events]);
  const ordersToday = useMemo(() => {
    const all = foldOrders(events);
    return filterByDateKey(all, dateKey(Date.now(), TZ_KST), TZ_KST).sort((a, b) => b.ts - a.ts);
  }, [events]);
  const summaryToday = useMemo(() => summarize(ordersToday), [ordersToday]);
  const expensesToday = useMemo(() => {
    const all = foldExpenses(events);
    return all
      .filter((e) => dateKey(e.ts, TZ_KST) === dateKey(Date.now(), TZ_KST))
      .sort((a, b) => b.ts - a.ts);
  }, [events]);
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const m of menus) set.add(m.category);
    return [...set];
  }, [menus]);
  const plans = useMemo(() => foldPlans(events), [events]);

  const value: AppDataValue = {
    loading,
    truck,
    staff,
    menus,
    events,
    categories,
    activeSession,
    ordersToday,
    summaryToday,
    expensesToday,
    plans,
    pendingSync,
    syncEnabled,
    ownerId,
    saveMenu: (m) => {
      repo.upsertMenu(m);
      refresh();
    },
    deleteMenu: (id) => {
      repo.deleteMenu(id);
      refresh();
    },
    toggleSoldOut: (id, soldOut) => {
      // Capture the pre-toggle state so we can detect an off→on transition.
      const prev = menus.find((m) => m.id === id);
      repo.setSoldOut(id, soldOut);
      // Stamp the moment a menu goes sold-out (품절 시각) as an append-only audit
      // trail — only on the false→true edge, not on every toggle. The soldOut
      // flag itself stays LWW on the menu master (handled by repo.setSoldOut).
      if (soldOut && prev && !prev.soldOut) {
        append(
          makeSoldOutMarked({
            menuId: id,
            menuName: prev.name,
            sessionId: activeSession?.sessionId ?? null,
            markedBy: ownerId,
          }),
        );
      } else {
        refresh();
      }
    },
    loadSampleMenus: () => {
      seedDemoMenus(repo);
      refresh();
    },
    openSession: (by, opts) => {
      // Single-active-session invariant (write-side guard): ignore double-open.
      if (activeSession) return;
      append(
        makeSessionOpened(by, { locationTag: opts?.locationTag, weather: opts?.weather }),
      );
    },
    closeSession: (by) => {
      if (activeSession) append(makeSessionClosed(activeSession.sessionId, by));
    },
    addPlan: ({ date, locationTag, memo }) =>
      append(makePlanAdded({ date, locationTag, memo, enteredBy: ownerId })),
    removePlan: (planId) => append(makePlanRemoved(planId, ownerId)),
    placeOrder: ({ lines, discountMemo, manualTotal, paymentMethod, enteredBy }) =>
      append(
        makeOrderPlaced({
          sessionId: activeSession?.sessionId ?? null,
          enteredBy,
          lines,
          discountMemo,
          manualTotal,
          paymentMethod,
        }),
      ),
    voidOrder: (orderId, by) => append(makeOrderVoided(orderId, by)),
    addExpense: ({ category, amount, memo, enteredBy }) =>
      append(
        makeExpenseAdded({
          sessionId: activeSession?.sessionId ?? null,
          category,
          amount,
          memo,
          enteredBy,
        }),
      ),
    voidExpense: (expenseId, by) => append(makeExpenseVoided(expenseId, by)),
    setPlanTier: (tier) => {
      repo.setPlanTier(tier);
      refresh();
    },
    trialUntil,
    startTrial,
    regenerateInviteCode: () => {
      // Local-first: rotate immediately so guests/offline users get a new code.
      const code = inviteCode();
      repo.setInviteCode(code);
      refresh();
      // Signed-in owner: rotate the server row best-effort. The RPC returns the
      // server-authoritative code; reconcile local + auth to it on success.
      // Failure is non-fatal — the local rotation already succeeded.
      if (auth.configured && auth.userId && auth.truckId) {
        const sb = getSupabase();
        if (sb) {
          (async () => {
            const { data, error } = await sb.rpc("regenerate_invite_code", {
              p_truck_id: auth.truckId,
            });
            if (error || !data) return;
            const serverCode = String(data);
            repo.setInviteCode(serverCode);
            auth.updateInviteCode(serverCode);
            refresh();
          })().catch(() => {
            /* offline / transient — local code stands */
          });
        }
      }
    },
    updateTruckInfo: ({ name, ownerName }) => {
      // Local-first update of the truck masters.
      repo.updateTruck({ name, ownerName });
      refresh();
      // Signed-in owner: push best-effort. Server keeps the business name on
      // truck and the owner display name on the owner's membership row.
      if (auth.configured && auth.userId && auth.truckId) {
        const sb = getSupabase();
        if (sb) {
          (async () => {
            await sb.from("truck").update({ name }).eq("id", auth.truckId);
            await sb
              .from("membership")
              .update({ staff_name: ownerName })
              .eq("truck_id", auth.truckId)
              .eq("user_id", auth.userId)
              .eq("role", "owner");
          })().catch(() => {
            /* offline / transient — local edit stands */
          });
        }
      }
    },
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataValue {
  const v = useContext(AppDataContext);
  if (!v) throw new Error("useAppData must be used within AppDataProvider");
  return v;
}

export { lineFromMenu };

function seedDemoMenus(repo: Store) {
  // Deterministic ids + baseline updatedAt so seeding is idempotent across
  // devices (sync merge never duplicates) and any real edit (Date.now) wins.
  const SEED_TS = 1;
  const demo: Menu[] = [
    { id: "seed-burger-double", name: "서울더블버거", sellPrice: 7000, cost: 3000, category: "버거", soldOut: false, updatedAt: SEED_TS },
    { id: "seed-burger-cheese", name: "치즈버거", sellPrice: 5500, cost: 2200, category: "버거", soldOut: false, updatedAt: SEED_TS },
    { id: "seed-fries", name: "감자튀김", sellPrice: 3000, cost: 900, category: "사이드", soldOut: false, updatedAt: SEED_TS },
    { id: "seed-cola", name: "콜라", sellPrice: 2000, cost: 600, category: "음료", soldOut: false, updatedAt: SEED_TS },
    { id: "seed-americano", name: "아메리카노", sellPrice: 2500, cost: 700, category: "음료", soldOut: false, updatedAt: SEED_TS },
  ];
  for (const m of demo) repo.upsertMenu(m);
}
