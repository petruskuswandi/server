import express from "express";
import mongoose from "mongoose";
import { authenticate } from "../middleware/authenticate.js";
import Cart from "../models/Cart.js";

const router = express.Router();

// Add to Cart
router.post("/add-to-cart", authenticate(["user"]), async (req, res) => {
  try {
    const { serviceId, qty } = req.body;

    // Validasi serviceId
    if (!mongoose.Types.ObjectId.isValid(serviceId)) {
      return res.status(400).json({ error: "Invalid serviceId" });
    }

    let cart = await Cart.findOne({ user: req.user._id });

    if (cart) {
      const serviceIndex = cart.services.findIndex(
        (s) => s.serviceId.toString() === serviceId
      );
      if (serviceIndex > -1) {
        // Jika layanan sudah ada, update jumlahnya
        cart.services[serviceIndex].qty += qty;
      } else {
        // Jika layanan belum ada, tambahkan baru
        cart.services.push({
          serviceId: new mongoose.Types.ObjectId(serviceId),
          qty,
        });
      }
      await cart.save();
    } else {
      // Jika cart belum ada, buat baru
      cart = await Cart.create({
        user: req.user._id,
        services: [{ serviceId: new mongoose.Types.ObjectId(serviceId), qty }],
      });
    }

    // Populate services untuk respons
    await cart.populate("services.serviceId");

    res.status(200).json({
      message: "Service added to cart successfully",
      cart,
    });
  } catch (error) {
    res.status(500).json({ error: "An error occurred while adding to cart" });
  }
});

// Get Cart
router.get("/my-cart", authenticate(["user"]), async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id }).populate(
      "services.serviceId"
    );

    if (!cart) {
      return res.status(404).json({ error: "Cart not found" });
    }

    res.status(200).json(cart);
  } catch (error) {
    res
      .status(500)
      .json({ error: "An error occurred while fetching the cart" });
  }
});

// Update Service Quantity
router.put(
  "/update-quantity/:serviceId",
  authenticate(["user"]),
  async (req, res) => {
    try {
      const { serviceId } = req.params;
      const { qty } = req.body;

      if (!mongoose.Types.ObjectId.isValid(serviceId)) {
        return res.status(400).json({ error: "Invalid serviceId" });
      }

      const cart = await Cart.findOne({ user: req.user._id });

      if (!cart) {
        return res.status(404).json({ error: "Cart not found" });
      }

      const serviceIndex = cart.services.findIndex(
        (service) => service.serviceId.toString() === serviceId
      );

      if (serviceIndex === -1) {
        return res.status(404).json({ error: "Service not found in cart" });
      }

      cart.services[serviceIndex].qty = qty;
      await cart.save();
      await cart.populate("services.serviceId");

      res
        .status(200)
        .json({ message: "Service quantity updated successfully", cart });
    } catch (error) {
      res.status(500).json({
        error: "An error occurred while updating the service quantity",
      });
    }
  }
);

// Remove Service from Cart
router.delete(
  "/remove-service/:serviceId",
  authenticate(["user"]),
  async (req, res) => {
    try {
      const { serviceId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(serviceId)) {
        return res.status(400).json({ error: "Invalid serviceId" });
      }

      const cart = await Cart.findOne({ user: req.user._id });

      if (!cart) {
        return res.status(404).json({ error: "Cart not found" });
      }

      cart.services = cart.services.filter(
        (service) => service.serviceId.toString() !== serviceId
      );

      await cart.save();
      await cart.populate("services.serviceId");

      res
        .status(200)
        .json({ message: "Service removed from cart successfully", cart });
    } catch (error) {
      res.status(500).json({
        error: "An error occurred while removing the service from cart",
      });
    }
  }
);

export default router;