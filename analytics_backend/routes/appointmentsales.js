import express from "express";
import { appointmentSupabase } from "../supabaseClient.js";

const router = express.Router();

// Analytics for completed appointments
router.get("/", async (req, res) => {
  try {
    const { data, error } = await appointmentSupabase
      .from("appointments")
      .select(`
        appointment_id,
        date,
        price,
        car_size,
        services:service_id (service_name),
        working_hours:time_id (time)
      `)
      .eq("status_id", 2); // completed

    if (error) throw error;

    const dailyTrends = {};
    const carSizeTrends = {};
    const serviceTrends = {};
    const timeSlotTrends = {};
    let totalRevenue = 0;

    data.forEach(a => {
      const date = a.date;
      const price = Number(a.price) || 0;

      // Daily trends
      if (!dailyTrends[date]) {
        dailyTrends[date] = { count: 0, revenue: 0 };
      }
      dailyTrends[date].count++;
      dailyTrends[date].revenue += price;

      // Car size
      carSizeTrends[a.car_size] = (carSizeTrends[a.car_size] || 0) + 1;

      // Service
      const service = a.services?.service_name || "Unknown";
      serviceTrends[service] = (serviceTrends[service] || 0) + 1;

      // Time slot
      const time = a.working_hours?.time || "Unknown";
      timeSlotTrends[time] = (timeSlotTrends[time] || 0) + 1;

      totalRevenue += price;
    });

    res.json({
      summary: {
        totalAppointments: data.length,
        totalRevenue
      },
      trends: {
        dailyTrends,
        carSizeTrends,
        serviceTrends,
        timeSlotTrends
      }
    });
  } catch (err) {
    console.error("❌ Appointment analytics error:", err.message);
    res.status(500).json({ message: "Failed to load appointment analytics" });
  }
});

export default router;
