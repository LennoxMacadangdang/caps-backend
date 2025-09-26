const express = require("express");
const router = express.Router();
const { supabase } = require("../supabase");
require("dotenv").config();

// Update appointment status from upcoming -> history and deduct stock
router.put("/updateAppointmentStatus/:id", async (req, res) => {
  const { id } = req.params;

  try {
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

    if (checkError) throw checkError;
    if (!appointment) return res.status(404).json({ message: "Appointment not found" });
    if (appointment.status_id !== 3) {
      return res.status(400).json({ message: "Only upcoming appointments can be updated" });
    }

    // 2️⃣ Fetch linked stocks
    const resp = await fetch(
      `${process.env.INVENTORY_SUPABASE_URL}/rest/v1/service_products?service_id=eq.${appointment.service_id}&select=product_id,quantity_used`,
      {
        headers: {
          apikey: process.env.INVENTORY_SUPABASE_KEY,
          Authorization: `Bearer ${process.env.INVENTORY_SUPABASE_KEY}`
        }
      }
    );

    if (!resp.ok) {
      const text = await resp.text();
      return res.status(500).json({ error: "Failed to fetch linked products", details: text });
    }

    const linked = await resp.json();

    for (const sp of linked) {
      // Fetch product info
      const productResp = await fetch(
        `${process.env.INVENTORY_SUPABASE_URL}/rest/v1/products?product_id=eq.${sp.product_id}&select=product_id,stock,name`,
        {
          headers: {
            apikey: process.env.INVENTORY_SUPABASE_KEY,
            Authorization: `Bearer ${process.env.INVENTORY_SUPABASE_KEY}`
          }
        }
      );

      const [product] = await productResp.json();
      if (!product) return res.status(404).json({ error: `Product ${sp.product_id} not found` });

      if (product.stock < sp.quantity_used) {
        return res.status(400).json({ error: `Insufficient stock for ${product.name}` });
      }

      // Deduct stock
      await fetch(
        `${process.env.INVENTORY_SUPABASE_URL}/rest/v1/products?product_id=eq.${sp.product_id}`,
        {
          method: "PATCH",
          headers: {
            apikey: process.env.INVENTORY_SUPABASE_KEY,
            Authorization: `Bearer ${process.env.INVENTORY_SUPABASE_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=representation"
          },
          body: JSON.stringify({ stock: product.stock - sp.quantity_used })
        }
      );
    }

    // 3️⃣ Update appointment status → history
    const { data: updated, error } = await supabase
      .from("appointments")
      .update({ status_id: 2 })
      .eq("appointment_id", id)
      .select();

    if (error) throw error;

    res.status(200).json({ message: "Appointment updated to history and stocks deducted", updated });
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ message: "Error completing appointment", details: err.message });
  }
});

module.exports = router;
