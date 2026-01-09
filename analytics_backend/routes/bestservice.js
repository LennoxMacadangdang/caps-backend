// routes/productSales.js
import express from "express";
import { posSupabase } from "../supabaseClient.js";

const router = express.Router();

// GET /product-sales?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get("/", async (req, res) => {
  try {
    const { start, end } = req.query;

    // Build Supabase query with optional date filtering
    let query = posSupabase
      .from("orders")
      .select("item_details, order_date")
      .not("item_details", "is", null);

    if (start && end) {
      query = query.gte("order_date", start).lte("order_date", end);
    }

    const { data, error } = await query;
    if (error) throw error;

    const counts = {};

    data.forEach(order => {
      if (!order.item_details) return;

      let items;
      try {
        items = Array.isArray(order.item_details)
          ? order.item_details
          : JSON.parse(order.item_details);
        items = Array.isArray(items) ? items : [items];
      } catch (err) {
        console.warn("Failed to parse item_details:", err.message);
        return;
      }

      items.forEach(item => {
        if (!item || item.type?.toLowerCase() !== "service") return;

        const name = item.name;
        const qty = item.quantity || 1;

        // Initialize object if first time
        if (!counts[name]) counts[name] = { total_orders: 0, dates: [] };

        counts[name].total_orders += qty;
        counts[name].dates.push(order.order_date); // keep track of the date
      });
    });

    // Convert counts object to sorted array
    const result = Object.entries(counts)
      .map(([service_name, info]) => ({
        service_name,
        total_orders: info.total_orders,
        dates: info.dates
      }))
      .sort((a, b) => b.total_orders - a.total_orders);

    res.json({
      source: "POS",
      report: "Top Selling Services",
      filtered: !!(start && end),
      range: { start, end },
      data: result
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Failed to fetch service sales", details: err.message });
  }
});

export default router;
