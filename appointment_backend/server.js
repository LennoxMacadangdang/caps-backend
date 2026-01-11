const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");

// Load environment
dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// Routes
app.use(require("./routes/appointments"));
app.use(require("./routes/updateAppointment"));
app.use(require("./routes/cancelAppointment"));
app.use(require("./routes/approveAppointments")); // ✅ REQUIRED
app.use(require("./routes/rejectAppointment"));


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
