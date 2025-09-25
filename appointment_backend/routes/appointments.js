const express = require("express");
const router = express.Router();
const { supabase } = require("../supabase");

// Get all upcoming appointments
router.get("/getAllUpcomingAppointments", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("appointments")
      .select(`
        appointment_id, date, car_size, price, paymentMethod,
        created_at, paymentProof, vehicleBrand, vehicleModel, vehicleColor,
        services:service_id (service_name), 
        status:status_id (status_name), 
        working_hours:time_id (time)
      `)
      .eq("status_id", 1)
      .order("date", { ascending: true });

    if (error) throw error;

    const formatted = data.map(appt => ({
      appointment_id: appt.appointment_id,
      service_name: appt.services?.service_name || null,
      status: appt.status?.status_name || null,
      date: appt.date,
      time: appt.working_hours?.time || null,
      car_size: appt.car_size,
      price: appt.price,
      vehicleBrand: appt.vehicleBrand,
      vehicleModel: appt.vehicleModel,
      vehicleColor: appt.vehicleColor,
      payment_method: appt.paymentMethod,
      paymentProof: appt.paymentProof,
      created_at: appt.created_at,
    }));

    res.status(200).json({ upcoming_appointments: formatted });
  } catch (err) {
    console.error("❌ Error:", err.message);
    res.status(500).json({ message: "Error fetching upcoming appointments" });
  }
});

// Get all history appointments
router.get("/getAllHistoryAppointments", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("appointments")
      .select(`
        appointment_id, date, car_size, price, paymentMethod,
        created_at, paymentProof, vehicleBrand, vehicleModel, vehicleColor,
        services:service_id (service_name), 
        status:status_id (status_name), 
        working_hours:time_id (time)
      `)
      .in("status_id", [2])
      .order("date", { ascending: true });

    if (error) throw error;

    const formatted = data.map(appt => ({
      appointment_id: appt.appointment_id,
      service_name: appt.services?.service_name || null,
      status: appt.status?.status_name || null,
      date: appt.date,
      time: appt.working_hours?.time || null,
      car_size: appt.car_size,
      price: appt.price,
      vehicleBrand: appt.vehicleBrand,
      vehicleModel: appt.vehicleModel,
      vehicleColor: appt.vehicleColor,
      payment_method: appt.paymentMethod,
      paymentProof: appt.paymentProof,
      created_at: appt.created_at,
    }));

    res.status(200).json({ history_appointments: formatted });
  } catch (err) {
    console.error("❌ Error:", err.message);
    res.status(500).json({ message: "Error fetching history appointments" });
  }
});

module.exports = router;
