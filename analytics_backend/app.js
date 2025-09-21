import express from "express";
import salesRoutes from "./routes/sales.js";

const app = express();
const PORT = 7069;

app.use(express.json());

// Use the sales endpoint
app.use("/sales", salesRoutes);

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
