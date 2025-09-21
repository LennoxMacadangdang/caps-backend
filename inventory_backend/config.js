import dotenv from "dotenv";
dotenv.config();

export const PORT = process.env.PORT || 8002;
export const INVENTORY_URL = process.env.INVENTORY_SUPABASE_URL;
export const INVENTORY_KEY = process.env.INVENTORY_SUPABASE_KEY;
export const POS_URL = process.env.POS_SUPABASE_URL;
export const POS_KEY = process.env.POS_SUPABASE_KEY;
export const BUCKET = process.env.SUPABASE_BUCKET || "payment_proof";
