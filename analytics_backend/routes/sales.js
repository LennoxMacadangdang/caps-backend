// routes/sales.js
import express from "express";
import { supabase } from "../supabaseClient.js";

const router = express.Router();

// GET /sales?start=2025-01-01&end=2025-01-31
router.get("/", async (req, res) => {
  try {
    const { start, end } = req.query;

    let query = supabase.from("orders").select("total_amount, order_date");

    // Apply date filter if start and end are provided
    if (start && end) {
      query = query.gte("order_date", start).lte("order_date", end);
    }

    const { data, error } = await query;

    if (error) return res.status(400).json({ error: error.message });

    // Calculate total sales
    const totalSales = data.reduce((sum, order) => sum + order.total_amount, 0);

    res.json({
      totalSales,
      count: data.length,
      filtered: !!(start && end),
      range: { start, end }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
