const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

// Main Appointments DB
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Inventory DB
const inventorySupabase = createClient(
  process.env.INVENTORY_SUPABASE_URL,
  process.env.INVENTORY_SUPABASE_KEY
);

module.exports = { supabase, inventorySupabase };
