const express = require("express");
const router = express.Router();
const { supabase } = require("../supabase");
require("dotenv").config();

// Update appointment status from upcoming -> history and deduct stock
router.put("/approveAppointment/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // 1️⃣ Get appointment
    const { data: appointment, error: checkError } = await supabase
      .from("appointments")
      .select(`
        appointment_id, service_id, car_size,
        date, time_id, status_id,
        services:service_id (service_name)
      `)
      .eq("appointment_id", id)
      .single();

    if (checkError) throw checkError;
    if (!appointment) return res.status(404).json({ message: "Appointment not found" });
    if (appointment.status_id !== 1) {
      return res.status(400).json({ message: "Only upcoming appointments can be updated" });
    }

    // 3️⃣ Update appointment status → history
    const { data: updated, error } = await supabase
      .from("appointments")
      .update({ status_id: 3 })
      .eq("appointment_id", id)
      .select();

    if (error) throw error;

    res.status(200).json({ message: "Appointment updated to history and stocks deducted", updated });
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ message: "Error completing appointment", details: err.message });
  }
})
;module.exports = router;  // ✅ THIS IS REQUIRED