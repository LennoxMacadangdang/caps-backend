import express from "express";
import { fetchProductById } from "../utils/fetchers.js";
import { INVENTORY_URL, INVENTORY_KEY } from "../config.js";
import { supabaseHeaders } from "../utils/supabase.js";

const router = express.Router();

router.get("/", async (_req, res) => {
  try {
    const response = await fetch(`${INVENTORY_URL}/rest/v1/products?category_id=eq.3&select=*`, {
      headers: supabaseHeaders(INVENTORY_KEY)
    });
    res.json(await response.json());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const product = await fetchProductById(req.params.id);
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
