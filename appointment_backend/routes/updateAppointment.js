const express = require("express");
const router = express.Router();
const { supabase } = require("../supabase");
require("dotenv").config();

// Update appointment status from upcoming -> history and deduct stock
router.put("/updateAppointmentStatus/:id", async (req, res) => {
  const { id } = req.params;

  try {
    console.log("=== PROCESSING APPOINTMENT COMPLETION ===");
    console.log("Appointment ID:", id);

    // 1️⃣ Get appointment
    const { data: appointment, error: checkError } = await supabase
      .from("appointments")
      .select(`
        appointment_id, service_id, car_size, vehicleBrand, vehicleModel, vehicleColor,
        date, time_id, status_id,
        services:service_id (service_name)
      `)
      .eq("appointment_id", id)
      .single();

    if (checkError) {
      console.error("Error fetching appointment:", checkError);
      throw checkError;
    }
    if (!appointment) {
      console.error("Appointment not found for ID:", id);
      return res.status(404).json({ message: "Appointment not found" });
    }
    
    console.log("Appointment data:", JSON.stringify(appointment, null, 2));
    
    if (appointment.status_id !== 3) {
      console.error("Invalid status - only upcoming appointments can be updated. Current status:", appointment.status_id);
      return res.status(400).json({ message: "Only upcoming appointments can be updated" });
    }

    // 2️⃣ Fetch linked stocks WITH variant_id
    console.log("Fetching linked products for service ID:", appointment.service_id);
    const resp = await fetch(
      `${process.env.INVENTORY_SUPABASE_URL}/rest/v1/service_products?service_id=eq.${appointment.service_id}&select=product_id,quantity,variant_id`,
      {
        headers: {
          apikey: process.env.INVENTORY_SUPABASE_KEY,
          Authorization: `Bearer ${process.env.INVENTORY_SUPABASE_KEY}`
        }
      }
    );

    if (!resp.ok) {
      const text = await resp.text();
      console.error("Failed to fetch linked products:", resp.status, resp.statusText, text);
      return res.status(500).json({ error: "Failed to fetch linked products", details: text });
    }

    const linked = await resp.json();
    console.log("All linked products found:", JSON.stringify(linked, null, 2));

    // Map car_size to variant_id
    const sizeToVariantMap = {
      small: 1,
      medium: 2, 
      large: 3,
      xlarge: 4,
      xxlarge: 5
    };

    const selectedVariantId = sizeToVariantMap[appointment.car_size];
    console.log(`Car size: ${appointment.car_size}, mapped to variant ID: ${selectedVariantId}`);

    if (!selectedVariantId) {
      console.error(`Invalid car size: ${appointment.car_size}. Valid sizes:`, Object.keys(sizeToVariantMap));
      return res.status(400).json({ error: `Invalid car size: ${appointment.car_size}` });
    }

    // Filter to only get the linked product for the selected car size
    const relevantLinkedProduct = linked.find(sp => sp.variant_id === selectedVariantId);

    if (!relevantLinkedProduct) {
      console.error(`No linked product found for service ${appointment.service_id} with variant ID ${selectedVariantId} (car size: ${appointment.car_size})`);
      console.error("Available linked products variant IDs:", linked.map(sp => sp.variant_id));
      return res.status(400).json({ error: `No product configuration found for ${appointment.car_size} car size` });
    }

    console.log(`Relevant linked product for car size ${appointment.car_size}:`, relevantLinkedProduct);

    // Fetch product info
    console.log(`Fetching product info for ID: ${relevantLinkedProduct.product_id}`);
    const productResp = await fetch(
      `${process.env.INVENTORY_SUPABASE_URL}/rest/v1/products?product_id=eq.${relevantLinkedProduct.product_id}&select=product_id,stock,name`,
      {
        headers: {
          apikey: process.env.INVENTORY_SUPABASE_KEY,
          Authorization: `Bearer ${process.env.INVENTORY_SUPABASE_KEY}`
        }
      }
    );

    if (!productResp.ok) {
      const text = await productResp.text();
      console.error("Failed to fetch product:", productResp.status, productResp.statusText, text);
      return res.status(500).json({ error: "Failed to fetch product information", details: text });
    }

    const [product] = await productResp.json();
    console.log("Fetched product:", product);

    if (!product) {
      console.error(`Product ${relevantLinkedProduct.product_id} not found`);
      return res.status(404).json({ error: `Product ${relevantLinkedProduct.product_id} not found` });
    }

    console.log(`Stock check: product stock = ${product.stock}, required = ${relevantLinkedProduct.quantity_used}`);

    if (product.stock < relevantLinkedProduct.quantity_used) {
      console.error(`Insufficient stock: ${product.stock} < ${relevantLinkedProduct.quantity_used} for ${product.name}`);
      return res.status(400).json({ error: `Insufficient stock for ${product.name}` });
    }

    // Deduct stock
    const newStock = product.stock - relevantLinkedProduct.quantity_used;
    console.log(`Updating product ${relevantLinkedProduct.product_id}: ${product.stock} - ${relevantLinkedProduct.quantity_used} = ${newStock}`);

    const updateResp = await fetch(
      `${process.env.INVENTORY_SUPABASE_URL}/rest/v1/products?product_id=eq.${relevantLinkedProduct.product_id}`,
      {
        method: "PATCH",
        headers: {
          apikey: process.env.INVENTORY_SUPABASE_KEY,
          Authorization: `Bearer ${process.env.INVENTORY_SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify({ stock: newStock })
      }
    );

    if (!updateResp.ok) {
      const text = await updateResp.text();
      console.error("Failed to update stock:", updateResp.status, updateResp.statusText, text);
      return res.status(500).json({ error: `Failed to update stock for ${product.name}`, details: text });
    }

    console.log(`Successfully updated stock for product ${product.name}`);

    // 3️⃣ Update appointment status → history
    console.log("Updating appointment status to 'history' (status_id: 2)");
    const { data: updated, error } = await supabase
      .from("appointments")
      .update({ status_id: 2 })
      .eq("appointment_id", id)
      .select();

    if (error) {
      console.error("Error updating appointment status:", error);
      throw error;
    }

    console.log("Appointment successfully updated:", JSON.stringify(updated, null, 2));
    console.log("=== APPOINTMENT COMPLETION PROCESSING FINISHED ===");

    res.status(200).json({ 
      message: "Appointment updated to history and stocks deducted", 
      updated,
      stockDeducted: {
        product: product.name,
        quantityUsed: relevantLinkedProduct.quantity_used,
        previousStock: product.stock,
        newStock: newStock
      }
    });
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ message: "Error completing appointment", details: err.message });
  }
});

module.exports = router;