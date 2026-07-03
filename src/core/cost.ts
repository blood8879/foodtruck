import type { Menu, RecipeItem } from "./types";

/** Sum of recipe ingredient costs (unitPrice × qty). */
export function recipeCost(recipe: RecipeItem[] | undefined): number {
  if (!recipe || recipe.length === 0) return 0;
  return recipe.reduce((sum, r) => sum + r.unitPrice * r.qty, 0);
}

/**
 * Effective cost for a menu: derived from the recipe when present, otherwise the
 * manually entered `cost`.
 */
export function effectiveCost(menu: Pick<Menu, "cost" | "recipe">): number {
  if (menu.recipe && menu.recipe.length > 0) return recipeCost(menu.recipe);
  return menu.cost;
}

/** Cost ratio = cost / sellPrice (0 when sellPrice is 0). */
export function costRatio(sellPrice: number, cost: number): number {
  if (sellPrice <= 0) return 0;
  return cost / sellPrice;
}

/** Margin (won) = sellPrice − effective cost. */
export function margin(menu: Pick<Menu, "sellPrice" | "cost" | "recipe">): number {
  return menu.sellPrice - effectiveCost(menu);
}

/** Cost ratio threshold for the green/gold chip in the design (≤40% green). */
export const COST_RATIO_OK = 0.4;

export function costRatioIsHealthy(ratio: number): boolean {
  return ratio <= COST_RATIO_OK;
}
