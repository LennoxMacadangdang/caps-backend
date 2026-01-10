const express = require("express");
const router = express.Router();
const { supabase } = require("../supabase");
require("dotenv").config();

// Size → Variant mapping
const sizeToVariantMap = {
  small: 1,
  medium: 2,
  large: 3,
  xlarge: 4,
  xxlarge: 5,
};

// Update appointment status from upcoming → history and deduct stock
router.put("/updateAppointmentStatus/:id", async (req, res) => {
  const { id } = req.params;

  console.log("\n==============================");
  console.log("🟢 STARTING APPOINTMENT COMPLETION");
  console.log("Appointment ID:", id);
  console.log("==============================");

  try {
    // 1️⃣ Fetch appointment
    console.log("📥 Fetching appointment data...");

    const { data: appointment, error } = await supabase
      .from("appointments")
      .select(`
        appointment_id,
        service_id,
        car_size,
        status_id,
        services:service_id (service_name)
      `)
      .eq("appointment_id", id)
      .single();

    if (error) {
      console.error("❌ Supabase error while fetching appointment:", error);
      throw error;
    }

    if (!appointment) {
      console.warn("⚠️ Appointment not found");
      return res.status(404).json({ message: "Appointment not found" });
    }

    console.log("✅ Appointment fetched:", appointment);

    if (appointment.status_id !== 3) {
      console.warn(
        `⚠️ Invalid status: expected 3 (upcoming), got ${appointment.status_id}`
      );
      return res
        .status(400)
        .json({ message: "Only upcoming appointments can be completed" });
    }

    const variantId = sizeToVariantMap[appointment.car_size];
    console.log(
      `🔎 Car size: ${appointment.car_size} → Variant ID: ${variantId}`
    );

    if (!variantId) {
      console.error("❌ Invalid car size:", appointment.car_size);
      return res.status(400).json({ error: "Invalid car size" });
    }

    // 2️⃣ Fetch service-linked products
    console.log("📦 Fetching service-linked products...");

    const spResp = await fetch(
      `${process.env.INVENTORY_SUPABASE_URL}/rest/v1/service_products?service_id=eq.${appointment.service_id}&select=product_id,quantity,variant_id`,
      {
        headers: {
          apikey: process.env.INVENTORY_SUPABASE_KEY,
          Authorization: `Bearer ${process.env.INVENTORY_SUPABASE_KEY}`,
        },
      }
    );

    if (!spResp.ok) {
      const text = await spResp.text();
      console.error("❌ Failed to fetch service-linked products:", text);
      return res.status(500).json({
        error: "Failed to fetch service-linked products",
        details: text,
      });
    }

    const linkedProducts = await spResp.json();
    console.log("✅ Linked products:", linkedProducts);

    // 3️⃣ Get only the product for the selected size
    const linkedProduct = linkedProducts.find(
      (sp) => sp.variant_id === variantId
    );

    if (!linkedProduct) {
      console.error(
        `❌ No product configuration found for size ${appointment.car_size}`
      );
      return res.status(400).json({
        error: `No product configuration for ${appointment.car_size} size`,
      });
    }

    console.log("✅ Matched linked product:", linkedProduct);

    // 4️⃣ Fetch product stock
    console.log("📊 Fetching product stock...");

    const productResp = await fetch(
      `${process.env.INVENTORY_SUPABASE_URL}/rest/v1/products?product_id=eq.${linkedProduct.product_id}&select=product_id,stock,name`,
      {
        headers: {
          apikey: process.env.INVENTORY_SUPABASE_KEY,
          Authorization: `Bearer ${process.env.INVENTORY_SUPABASE_KEY}`,
        },
      }
    );

    const [product] = await productResp.json();

    if (!product) {
      console.error(
        `❌ Product not found: ID ${linkedProduct.product_id}`
      );
      return res.status(404).json({
        error: `Product ${linkedProduct.product_id} not found`,
      });
    }

    console.log(
      `✅ Product fetched: ${product.name} | Stock: ${product.stock}`
    );

    const requiredQty = linkedProduct.quantity;
    console.log(
      `🧮 Required quantity: ${requiredQty} | Available: ${product.stock}`
    );

    if (product.stock < requiredQty) {
      console.error(
        `❌ Insufficient stock for ${product.name}: ${product.stock} < ${requiredQty}`
      );
      return res.status(400).json({
        error: `Insufficient stock for ${product.name}`,
      });
    }

    // 5️⃣ Deduct stock
    const newStock = product.stock - requiredQty;
    console.log(
      `✂️ Deducting stock for ${product.name}: ${product.stock} → ${newStock}`
    );

    const updateResp = await fetch(
      `${process.env.INVENTORY_SUPABASE_URL}/rest/v1/products?product_id=eq.${linkedProduct.product_id}`,
      {
        method: "PATCH",
        headers: {
          apikey: process.env.INVENTORY_SUPABASE_KEY,
          Authorization: `Bearer ${process.env.INVENTORY_SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({ stock: newStock }),
      }
    );

    if (!updateResp.ok) {
      console.error(
        `❌ Failed to update stock for product ${product.product_id}`
      );
      return res
        .status(500)
        .json({ error: "Failed to update product stock" });
    }

    console.log("✅ Stock updated successfully");

    // 6️⃣ Update appointment → history
    console.log("📝 Updating appointment status to HISTORY...");

    const { data: updatedAppointment, error: updateError } = await supabase
      .from("appointments")
      .update({ status_id: 2 })
      .eq("appointment_id", id)
      .select();

    if (updateError) {
      console.error("❌ Failed to update appointment status:", updateError);
      throw updateError;
    }

    console.log("🎉 APPOINTMENT COMPLETED SUCCESSFULLY");
    console.log("Updated appointment:", updatedAppointment);
    console.log("==============================\n");

    res.status(200).json({
      message: "Appointment completed and stock deducted successfully",
      updatedAppointment,
    });
  } catch (err) {
    console.error("🔥 UNEXPECTED ERROR DURING APPOINTMENT COMPLETION");
    console.error("Error message:", err.message);
    console.error("Stack trace:", err.stack);
    console.log("==============================\n");

    res.status(500).json({
      message: "Error completing appointment",
      details: err.message,
    });
  }
});

module.exports = router;
