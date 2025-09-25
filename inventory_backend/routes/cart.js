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
  cartData = cartData
    .map((item) => {
      if (String(item.id) === String(id) && item.type === type) {
        if (type === "service" && size && item.size !== size) return item;

        if (item.quantity > 1) {
          itemFound = true;
          return { ...item, quantity: item.quantity - 1 };
        } else {
          itemFound = true;
          return null; // remove item
        }
      }
      return item;
    })
    .filter(Boolean);

  rebuildCartText();
  if (!itemFound)
    return res.status(404).json({ error: "Item not found in cart" });

  res.json({ message: "One item removed", cart: cartData });
});


// ---------------- Add to Cart ----------------
router.post("/addtocart", async (req, res) => {
  try {
    const { id, type, quantity = 1, size, name, price } = req.body;
    if (!id || !type)
      return res.status(400).json({ error: "Missing id or type" });

    if (type === "product") {
      let productName = name;
      let productPrice = price;
      let productStock = null;

      if (!productName || !productPrice) {
        const productMap = await fetchProductsByIds([id]);
        const product =
          productMap[String(id)] || // ✅ force string lookup
          Object.values(productMap).find(
            (p) => String(p.product_id) === String(id)
          );

        if (!product)
          return res.status(404).json({ error: `Product ${id} not found` });

        productName = product.name;
        productPrice = product.price;
        productStock = product.stock;
      }

      if (productStock !== null && productStock < quantity) {
        return res.status(400).json({
          error: `Insufficient stock for ${productName}`,
        });
      }

      cartData.push({
        id: Number(id), // ✅ store as number for consistency
        type,
        name: productName,
        price: productPrice,
        quantity,
      });
    }

    else if (type === "service") {
      let serviceName = name;
      let servicePrice = price;
      let finalSize = size;

      if (!serviceName || !servicePrice) {
        const serviceMap = await fetchServicesByIds([id]);
        const service =
          serviceMap[id] ||
          Object.values(serviceMap).find(
            (s) => String(s.service_id) === String(id)
          );

        if (!service)
          return res.status(404).json({ error: `Service ${id} not found` });

        if (!finalSize) {
          const availableSizes = ["small", "medium", "large"].filter(
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

      cartData.push({
        id,
        type,
        name: serviceName,
        size: finalSize,
        price: servicePrice,
        quantity,
      });
    }

    else {
      return res
        .status(400)
        .json({ error: "Invalid type. Must be 'product' or 'service'." });
    }

    rebuildCartText();
    res.json({ message: "Item added to cart", cart: cartData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


export { cartData, cartText };
export default router;
