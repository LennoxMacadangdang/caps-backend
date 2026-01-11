import express from "express";
import { fetchServiceById } from "../utils/fetchers.js";
import { INVENTORY_URL, INVENTORY_KEY } from "../config.js";
import { supabaseHeaders } from "../utils/supabase.js";

const router = express.Router();

/**
 * GET all services (combined)
 * - Marks services as "(Unavailable)" if stock is insufficient
 */
router.get("/", async (_req, res) => {
  try {
    const response = await fetch(`${INVENTORY_URL}/rest/v1/services?select=*,service_products(quantity,products(stock)),services_category(category_name)`, {
      headers: supabaseHeaders(INVENTORY_KEY)
    });
    const services = await response.json();

    // Process services to mark unavailable ones
    const processedServices = services.map(service => {
      let hasStock = true;
      if (service.service_products?.length > 0) {
        hasStock = service.service_products.every(
          sp => sp.products && sp.products.stock >= sp.quantity
        );
      }

      return {
        ...service,
        service_name: hasStock ? service.service_name : `${service.service_name} (Unavailable)`,
        active: hasStock
      };
    });

    // Remove service_products before sending
    const cleanedData = processedServices.map(({ service_products, ...rest }) => rest);

    res.status(200).json({ services: cleanedData });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Error fetching services" });
  }
});

/**
 * GET a single service by ID
 */
router.get("/:id", async (req, res) => {
  try {
    const service = await fetchServiceById(req.params.id);

    if (!service) return res.status(404).json({ error: "Service not found" });

    // Check stock
    let hasStock = true;
    if (service.service_products?.length > 0) {
      hasStock = service.service_products.every(
        sp => sp.products && sp.products.stock >= sp.quantity
      );
    }

    const cleanedService = {
      ...service,
      service_name: hasStock ? service.service_name : `${service.service_name} (Unavailable)`,
      active: hasStock,
      service_products: undefined
    };

    res.status(200).json(cleanedService);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
