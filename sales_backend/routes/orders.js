import express from "express";
import fetch from "node-fetch";
import { SUPABASE_URL, TABLE_NAME, headers } from "../config/supabase.js";

const router = express.Router();

// GET all orders
router.get("/", async (req, res) => {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/${TABLE_NAME}?select=order_id,order_date,total_quantity,total_amount,items,name,payment_method,payment_proof`,
      { headers }
    );
    const text = await response.text();
    if (!response.ok) throw new Error(text);

    const data = JSON.parse(text);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET single order
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/${TABLE_NAME}?order_id=eq.${id}&select=order_id,order_date,total_quantity,total_amount,items,name,payment_method,payment_proof`,
      { headers }
    );
    const text = await response.text();
    if (!response.ok) throw new Error(text);

    const data = JSON.parse(text);
    if (!data.length) return res.status(404).json({ error: `Order ${id} not found` });

    res.json(data[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// UPDATE order
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const updatedData = req.body;

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE_NAME}?order_id=eq.${id}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(updatedData),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(text);

    const data = JSON.parse(text);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE order
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE_NAME}?order_id=eq.${id}`, {
      method: "DELETE",
      headers,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text);
    }

    res.json({ message: `Order ${id} deleted successfully` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
