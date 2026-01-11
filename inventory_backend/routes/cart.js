import express from "express";
import { fetchProductsByIds, fetchServicesByIds } from "../utils/fetchers.js";

const router = express.Router();

// In-memory cart
let cartData = [];
let cartText = [];

// ---------------- Helper: rebuild cartText ----------------
export function rebuildCartText() {
  cartText = cartData.map(
    (i) => `${i.quantity}x ${i.name} [${i.type}${i.size ? ` - ${i.size}` : ""}]`
  );
}

// ---------------- Get Cart ----------------
router.get("/", (_req, res) => res.json({ cart: cartText, items: cartData }));

// ---------------- Clear Cart ----------------
router.post("/clear", (_req, res) => {
  cartData = [];
  rebuildCartText();
  res.json({ message: "Cart cleared", cart: cartText });
});

// ---------------- Remove one item ----------------
router.post("/remove-one", (req, res) => {
  const { id, type, size } = req.body;
  if (!id || !type) return res.status(400).json({ error: "Missing id or type" });

  let itemFound = false;
  cartData = cartData.filter((item) => {
    // Match by id, type, and size (for services)
    const isMatch = String(item.id) === String(id) && 
                    item.type === type &&
                    (type !== "service" || !size || item.size === size);
    
    if (isMatch) {
      itemFound = true;
      return false; // Remove the entire item from cart
    }
    return true; // Keep other items
  });

  rebuildCartText();
  if (!itemFound)
    return res.status(404).json({ error: "Item not found in cart" });

  res.json({ message: "Item removed from cart", cart: cartData });
});


// ---------------- Add to Cart ----------------
router.post("/addtocart", async (req, res) => {
  try {
    const { id, type, quantity = 1, size, name, price } = req.body;
    
    console.log("📥 Add to cart request:", { id, type, quantity, size, name, price });
    
    if (!id || !type)
      return res.status(400).json({ error: "Missing id or type" });

    if (type === "product") {
      let productName = name;
      let productPrice = price;
      let productStock = null;

      // Fetch product details if not provided
      if (!productName || !productPrice) {
        const productMap = await fetchProductsByIds([id]);
        const product =
          productMap[String(id)] ||
          Object.values(productMap).find(
            (p) => String(p.product_id) === String(id)
          );

        if (!product)
          return res.status(404).json({ error: `Product ${id} not found` });

        productName = product.name;
        productPrice = product.price;
        productStock = product.stock;
      }

      // Check stock availability
      if (productStock !== null && productStock < quantity) {
        return res.status(400).json({
          error: `Insufficient stock for ${productName}`,
        });
      }

      // ✅ FIX: Check if product already exists in cart
      const existingItemIndex = cartData.findIndex(
        (item) => String(item.id) === String(id) && item.type === "product"
      );

      if (existingItemIndex !== -1) {
        // Update existing item quantity
        cartData[existingItemIndex].quantity += quantity;
        console.log(`✅ Updated existing product: ${productName}, new quantity: ${cartData[existingItemIndex].quantity}`);
      } else {
        // Add new item to cart
        cartData.push({
          id: Number(id),
          type,
          name: productName,
          price: productPrice,
          quantity,
        });
        console.log(`✅ Added new product to cart: ${productName}, quantity: ${quantity}`);
      }
    }

    else if (type === "service") {
      let serviceName = name;
      let servicePrice = price;
      let finalSize = size;

      // Fetch service details if not provided
      if (!serviceName || !servicePrice) {
        const serviceMap = await fetchServicesByIds([id]);
        const service =
          serviceMap[id] ||
          Object.values(serviceMap).find(
            (s) => String(s.service_id) === String(id)
          );

        if (!service)
          return res.status(404).json({ error: `Service ${id} not found` });

        // Determine size if not provided
        if (!finalSize) {
          const availableSizes = ["small", "medium", "large", "xlarge", "xxlarge"].filter(
            (k) => service[k] != null
          );
          if (!availableSizes.length) {
            return res.status(400).json({
              error: `No valid sizes found for service ${service.service_name}`,
            });
          }
          finalSize = availableSizes[0];
        }

        if (!service[finalSize]) {
          return res.status(400).json({
            error: `Invalid size '${finalSize}' for service ${service.service_name}`,
          });
        }

        serviceName = service.service_name;
        servicePrice = service[finalSize];
      }

      // ✅ FIX: Check if service with same size already exists in cart
      const existingItemIndex = cartData.findIndex(
        (item) => 
          String(item.id) === String(id) && 
          item.type === "service" && 
          item.size === finalSize
      );

      if (existingItemIndex !== -1) {
        // Update existing item quantity
        cartData[existingItemIndex].quantity += quantity;
        console.log(`✅ Updated existing service: ${serviceName} (${finalSize}), new quantity: ${cartData[existingItemIndex].quantity}`);
      } else {
        // Add new item to cart
        cartData.push({
          id,
          type,
          name: serviceName,
          size: finalSize,
          price: servicePrice,
          quantity,
        });
        console.log(`✅ Added new service to cart: ${serviceName} (${finalSize}), quantity: ${quantity}`);
      }
    }

    else {
      return res
        .status(400)
        .json({ error: "Invalid type. Must be 'product' or 'service'." });
    }

    rebuildCartText();
    console.log("📦 Current cart:", cartData);
    res.json({ message: "Item added to cart", cart: cartData });
  } catch (err) {
    console.error("❌ Add to cart error:", err);
    res.status(500).json({ error: err.message });
  }
});


export { cartData, cartText };
export default router;