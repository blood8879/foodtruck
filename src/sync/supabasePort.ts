/**
 * Supabase (Postgres) implementation of SyncPort.
 *
 * Maps the append-only event log to the `event` table (see
 * server/supabase/schema.sql). RLS enforces H3 role scoping server-side, so the
 * client pull does not (and must not) re-implement access control.
 *
 * Gap-free pull (ralplan M-GATE — RESOLVED by
 * server/supabase/004_serialize_event_append.sql). A bare `seq > cursor` pull is
 * gap-free ONLY IF, per truck, commit order == seq order; otherwise an event
 * whose `seq` was drawn before commit could become visible after the cursor has
 * already advanced past it, and be lost forever. Migration 004 establishes that
 * invariant: a BEFORE INSERT trigger takes pg_advisory_xact_lock(hashtext(
 * truck_id)) and only then draws seq from a dedicated sequence, holding the lock
 * to commit — so a lower seq for a truck can never surface after a higher one.
 * This adapter therefore depends on that SERVER invariant (not a client
 * watermark): the pull below is a plain `seq > sinceSeq order by seq asc` and the
 * cursor advances to the last seq returned. If migration 004 is ever reverted,
 * this pull is no longer gap-free.
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
