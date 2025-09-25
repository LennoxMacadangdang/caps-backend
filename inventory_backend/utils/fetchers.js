import fetch from "node-fetch";
import { INVENTORY_URL } from "../config.js";
import { supabaseHeaders } from "./supabase.js";

async function fetchJSON(url) {
  const resp = await fetch(url, {
    headers: supabaseHeaders(process.env.INVENTORY_SUPABASE_KEY),
  });
  if (!resp.ok) {
    throw new Error(`Supabase fetch failed: ${resp.status} ${resp.statusText}`);
  }
  return resp.json();
}

// ----------------- Products -----------------
export async function fetchProductById(id) {
  const rows = await fetchJSON(
    `${INVENTORY_URL}/rest/v1/products?product_id=eq.${id}&select=*`
  );
  return rows[0] || null;
}

export async function fetchProductsByIds(ids) {
  if (!ids.length) return {};
  const rows = await fetchJSON(
    `${INVENTORY_URL}/rest/v1/products?product_id=in.(${ids.join(",")})&select=*`
  );
  return Object.fromEntries(rows.map((r) => [r.product_id, r]));
}

// ----------------- Services -----------------
export async function fetchServiceById(id) {
  const rows = await fetchJSON(
    `${INVENTORY_URL}/rest/v1/services?service_id=eq.${id}&select=*`
  );
  return rows[0] || null;
}

export async function fetchServicesByIds(ids) {
  if (!ids.length) return {};
  const rows = await fetchJSON(
    `${INVENTORY_URL}/rest/v1/services?service_id=in.(${ids.join(",")})&select=*`
  );
  return Object.fromEntries(rows.map((r) => [r.service_id, r]));
}

// ----------------- Service_Products (NEW) -----------------
export async function fetchServiceProducts(serviceId) {
  const rows = await fetchJSON(
    `${INVENTORY_URL}/rest/v1/service_products?service_id=eq.${serviceId}&select=product_id,quantity,variant_id`
  );
  return rows; // returns all linked products for this service
}
