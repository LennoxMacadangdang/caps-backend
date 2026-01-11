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

// Update appointment status and deduct stock
router.put("/updateAppointmentStatus/:id", async (req, res) => {
  const { id } = req.params;

  console.log("\n==============================");
  console.log("🟢 STARTING APPOINTMENT COMPLETION");
  console.log("Appointment ID:", id);
  console.log("==============================");

  try {
    // 1️⃣ Fetch appointment
    const { data: appointment, error } = await supabase
      .from("appointments")
      .select(`
        appointment_id,
        service_id,
        car_size,
        status_id,
        date,
        time_id,
        services:service_id (service_name)
      `)
      .eq("appointment_id", id)
      .single();

    if (error) throw error;
    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    if (appointment.status_id !== 3) {
      return res
        .status(400)
        .json({ message: "Only upcoming appointments can be completed" });
    }

    // 2️⃣ Fetch working hour
    const { data: timeData, error: timeError } = await supabase
      .from("working_hours")
      .select("time")
      .eq("time_id", appointment.time_id)
      .single();

    if (timeError || !timeData) {
      return res.status(404).json({ message: "Working hour not found" });
    }

    const time = timeData.time;
    const date = appointment.date;

    // 3️⃣ Map car size → variant
    const variantId = sizeToVariantMap[appointment.car_size];
    if (!variantId) {
      return res.status(400).json({ error: "Invalid car size" });
    }

    // 4️⃣ Fetch service-linked products
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
      return res.status(500).json({ error: "Failed to fetch service products" });
    }

    const linkedProducts = await spResp.json();

    // ✅ FIX: get ALL products for the selected size
    const relevantProducts = linkedProducts.filter(
      (sp) => sp.variant_id === variantId
    );

    if (!relevantProducts.length) {
      return res.status(400).json({
        error: `No product configuration for ${appointment.car_size} size`,
      });
    }

    // 5️⃣ Pre-check stock for ALL linked products
    for (const link of relevantProducts) {
      const productResp = await fetch(
        `${process.env.INVENTORY_SUPABASE_URL}/rest/v1/products?product_id=eq.${link.product_id}&select=product_id,stock,name`,
        {
          headers: {
            apikey: process.env.INVENTORY_SUPABASE_KEY,
            Authorization: `Bearer ${process.env.INVENTORY_SUPABASE_KEY}`,
          },
        }
      );

      const [product] = await productResp.json();

      if (!product) {
        return res
          .status(404)
          .json({ error: `Product ${link.product_id} not found` });
      }

      if (product.stock < link.quantity) {
        return res.status(400).json({
          error: `Insufficient stock for ${product.name}`,
        });
      }
    }

    // 6️⃣ Deduct stock for ALL linked products
    for (const link of relevantProducts) {
      const productResp = await fetch(
        `${process.env.INVENTORY_SUPABASE_URL}/rest/v1/products?product_id=eq.${link.product_id}&select=product_id,stock`,
        {
          headers: {
            apikey: process.env.INVENTORY_SUPABASE_KEY,
            Authorization: `Bearer ${process.env.INVENTORY_SUPABASE_KEY}`,
          },
        }
      );

      const [product] = await productResp.json();
      const newStock = product.stock - link.quantity;

      const updateResp = await fetch(
        `${process.env.INVENTORY_SUPABASE_URL}/rest/v1/products?product_id=eq.${link.product_id}`,
        {
          method: "PATCH",
          headers: {
            apikey: process.env.INVENTORY_SUPABASE_KEY,
            Authorization: `Bearer ${process.env.INVENTORY_SUPABASE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ stock: newStock }),
        }
      );

      if (!updateResp.ok) {
        return res.status(500).json({
          error: `Failed to update stock for product ${link.product_id}`,
        });
      }
    }

    // 7️⃣ Update appointment status
    const { error: updateError } = await supabase
      .from("appointments")
      .update({ status_id: 2 })
      .eq("appointment_id", id);

    if (updateError) throw updateError;

    // 8️⃣ Insert into history_appointments
    const { error: historyError } = await supabase
      .from("history_appointments")
      .insert({
        appointment_id: appointment.appointment_id,
        date,
        time,
      });

    if (historyError) {
      return res
        .status(500)
        .json({ message: "Failed to insert history appointment" });
    }

    console.log("🎉 APPOINTMENT COMPLETED SUCCESSFULLY");
    console.log("==============================\n");

    res.status(200).json({
      message: "Appointment completed and stock deducted successfully",
    });
  } catch (err) {
    console.error("🔥 ERROR:", err.message);
    res.status(500).json({
      message: "Error completing appointment",
      details: err.message,
    });
  }
});

module.exports = router;
