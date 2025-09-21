import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import ordersRouter from "./routes/orders.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 7003;

app.use(cors());
app.use(express.json());

// Use orders routes
app.use("/api/orders", ordersRouter);

app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
