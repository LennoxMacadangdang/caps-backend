import fetch from "node-fetch";
import { INVENTORY_URL } from "../config.js";
import { supabaseHeaders } from "./supabase.js";

export async function fetchProductById(id) {
  const resp = await fetch(`${INVENTORY_URL}/rest/v1/products?product_id=eq.${id}&category_id=eq.3&select=*`, {
    headers: supabaseHeaders(process.env.INVENTORY_SUPABASE_KEY)
  });
  const rows = await resp.json();
  return rows[0] || null;
}

export async function fetchProductsByIds(ids) {
  if (!ids.length) return {};
  const resp = await fetch(`${INVENTORY_URL}/rest/v1/products?product_id=in.(${ids.join(",")})&category_id=eq.3&select=*`, {
    headers: supabaseHeaders(process.env.INVENTORY_SUPABASE_KEY)
  });
  const rows = await resp.json();
  return Object.fromEntries(rows.map(r => [r.product_id, r]));
}

export async function fetchServiceById(id) {
  const resp = await fetch(`${INVENTORY_URL}/rest/v1/services?service_id=eq.${id}&select=*`, {
    headers: supabaseHeaders(process.env.INVENTORY_SUPABASE_KEY)
  });
  const rows = await resp.json();
  return rows[0] || null;
}

export async function fetchServicesByIds(ids) {
  if (!ids.length) return {};
  const resp = await fetch(`${INVENTORY_URL}/rest/v1/services?service_id=in.(${ids.join(",")})&select=*`, {
    headers: supabaseHeaders(process.env.INVENTORY_SUPABASE_KEY)
  });
  const rows = await resp.json();
  return Object.fromEntries(rows.map(r => [r.service_id, r]));
}
