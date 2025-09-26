const express = require("express");
const router = express.Router();
const { supabase } = require("../supabase");

router.put("/cancelAppointment/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const { data: existing, error: checkError } = await supabase
      .from("appointments")
      .select("status_id")
      .eq("appointment_id", id)
      .single();

    if (checkError) throw checkError;
    if (!existing) return res.status(404).json({ message: "Appointment not found" });
    if (existing.status_id === 5) return res.status(400).json({ message: "Appointment already cancelled" });

    const { data, error } = await supabase
      .from("appointments")
      .update({
        status_id: 5,
        date: null,
        time_id: null
      })
      .eq("appointment_id", id)
      .select();

    if (error) throw error;

    res.status(200).json({ message: "Appointment cancelled successfully", cancelled: data });
  } catch (err) {
    console.error("❌ Error cancelling appointment:", err.message);
    res.status(500).json({ message: "Error cancelling appointment" });
  }
});

module.exports = router;
