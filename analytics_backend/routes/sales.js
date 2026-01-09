// routes/sales.js
import express from "express";
import { posSupabase } from "../supabaseClient.js";

const router = express.Router();

// GET /sales?start=2025-01-01&end=2025-01-31
router.get("/", async (req, res) => {
  try {
    const { start, end } = req.query;

    let query = posSupabase.from("orders").select("total_amount, order_date");

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

// GET /sales/daily?start=2025-01-01&end=2025-01-31
router.get("/daily", async (req, res) => {
  try {
    const { start, end } = req.query;

    let query = posSupabase
      .from("orders")
      .select("total_amount, order_date");

    // Apply date filter if start and end are provided
    if (start && end) {
      query = query.gte("order_date", start).lte("order_date", end);
    }

    const { data, error } = await query;

    if (error) return res.status(400).json({ error: error.message });

    // Group by date and calculate totals
    const dailyData = data.reduce((acc, order) => {
      const date = order.order_date.split('T')[0]; // Get just the date part
      
      if (!acc[date]) {
        acc[date] = {
          date: date,
          total_sales: 0,
          total_orders: 0
        };
      }
      
      acc[date].total_sales += order.total_amount;
      acc[date].total_orders += 1;
      
      return acc;
    }, {});

    // Convert to array and sort by date
    const result = Object.values(dailyData).sort((a, b) => 
      new Date(a.date) - new Date(b.date)
    );

    res.json({
      data: result,
      count: result.length,
      filtered: !!(start && end),
      range: { start, end }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;