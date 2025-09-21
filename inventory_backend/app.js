import express from "express";
import cors from "cors";
import productsRoutes from "./routes/products.js";
import servicesRoutes from "./routes/services.js";
import cartRoutes from "./routes/cart.js";
import checkoutRoutes from "./routes/checkout.js";
import { PORT } from "./config.js";


const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

app.use("/products", productsRoutes);
app.use("/services", servicesRoutes);
app.use("/cart", cartRoutes);
app.use("/checkout", checkoutRoutes); 

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
