// supabaseClient.js
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

/* =======================
   POS SUPABASE CLIENT
======================= */
const posUrl = process.env.POS_SUPABASE_URL;
const posKey = process.env.POS_SUPABASE_KEY;

if (!posUrl || !posKey) {
  throw new Error("Missing POS_SUPABASE_URL or POS_SUPABASE_KEY in .env");
}

export const posSupabase = createClient(posUrl, posKey);

/* ==============================
   APPOINTMENT SUPABASE CLIENT
============================== */
const appointmentUrl = process.env.APPOINTMENT_SUPABASE_URL;
const appointmentKey = process.env.APPOINTMENT_SUPABASE_KEY;

if (!appointmentUrl || !appointmentKey) {
  throw new Error(
    "Missing APPOINTMENT_SUPABASE_URL or APPOINTMENT_SUPABASE_KEY in .env"
  );
}

export const appointmentSupabase = createClient(
  appointmentUrl,
  appointmentKey
);
