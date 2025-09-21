import { INVENTORY_KEY, POS_KEY } from "../config.js";

export function supabaseHeaders(key) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
}

export const INVENTORY_HEADERS = supabaseHeaders(INVENTORY_KEY);
export const POS_HEADERS = supabaseHeaders(POS_KEY);
