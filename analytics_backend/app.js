import express from "express";
import cors from "cors";            // <— add this
import salesRoutes from "./routes/sales.js";

const app = express();
const PORT = 7069;

// Allow requests from your frontend (React dev server on 3000, etc.)
app.use(cors());

app.use(express.json());

// Use the sales endpoint
app.use("/sales", salesRoutes);

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
