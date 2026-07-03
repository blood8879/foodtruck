/**
 * Supabase (Postgres) implementation of SyncPort.
 *
 * Maps the append-only event log to the `event` table (see
 * server/supabase/schema.sql). RLS enforces H3 role scoping server-side, so the
 * client pull does not (and must not) re-implement access control.
 *
 * NOTE (build-vs-buy gate, ralplan M-GATE): a bare `seq > cursor` pull can in
 * principle skip an event whose identity `seq` was assigned before commit but
 * became visible after a higher seq (commit-order non-monotonicity). The
 * SyncEngine contract is validated gap-free against FakeSyncServer; for the live
 * Supabase path the M2 spike must confirm gap-freeness (logical replication slot
 * or a commit-order/overlap-window column) before this adapter is trusted in
 * production. Until then treat Supabase sync as eventually-consistent read.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PullRequest,
  PullResult,
  PushItem,
  PushResult,
  ServerEvent,
  SyncPort,
} from "./port";
import type { DomainEvent } from "../core/types";
import { getSupabase } from "./supabaseClient";

interface EventRow {
  seq: number;
  truck_id: string;
  entered_by: string;
  server_received_at: string;
  payload: DomainEvent;
}

export class SupabaseSyncPort implements SyncPort {
  constructor(private readonly client: SupabaseClient) {}

  async push(items: PushItem[]): Promise<PushResult> {
    if (items.length === 0) return { acceptedIds: [] };
    const rows = items.map((it) => ({
      event_id: it.event.eventId,
      truck_id: it.truckId,
      type: it.event.type,
      entered_by: it.enteredBy,
      device_created_at: it.deviceCreatedAt,
      payload: it.event,
    }));
    const { error } = await this.client
      .from("event")
      .upsert(rows, { onConflict: "event_id", ignoreDuplicates: true });
    if (error) throw new Error(`sync push failed: ${error.message}`);
    return { acceptedIds: items.map((i) => i.event.eventId) };
  }

  async pull(req: PullRequest): Promise<PullResult> {
    const { data, error } = await this.client
      .from("event")
      .select("seq, truck_id, entered_by, server_received_at, payload")
      .eq("truck_id", req.truckId)
      .gt("seq", req.sinceSeq)
      .order("seq", { ascending: true })
      .limit(req.limit ?? 500);
    if (error) throw new Error(`sync pull failed: ${error.message}`);
    const rows = (data ?? []) as EventRow[];
    const events: ServerEvent[] = rows.map((r) => ({
      seq: r.seq,
      event: r.payload,
      truckId: r.truck_id,
      enteredBy: r.entered_by,
      serverReceivedAt: new Date(r.server_received_at).getTime(),
    }));
    const nextCursor = events.length ? events[events.length - 1].seq : req.sinceSeq;
    return { events, nextCursor };
  }
}

export function createSupabaseSyncPort(): SupabaseSyncPort | null {
  const client = getSupabase();
  return client ? new SupabaseSyncPort(client) : null;
}
