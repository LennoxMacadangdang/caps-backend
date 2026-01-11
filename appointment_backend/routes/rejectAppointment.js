const express = require("express");
const router = express.Router();
const { supabase } = require("../supabase");

router.put("/rejectAppointment/:id", async (req, res) => {
  const { id } = req.params;
  const { reply_id } = req.body; // expects 1, 2, or 3

  try {
    // Validate reply_id
    if (![1, 2, 3].includes(reply_id)) {
      return res.status(400).json({
        message: "Invalid reply_id. Allowed values are 1, 2, or 3."
      });
    }

    // Check if appointment exists
    const { data: existing, error: checkError } = await supabase
      .from("appointments")
      .select("status_id")
      .eq("appointment_id", id)
      .single();

    if (checkError) throw checkError;
    if (!existing) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    // Already rejected
    if (existing.status_id === 4) {
      return res.status(400).json({ message: "Appointment already rejected" });
    }

    // 🔹 Build update payload conditionally
    const updateData = {
      status_id: 4, // rejected
      reply_id: reply_id
    };

    // ✅ Only clear date & time when reply_id === 3
    if (reply_id === 3) {
      updateData.date = null;
      updateData.time_id = null;
    }

    // Reject appointment
    const { data, error } = await supabase
      .from("appointments")
      .update(updateData)
      .eq("appointment_id", id)
      .select();

    if (error) throw error;

    res.status(200).json({
      message: "Appointment rejected successfully",
      rejected: data
    });

  } catch (err) {
    console.error("❌ Error rejecting appointment:", err.message);
    res.status(500).json({ message: "Error rejecting appointment" });
  }
});

module.exports = router;
