import express from "express";
import { fetchServiceById } from "../utils/fetchers.js";
import { INVENTORY_URL, INVENTORY_KEY } from "../config.js";
import { supabaseHeaders } from "../utils/supabase.js";

const router = express.Router();

router.get("/", async (_req, res) => {
  try {
    const response = await fetch(`${INVENTORY_URL}/rest/v1/services?select=*`, {
      headers: supabaseHeaders(INVENTORY_KEY)
    });
    res.json(await response.json());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const service = await fetchServiceById(req.params.id);
    if (!service) return res.status(404).json({ error: "Service not found" });
    res.json(service);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
