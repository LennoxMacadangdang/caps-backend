import express from "express";
import { posSupabase } from "../supabaseClient.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

const router = express.Router();

// Use lighter model for summaries
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash-lite",
  generationConfig: { responseMimeType: "application/json" }
});

const MAX_RANGE_DAYS = 180; // 6 months max per request

router.get("/", async (req, res) => {
  try {
    const { start, end } = req.query;

    // ---- 1. Validate date range ----
    if (start && end) {
      const diffDays =
        (new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24);
      if (diffDays > MAX_RANGE_DAYS) {
        return res.status(400).json({
          error: "Date range too large. Max allowed is 6 months."
        });
      }
    }

    // ---- 2. Fetch data ----
    let query = posSupabase
      .from("orders")
      .select("item_details, order_date")
      .not("item_details", "is", null);

    if (start && end) {
      query = query.gte("order_date", start).lte("order_date", end);
    }

    const { data, error } = await query;
    if (error) throw error;

    // ---- 3. Aggregate (CRITICAL) ----
    const summaryMap = {};

    for (const order of data) {
      let items;
      try {
        items = Array.isArray(order.item_details)
          ? order.item_details
          : JSON.parse(order.item_details);
      } catch {
        continue;
      }

      if (!Array.isArray(items)) items = [items];

      for (const item of items) {
        if (!item?.name) continue;

        const key = `${item.type || "unknown"}:${item.name}`;
        if (!summaryMap[key]) {
          summaryMap[key] = {
            name: item.name,
            type: item.type || "unknown",
            total_quantity: 0,
            total_revenue: 0,
            first_seen: order.order_date,
            last_seen: order.order_date
          };
        }

        const qty = item.quantity || 1;
        const price = item.price || 0;

        summaryMap[key].total_quantity += qty;
        summaryMap[key].total_revenue += qty * price;
        summaryMap[key].first_seen =
          summaryMap[key].first_seen < order.order_date
            ? summaryMap[key].first_seen
            : order.order_date;
        summaryMap[key].last_seen =
          summaryMap[key].last_seen > order.order_date
            ? summaryMap[key].last_seen
            : order.order_date;
      }
    }

    const summarizedItems = Object.values(summaryMap);

    // ---- 4. No-AI fallback ----
    if (summarizedItems.length === 0) {
      return res.json({
        insights: ["No sufficient data available for analysis."]
      });
    }

    // ---- 5. AI Prompt (SMALL & SAFE) ----
    const prompt = `
You are a business analytics AI.

Below is summarized sales data (already aggregated):
${JSON.stringify(summarizedItems)}

Provide insights focusing on:
- Best-selling products/services
- Trends or usage patterns
- Opportunities for improvement
- Potential issues or anomalies

Return ONLY valid JSON:
{
  "insights": ["..."]
}
`;

    let insights = [];

    try {
      const result = await model.generateContent(prompt);
      const text = await result.response.text();
      insights = JSON.parse(text)?.insights || [];
    } catch (aiError) {
      console.error("Gemini quota or parsing error:", aiError.message);
      insights.push(
        "AI insights are temporarily unavailable. Showing system-generated summary only."
      );
    }

    // ---- 6. Response ----
    res.json({
      source: "POS",
      report: "Sales & Service Insights",
      filtered: Boolean(start && end),
      range: { start, end },
      items_analyzed: summarizedItems.length,
      insights
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Failed to generate insights",
      details: err.message
    });
  }
});

export default router;
