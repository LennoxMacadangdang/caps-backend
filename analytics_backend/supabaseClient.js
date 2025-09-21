// supabaseClient.js
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.POS_SUPABASE_URL;
const supabaseKey = process.env.POS_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_KEY in .env file");
}

export const supabase = createClient(supabaseUrl, supabaseKey);
