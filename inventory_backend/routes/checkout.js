import express from "express";
import fetch from "node-fetch";
import { randomBytes } from "node:crypto";
import { cartData, rebuildCartText } from "./cart.js";
import { fetchProductsByIds, fetchServicesByIds } from "../utils/fetchers.js";
import { INVENTORY_URL, INVENTORY_KEY, POS_URL, POS_KEY, BUCKET } from "../config.js";
import { supabaseHeaders } from "../utils/supabase.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    let items = req.body.items;
    if (!Array.isArray(items) || !items.length) {
      if (!cartData.length) return res.status(400).json({ error: "Cart is empty" });
      items = cartData;
    }

    // Fetch products and services
    const productIds = items.filter(i => i.type === "product").map(i => i.id);
    const serviceIds = items.filter(i => i.type === "service").map(i => i.id);
    const productMap = productIds.length ? await fetchProductsByIds(productIds) : {};
    const serviceMap = serviceIds.length ? await fetchServicesByIds(serviceIds) : {};

    // Validate stock
    for (const item of items) {
      if (item.type === "product") {
        const product = productMap[item.id];
        if (!product) return res.status(404).json({ error: `Product ${item.id} not found` });
        if (product.stock < item.quantity) return res.status(400).json({ error: `Insufficient stock for ${product.name}` });
      } else if (item.type === "service") {
        const service = serviceMap[item.id];
        if (!service) return res.status(404).json({ error: `Service ${item.id} not found` });
        if (!item.size || !service[item.size]) return res.status(400).json({ error: `Invalid or missing size for service ${item.id}` });
      }
    }

    // Deduct stock for products
    const updatedProducts = [];
    for (const item of items.filter(i => i.type === "product")) {
      const product = productMap[item.id];
      const newStock = product.stock - item.quantity;
      const updateResp = await fetch(`${INVENTORY_URL}/rest/v1/products?product_id=eq.${item.id}`, {
        method: "PATCH",
        headers: { ...supabaseHeaders(INVENTORY_KEY), "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({ stock: newStock }),
      });
      if (!updateResp.ok) return res.status(500).json({ error: `Failed to update stock for ${product.name}` });
      updatedProducts.push((await updateResp.json())[0]);
    }

    // Deduct stock for service-linked products
    for (const serviceItem of items.filter(i => i.type === "service")) {
      const resp = await fetch(`${INVENTORY_URL}/rest/v1/service_products?service_id=eq.${serviceItem.id}&select=product_id,quantity_used`, { headers: supabaseHeaders(INVENTORY_KEY) });
      if (!resp.ok) return res.status(500).json({ error: `Failed to fetch linked products for service ${serviceItem.id}` });
      const linked = await resp.json();

      for (const sp of linked) {
        const productResp = await fetch(`${INVENTORY_URL}/rest/v1/products?product_id=eq.${sp.product_id}&select=product_id,stock,name`, { headers: supabaseHeaders(INVENTORY_KEY) });
        const [product] = await productResp.json();
        if (!product) return res.status(404).json({ error: `Product ${sp.product_id} not found for service ${serviceItem.id}` });
        const totalQty = sp.quantity_used * serviceItem.quantity;
        if (product.stock < totalQty) return res.status(400).json({ error: `Insufficient stock for ${product.name}` });

        const updateResp = await fetch(`${INVENTORY_URL}/rest/v1/products?product_id=eq.${sp.product_id}`, {
          method: "PATCH",
          headers: { ...supabaseHeaders(INVENTORY_KEY), "Content-Type": "application/json", Prefer: "return=representation" },
          body: JSON.stringify({ stock: product.stock - totalQty }),
        });
        if (!updateResp.ok) return res.status(500).json({ error: `Failed to update stock for ${product.name}` });
      }
    }

    // Upload payment proof if present
    let paymentProofUrl = null;
    if (req.body.payment_proof) {
      const match = req.body.payment_proof.match(/^data:(image\/\w+);base64,(.+)$/);
      if (!match) return res.status(400).json({ error: "Invalid image format. Must be base64 data URI." });
      const mimeType = match[1];
      const ext = mimeType.split("/")[1];
      const buffer = Buffer.from(match[2], "base64");
      const filename = `order-${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`;

      const uploadResp = await fetch(`https://vfakjtbqucrxjzqketvj.supabase.co/storage/v1/object/${BUCKET}/${filename}`, {
        method: "PUT",
        headers: { "Content-Type": mimeType, Authorization: `Bearer ${POS_KEY}` },
        body: buffer,
      });
      if (!uploadResp.ok) return res.status(500).json({ error: "Failed to upload payment proof" });
      paymentProofUrl = `https://vfakjtbqucrxjzqketvj.supabase.co/storage/v1/object/public/${BUCKET}/${filename}`;
    }

    // Build order
    const totalAmount = items.reduce((sum, i) => i.type === "product" ? sum + (productMap[i.id]?.price || 0) * i.quantity : sum + (serviceMap[i.id]?.[i.size] || 0) * i.quantity, 0);
    const orderData = {
      order_date: new Date().toISOString(),
      total_quantity: items.reduce((s, i) => s + i.quantity, 0),
      total_amount: totalAmount,
      items: items.map(i => i.type === "product" ? `${i.quantity}x ${productMap[i.id]?.name || i.name} [product]` : `${i.quantity}x ${serviceMap[i.id]?.service_name || i.name} (${i.size}) [service]`).join(", "),
      item_details: JSON.stringify(items),
      name: req.body.name || "POS Order",
      payment_method: req.body.payment_method || "cash",
      payment_proof: paymentProofUrl,
    };

    // Insert into POS orders table
    const orderResp = await fetch(`${POS_URL}/rest/v1/orders`, {
      method: "POST",
      headers: { ...supabaseHeaders(POS_KEY), "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(orderData),
    });
    if (!orderResp.ok) return res.status(500).json({ error: "Failed to insert order" });
    const insertedOrder = await orderResp.json();

    // Clear cart
    cartData.length = 0;
    rebuildCartText();

    res.json({ message: "Order submitted successfully!", updatedProducts, order: insertedOrder[0], proof_url: paymentProofUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
