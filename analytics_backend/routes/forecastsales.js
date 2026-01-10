import express from "express";
import { posSupabase } from "../supabaseClient.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

const router = express.Router();

// Gemini init
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash-lite",
  generationConfig: {
    responseMimeType: "application/json"
  }
});

// GET /forecastsales?start=YYYY-MM-DD&end=YYYY-MM-DD&days=XX
router.get("/", async (req, res) => {
  try {
    const { start, end, days } = req.query;

    // ⏱ Forecast control (max 6 months)
    const MAX_DAYS = 180;
    const forecastDays = Math.min(Number(days) || MAX_DAYS, MAX_DAYS);

    // 📅 Forecast starts after selected end date
    const forecastStartDate = end ? new Date(end) : new Date();
    forecastStartDate.setDate(forecastStartDate.getDate() + 1);
    const forecastStart = forecastStartDate.toISOString().split("T")[0];

    // 📦 Fetch historical orders
    let query = posSupabase
      .from("orders")
      .select("item_details, order_date")
      .not("item_details", "is", null);

    if (start && end) {
      query = query.gte("order_date", start).lte("order_date", end);
    }

    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });

    // 📊 Build product revenue history
    const productsMap = {};

    data.forEach(order => {
      let items;
      try {
        items = Array.isArray(order.item_details)
          ? order.item_details
          : JSON.parse(order.item_details);
        items = Array.isArray(items) ? items : [items];
      } catch {
        return;
      }

      items.forEach(item => {
        if (!item || item.type?.toLowerCase() !== "product") return;

        const date = order.order_date.split("T")[0];
        const revenue = (item.quantity || 1) * (item.price || 0);

        if (!productsMap[item.name]) {
          productsMap[item.name] = [];
        }

        productsMap[item.name].push({ date, revenue });
      });
    });

    // 🤖 Generate forecasts (UI-safe structure)
    const forecastResults = await Promise.all(
      Object.entries(productsMap).map(async ([product, history]) => {
        const prompt = `
You are an AI sales forecaster.

Historical daily revenue for "${product}":
${JSON.stringify(history)}

Forecast DAILY revenue starting from ${forecastStart}
for the next ${forecastDays} days.

Return ONLY raw JSON:
[
  { "date": "YYYY-MM-DD", "predicted_revenue": number }
]
`;

        try {
          const result = await model.generateContent(prompt);
          return {
            product,
            forecast: JSON.parse(result.response.text())
          };
        } catch {
          return { product, forecast: [] };
        }
      })
    );

    // ✅ UI-compatible response
    res.json({
      data: forecastResults,
      count: forecastResults.length,
      filtered: !!(start && end),
      range: { start, end },
      forecast_start: forecastStart,
      forecast_days: forecastDays
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
