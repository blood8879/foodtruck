/**
 * Menu master sync (M2). Menus are mutable masters, synced last-write-wins by
 * `updatedAt`, separate from the append-only event log. Push local menus, pull
 * remote, and merge newer remote rows into the local store.
 */
import type { Store } from "../db/contract";
import type { Menu, RecipeItem } from "../core/types";
import { getSupabase } from "./supabaseClient";

interface MenuRow {
  id: string;
  truck_id: string;
  name: string;
  sell_price: number;
  cost: number;
  category: string;
  sold_out: boolean;
  recipe_json: string | null;
  updated_at: number;
}

export async function syncMenus(store: Store, truckId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  // push local menus (idempotent upsert; server keeps the newest by our updated_at)
  const local = store.listMenus();
  if (local.length > 0) {
    const rows = local.map((m) => ({
      id: m.id,
      truck_id: truckId,
      name: m.name,
      sell_price: m.sellPrice,
      cost: m.cost,
      category: m.category,
      sold_out: m.soldOut,
      recipe_json: m.recipe && m.recipe.length > 0 ? JSON.stringify(m.recipe) : null,
      updated_at: m.updatedAt ?? Date.now(),
    }));
    const { error } = await sb.from("menu").upsert(rows, { onConflict: "id" });
    if (error) throw new Error(`menu push failed: ${error.message}`);
  }

  // pull + LWW merge
  const { data, error } = await sb.from("menu").select("*").eq("truck_id", truckId);
  if (error) throw new Error(`menu pull failed: ${error.message}`);
  for (const r of (data ?? []) as MenuRow[]) {
    const cur = store.getMenu(r.id);
    if (!cur || (r.updated_at ?? 0) > (cur.updatedAt ?? 0)) {
      const recipe: RecipeItem[] | undefined = r.recipe_json
        ? (JSON.parse(r.recipe_json) as RecipeItem[])
        : undefined;
      const merged: Menu = {
        id: r.id,
        name: r.name,
        sellPrice: r.sell_price,
        cost: r.cost,
        category: r.category,
        soldOut: r.sold_out,
        recipe: recipe && recipe.length > 0 ? recipe : undefined,
        updatedAt: r.updated_at,
      };
      store.upsertMenu(merged);
    }
  }
}
