import express from "express";
import fetch from "node-fetch";
import { randomBytes } from "node:crypto";
import { cartData } from "./cart.js";
import { fetchProductsByIds, fetchServicesByIds } from "../utils/fetchers.js";
import {
  INVENTORY_URL,
  INVENTORY_KEY,
  POS_URL,
  POS_KEY,
  BUCKET
} from "../config.js";
import { supabaseHeaders } from "../utils/supabase.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    let items = req.body.items;

    if (!Array.isArray(items) || !items.length) {
      if (!cartData.length) return res.status(400).json({ error: "Cart is empty" });
      items = cartData;
    }

    /* ===============================
       FETCH PRODUCTS & SERVICES
    =============================== */
    const productIds = items.filter(i => i.type === "product").map(i => i.id);
    const serviceIds = items.filter(i => i.type === "service").map(i => i.id);

    const productMap = productIds.length ? await fetchProductsByIds(productIds) : {};
    const serviceMap = serviceIds.length ? await fetchServicesByIds(serviceIds) : {};

    /* ===============================
       VALIDATE STOCK
    =============================== */
    for (const item of items) {
      if (item.type === "product") {
        const product = productMap[item.id];
        if (!product) return res.status(404).json({ error: `Product ${item.id} not found` });
        if (product.stock < item.quantity)
          return res.status(400).json({ error: `Insufficient stock for ${product.name}` });
      }

      if (item.type === "service") {
        const service = serviceMap[item.id];
        if (!service || !service[item.size])
          return res.status(400).json({ error: `Invalid size for service ${item.name || item.id}` });
      }
    }

    /* ===============================
       DEDUCT PRODUCT STOCK
    =============================== */
    for (const item of items.filter(i => i.type === "product")) {
      const product = productMap[item.id];
      const newStock = product.stock - item.quantity;

      const resp = await fetch(`${INVENTORY_URL}/rest/v1/products?product_id=eq.${item.id}`, {
        method: "PATCH",
        headers: {
          ...supabaseHeaders(INVENTORY_KEY),
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify({ stock: newStock })
      });

      if (!resp.ok) return res.status(500).json({ error: `Failed to update stock for ${product.name}` });
    }

    /* ===============================
       DEDUCT SERVICE-LINKED PRODUCTS
    =============================== */
    const sizeToVariantMap = { small: 1, medium: 2, large: 3, xlarge: 4, xxlarge: 5 };

    for (const serviceItem of items.filter(i => i.type === "service")) {
      const variantId = sizeToVariantMap[serviceItem.size];

      const resp = await fetch(
        `${INVENTORY_URL}/rest/v1/service_products?service_id=eq.${serviceItem.id}&select=product_id,quantity,variant_id`,
        { headers: supabaseHeaders(INVENTORY_KEY) }
      );

      if (!resp.ok) return res.status(500).json({ error: "Failed to fetch service inventory" });

      const linkedProducts = (await resp.json()).filter(sp => sp.variant_id === variantId);

      for (const link of linkedProducts) {
        const productResp = await fetch(
          `${INVENTORY_URL}/rest/v1/products?product_id=eq.${link.product_id}&select=product_id,stock,name`,
          { headers: supabaseHeaders(INVENTORY_KEY) }
        );

        const product = (await productResp.json())[0];
        if (!product) return res.status(404).json({ error: `Product ${link.product_id} not found` });

        const totalQty = link.quantity * serviceItem.quantity;
        if (product.stock < totalQty)
          return res.status(400).json({ error: `Insufficient stock for ${product.name}` });

        await fetch(`${INVENTORY_URL}/rest/v1/products?product_id=eq.${link.product_id}`, {
          method: "PATCH",
          headers: {
            ...supabaseHeaders(INVENTORY_KEY),
            "Content-Type": "application/json",
            Prefer: "return=representation"
          },
          body: JSON.stringify({ stock: product.stock - totalQty })
        });
      }
    }

    /* ===============================
       UPLOAD PAYMENT PROOF
    =============================== */
    let paymentProofUrl = null;
    if (req.body.payment_proof) {
      const [, mime, data] = req.body.payment_proof.match(/^data:(image\/\w+);base64,(.+)$/);
      const ext = mime.split("/")[1];
      const filename = `order-${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`;

      await fetch(`https://vfakjtbqucrxjzqketvj.supabase.co/storage/v1/object/${BUCKET}/${filename}`, {
        method: "PUT",
        headers: { "Content-Type": mime, Authorization: `Bearer ${POS_KEY}` },
        body: Buffer.from(data, "base64")
      });

      paymentProofUrl = `https://vfakjtbqucrxjzqketvj.supabase.co/storage/v1/object/public/${BUCKET}/${filename}`;
    }

    /* ===============================
       BUILD FINAL ORDER
    =============================== */
    const totalAmount = items.reduce(
      (sum, i) =>
        i.type === "product"
          ? sum + productMap[i.id].price * i.quantity
          : sum + serviceMap[i.id][i.size] * i.quantity,
      0
    );

    // Enrich items with name from request or product/service map
    const item_details = items.map(i => {
      if (i.type === "product") {
        const p = productMap[i.id];
        return { ...i, name: p.name, price: p.price };
      } else {
        return { ...i, name: i.name, price: serviceMap[i.id][i.size] };
      }
    });

    // Generate human-readable text for `items` column
    const itemsText = item_details
      .map(i =>
        i.type === "product"
          ? `Product: ${i.name} x${i.quantity} @ ₱${i.price}`
          : `Service: ${i.name} (${i.size}) x${i.quantity} @ ₱${i.price}`
      )
      .join("\n");

    const orderResp = await fetch(`${POS_URL}/rest/v1/orders`, {
      method: "POST",
      headers: {
        ...supabaseHeaders(POS_KEY),
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        reference_number: req.body.reference_number,
        order_date: new Date().toISOString(),
        total_quantity: items.reduce((s, i) => s + i.quantity, 0),
        total_amount: totalAmount,
        items: itemsText,                  // TEXT column
        item_details: JSON.stringify(item_details), // JSONB column with names
        payment_method: req.body.payment_method || "cash",
        payment_proof: paymentProofUrl
      })
    });

    const [order] = await orderResp.json();
    cartData.length = 0;

    res.json({ message: "Order submitted successfully", order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
