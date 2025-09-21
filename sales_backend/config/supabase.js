import dotenv from "dotenv";
dotenv.config();

export const SUPABASE_URL = process.env.POS_SUPABASE_URL;
export const SUPABASE_KEY = process.env.POS_SUPABASE_KEY;
export const TABLE_NAME = "orders";

export const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
};
