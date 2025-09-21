import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import supabase from "../supabaseClient.js";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

// -------------------- Register --------------------
router.post("/register", async (req, res) => {
  try {
    const { username, password, email } = req.body;
    if (!username || !password || !email) {
      return res.status(400).json({ error: "Username, email, and password are required" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const { data, error } = await supabase
      .from("users")
      .insert([{ username, email, password: hashedPassword }])
      .select();

    if (error) return res.status(400).json({ error: error.message });

    res.json({ message: "User registered successfully", user: data[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------- Login --------------------
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const { data: users, error } = await supabase
      .from("users")
      .select("*")
      .eq("username", username)
      .limit(1);

    if (error) return res.status(400).json({ error: error.message });

    const user = users[0];
    if (!user) return res.status(401).json({ error: "Invalid username or password" });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ error: "Invalid username or password" });

    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({ message: "Login successful", token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
