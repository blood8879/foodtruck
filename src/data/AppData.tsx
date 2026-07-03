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
import { useAuth } from "../auth/AuthContext";
import { SyncEngine } from "../sync/engine";
import { StoreSyncLocal } from "../sync/storeLocal";
import { createSupabaseSyncPort } from "../sync/supabasePort";
import { syncMenus } from "../sync/menuSync";
import { isSyncConfigured } from "../sync/config";
import {
  dateKey,
  filterByDateKey,
  foldOrders,
  getActiveSession,
  lineFromMenu,
  makeOrderPlaced,
  makeOrderVoided,
  makeSessionClosed,
  makeSessionOpened,
  summarize,
} from "../core";
import type {
  DomainEvent,
  Menu,
  OrderLineSnapshot,
  OrderView,
  PlanTier,
  SalesSummary,
  SessionView,
  Staff,
  Truck,
} from "../core/types";

export interface PlaceOrderArgs {
  lines: OrderLineSnapshot[];
  discountMemo?: string;
  manualTotal?: number | null;
  enteredBy: string;
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
  pendingSync: number;
  syncEnabled: boolean;
  // mutations
  saveMenu: (menu: Menu) => void;
  deleteMenu: (id: string) => void;
  loadSampleMenus: () => void;
  toggleSoldOut: (id: string, soldOut: boolean) => void;
  openSession: (by: string) => void;
  closeSession: (by: string) => void;
  placeOrder: (args: PlaceOrderArgs) => void;
  voidOrder: (orderId: string, by: string) => void;
  setPlanTier: (tier: PlanTier) => void;
  ownerId: string;
}

const AppDataContext = createContext<AppDataValue | null>(null);

const TZ_KST = 540; // minutes east of UTC (Asia/Seoul)

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [repo] = useState<Store>(() => createStore());
  const [loading, setLoading] = useState(true);
  const [truck, setTruck] = useState<Truck | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [events, setEvents] = useState<DomainEvent[]>([]);
  const [pendingSync, setPendingSync] = useState(0);
  const [syncEnabled, setSyncEnabled] = useState(false);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const m of menus) set.add(m.category);
    return [...set];
  }, [menus]);

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
      repo.setSoldOut(id, soldOut);
      refresh();
    },
    loadSampleMenus: () => {
      seedDemoMenus(repo);
      refresh();
    },
    openSession: (by) => {
      // Single-active-session invariant (write-side guard): ignore double-open.
      if (activeSession) return;
      append(makeSessionOpened(by));
    },
    closeSession: (by) => {
      if (activeSession) append(makeSessionClosed(activeSession.sessionId, by));
    },
    placeOrder: ({ lines, discountMemo, manualTotal, enteredBy }) =>
      append(
        makeOrderPlaced({
          sessionId: activeSession?.sessionId ?? null,
          enteredBy,
          lines,
          discountMemo,
          manualTotal,
        }),
      ),
    voidOrder: (orderId, by) => append(makeOrderVoided(orderId, by)),
    setPlanTier: (tier) => {
      repo.setPlanTier(tier);
      refresh();
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
