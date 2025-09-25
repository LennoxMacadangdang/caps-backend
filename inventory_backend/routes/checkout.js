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
    console.log("=== ORDER PROCESSING STARTED ===");
    console.log("Request body:", JSON.stringify(req.body, null, 2));
    
    let items = req.body.items;
    if (!Array.isArray(items) || !items.length) {
      if (!cartData.length) return res.status(400).json({ error: "Cart is empty" });
      items = cartData;
    }

    console.log("Processing items:", JSON.stringify(items, null, 2));

    // Fetch products and services
    const productIds = items.filter(i => i.type === "product").map(i => i.id);
    const serviceIds = items.filter(i => i.type === "service").map(i => i.id);
    console.log("Product IDs:", productIds);
    console.log("Service IDs:", serviceIds);
    
    const productMap = productIds.length ? await fetchProductsByIds(productIds) : {};
    const serviceMap = serviceIds.length ? await fetchServicesByIds(serviceIds) : {};
    
    console.log("Product map:", JSON.stringify(productMap, null, 2));
    console.log("Service map:", JSON.stringify(serviceMap, null, 2));

    // Validate stock
    for (const item of items) {
      if (item.type === "product") {
        const product = productMap[item.id];
        console.log(`Validating product ${item.id}:`, product);
        if (!product) return res.status(404).json({ error: `Product ${item.id} not found` });
        if (product.stock < item.quantity) return res.status(400).json({ error: `Insufficient stock for ${product.name}` });
      } else if (item.type === "service") {
        const service = serviceMap[item.id];
        console.log(`Validating service ${item.id} with size ${item.size}:`, service);
        if (!service) return res.status(404).json({ error: `Service ${item.id} not found` });
        if (!item.size || !service[item.size]) return res.status(400).json({ error: `Invalid or missing size for service ${item.id}` });
      }
    }

    // Deduct stock for products
    const updatedProducts = [];
    for (const item of items.filter(i => i.type === "product")) {
      const product = productMap[item.id];
      const newStock = product.stock - item.quantity;
      console.log(`Updating product ${item.id}: stock ${product.stock} - ${item.quantity} = ${newStock}`);
      
      const updateResp = await fetch(`${INVENTORY_URL}/rest/v1/products?product_id=eq.${item.id}`, {
        method: "PATCH",
        headers: { ...supabaseHeaders(INVENTORY_KEY), "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({ stock: newStock }),
      });
      if (!updateResp.ok) return res.status(500).json({ error: `Failed to update stock for ${product.name}` });
      updatedProducts.push((await updateResp.json())[0]);
    }

    // Deduct stock for service-linked products
// Deduct stock for service-linked products
console.log("=== PROCESSING SERVICE LINKED PRODUCTS ===");
for (const serviceItem of items.filter(i => i.type === "service")) {
  console.log(`Processing service item:`, serviceItem);
  
  const resp = await fetch(
    `${INVENTORY_URL}/rest/v1/service_products?service_id=eq.${serviceItem.id}&select=product_id,quantity,variant_id`,
    { headers: supabaseHeaders(INVENTORY_KEY) }
  );
  if (!resp.ok) {
    console.error(`Failed to fetch linked products for service ${serviceItem.id}:`, resp.status, resp.statusText);
    return res.status(500).json({ error: `Failed to fetch linked products for service ${serviceItem.id}` });
  }

  const linked = await resp.json();
  console.log(`Linked products for service ${serviceItem.id}:`, JSON.stringify(linked, null, 2));

  // Map service size to variant_id
  const sizeToVariantMap = {
    small: 1,
    medium: 2, 
    large: 3,
    xlarge: 4,
    xxlarge: 5
  };

  const selectedVariantId = sizeToVariantMap[serviceItem.size];
  console.log(`Selected size: ${serviceItem.size}, mapped to variant ID: ${selectedVariantId}`);

  // Filter to only get the linked product for the selected size
  const relevantLinkedProduct = linked.find(sp => sp.variant_id === selectedVariantId);
  
  if (!relevantLinkedProduct) {
    console.error(`No linked product found for service ${serviceItem.id} with variant ID ${selectedVariantId} (size: ${serviceItem.size})`);
    return res.status(400).json({ error: `No product configuration found for ${serviceItem.size} size` });
  }

  console.log(`Relevant linked product for size ${serviceItem.size}:`, relevantLinkedProduct);

  // Fetch the main product stock
  const productResp = await fetch(
    `${INVENTORY_URL}/rest/v1/products?product_id=eq.${relevantLinkedProduct.product_id}&select=product_id,stock,name`,
    { headers: supabaseHeaders(INVENTORY_KEY) }
  );
  const [product] = await productResp.json();
  console.log(`Fetched product for ID ${relevantLinkedProduct.product_id}:`, product);

  if (!product) {
    console.error(`Product ${relevantLinkedProduct.product_id} not found for service ${serviceItem.id}`);
    return res.status(404).json({ error: `Product ${relevantLinkedProduct.product_id} not found for service ${serviceItem.id}` });
  }

  // Calculate total quantity (use the quantity from service_products table)
  const totalQty = relevantLinkedProduct.quantity * serviceItem.quantity;
  console.log(`Quantity calculation: ${relevantLinkedProduct.quantity} * ${serviceItem.quantity} = ${totalQty}`);

  console.log(`Stock check: product stock = ${product.stock}, required = ${totalQty}`);
  
  if (product.stock < totalQty) {
    console.error(`Insufficient stock: ${product.stock} < ${totalQty} for ${product.name}`);
    return res.status(400).json({ error: `Insufficient stock for ${product.name}` });
  }

  // Update stock in products
  const newStock = product.stock - totalQty;
  console.log(`Updating product ${relevantLinkedProduct.product_id}: ${product.stock} - ${totalQty} = ${newStock}`);
  
  const updateResp = await fetch(
    `${INVENTORY_URL}/rest/v1/products?product_id=eq.${relevantLinkedProduct.product_id}`,
    {
      method: "PATCH",
      headers: {
        ...supabaseHeaders(INVENTORY_KEY),
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify({ stock: newStock }),
    }
  );
  if (!updateResp.ok) {
    console.error(`Failed to update stock for ${product.name}:`, updateResp.status, updateResp.statusText);
    return res.status(500).json({ error: `Failed to update stock for ${product.name}` });
  }
  
  console.log(`Successfully updated stock for product ${relevantLinkedProduct.product_id}`);
}

    // Upload payment proof if present
    let paymentProofUrl = null;
    if (req.body.payment_proof) {
      console.log("Processing payment proof upload");
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
      if (!uploadResp.ok) {
        console.error("Failed to upload payment proof:", uploadResp.status, uploadResp.statusText);
        return res.status(500).json({ error: "Failed to upload payment proof" });
      }
      paymentProofUrl = `https://vfakjtbqucrxjzqketvj.supabase.co/storage/v1/object/public/${BUCKET}/${filename}`;
      console.log("Payment proof uploaded:", paymentProofUrl);
    }

    // Build order
    const totalAmount = items.reduce((sum, i) => i.type === "product" ? sum + (productMap[i.id]?.price || 0) * i.quantity : sum + (serviceMap[i.id]?.[i.size] || 0) * i.quantity, 0);
    console.log("Total amount calculated:", totalAmount);
    
    const orderData = {
      reference_number: req.body.reference_number,
      order_date: new Date().toISOString(),
      total_quantity: items.reduce((s, i) => s + i.quantity, 0),
      total_amount: totalAmount,
      items: items.map(i =>
        i.type === "product"
          ? `${i.quantity}x ${productMap[i.id]?.name || i.name} [product]`
          : `${i.quantity}x ${serviceMap[i.id]?.service_name || i.name} (${i.size}) [service]`
      ).join(", "),
      item_details: JSON.stringify(items),
      name: req.body.name || "POS Order",
      payment_method: req.body.payment_method || "cash",
      payment_proof: paymentProofUrl,
    };

    console.log("Order data to be inserted:", JSON.stringify(orderData, null, 2));

    // Insert into POS orders table
    const orderResp = await fetch(`${POS_URL}/rest/v1/orders`, {
      method: "POST",
      headers: { ...supabaseHeaders(POS_KEY), "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(orderData),
    });
    if (!orderResp.ok) {
      console.error("Failed to insert order:", orderResp.status, orderResp.statusText);
      const errorText = await orderResp.text();
      console.error("Error response:", errorText);
      return res.status(500).json({ error: "Failed to insert order" });
    }
    const insertedOrder = await orderResp.json();
    console.log("Order inserted successfully:", JSON.stringify(insertedOrder, null, 2));

    // Clear cart
    cartData.length = 0;
    rebuildCartText();
    console.log("Cart cleared");

    console.log("=== ORDER PROCESSING COMPLETED SUCCESSFULLY ===");
    res.json({ message: "Order submitted successfully!", updatedProducts, order: insertedOrder[0], proof_url: paymentProofUrl });
  } catch (err) {
    console.error("=== ORDER PROCESSING ERROR ===");
    console.error("Error:", err.message);
    console.error("Stack:", err.stack);
    res.status(500).json({ error: err.message });
  }
});

export default router;