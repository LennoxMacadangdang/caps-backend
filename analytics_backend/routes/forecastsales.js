import express from "express";
import { posSupabase } from "../supabaseClient.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

const router = express.Router();

// Initialize Gemini 2.5
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Use the recommended Gemini 2.5 model
const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash", // ✅ updated from retired Gemini 1.5 series
  generationConfig: { responseMimeType: "application/json" }
});

router.get("/", async (req, res) => {
  try {
    const { start, end, days = 7 } = req.query;

    // Fetch orders from Supabase
    let query = posSupabase
      .from("orders")
      .select("item_details, order_date")
      .not("item_details", "is", null);

    if (start && end) query = query.gte("order_date", start).lte("order_date", end);

    const { data, error } = await query;
    if (error) throw error;

    // Prepare product data
    const productsData = {};
    data.forEach(order => {
      if (!order.item_details) return;

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
        const name = item.name;
        const qty = item.quantity || 1;
        const price = item.price || 0;
        const revenue = qty * price;
        const date = order.order_date;

        if (!productsData[name]) productsData[name] = [];
        productsData[name].push({ date, revenue });
      });
    });

    // Generate forecasts in parallel
    const forecastEntries = await Promise.all(
      Object.entries(productsData).map(async ([product, records]) => {
        const prompt = `
          You are an AI sales forecaster. Here is historical daily revenue for the product "${product}":
          ${JSON.stringify(records)}

          Predict revenue for the next ${days} days based on trends and seasonality.
          
          Return ONLY a raw JSON array with this exact structure:
          [
            {"date": "YYYY-MM-DD", "predicted_revenue": number}, ...
          ]
        `;

        try {
          const result = await model.generateContent(prompt);
          const text = result.response.text();
          return [product, JSON.parse(text)];
        } catch (e) {
          console.error(`Error forecasting for ${product}:`, e);
          return [product, []]; // fallback
        }
      })
    );

    const forecast = Object.fromEntries(forecastEntries);

    res.json({
      source: "POS",
      report: "Product Revenue Forecast (Gemini 2.5-Powered)",
      filtered: !!(start && end),
      range: { start, end },
      forecast
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Failed to fetch AI forecast", details: err.message });
  }
});

export default router;
