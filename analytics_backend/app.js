import "dotenv/config"; // <--- ADD THIS LINE VERY FIRST!
import express from "express";
import cors from "cors";            
import salesRoutes from "./routes/sales.js";
import bestproductRoutes from "./routes/bestproduct.js"; 
import bestserviceRoutes from "./routes/bestservice.js"; 
import forecastsalesRoutes from "./routes/forecastsales.js"; 
import forecastinsightRoutes from "./routes/forecastinsight.js"; 
import appointmentsalesRoutes from "./routes/appointmentsales.js"; 

const app = express();
const PORT = 7069;

// Allow requests from frontend (React dev server, etc.)
app.use(cors());

app.use(express.json());

// Use the sales endpoints
app.use("/sales", salesRoutes);
app.use("/bestproduct", bestproductRoutes); // <— mount product sales
app.use("/bestservice", bestserviceRoutes); // <— mount bestservice sales
app.use("/forecastsales", forecastsalesRoutes); // <— mount bestservice sales
app.use("/forecastinsight", forecastinsightRoutes); // <— mount bestservice sales
app.use("/appointmentsales", appointmentsalesRoutes);

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
