import express from "express";
import midtransClient from "midtrans-client";
import { authenticate } from "../middleware/authenticate.js";
import Order from "../models/Order.js";

const router = express.Router();

router.post(
  "/process-transaction",
  authenticate(["user"]),
  async (req, res) => {
    try {
      const snap = new midtransClient.Snap({
        isProduction: false,
        serverKey: process.env.SERVER_KEY,
        clientKey: process.env.CLIENT_KEY,
      });

      const { user } = req;
      const { orderId } = req.body;

      if (!orderId) {
        return res.status(400).json({ error: "Missing orderId" });
      }

      const order = await Order.findOne({ orderId });
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      if (order.user.toString() !== user._id.toString()) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const amount = order.total;
      const { paymentMethod } = order;

      const validPaymentTypes = Order.schema.path("paymentMethod").enumValues;
      if (!validPaymentTypes.includes(paymentMethod)) {
        return res.status(400).json({ error: "Invalid payment type" });
      }

      const parameter = {
        transaction_details: {
          order_id: orderId,
          gross_amount: amount,
        },
        customer_details: {
          first_name: user.name,
          email: user.username,
          phone: user.phone,
        },
        callbacks: {
          finish: `${process.env.DOMAIN}/confirmation`,
        },
        enabled_payments: [paymentMethod],
      };

      const transaction = await snap.createTransaction(parameter);

      order.midtransResponse = JSON.stringify(transaction);
      await order.save();

      res.status(200).json({
        token: transaction.token,
        redirectUrl: transaction.redirect_url,
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
);

router.get(
  "/status/:orderId",
  authenticate(["admin", "user"]),
  async (req, res) => {
    try {
      const snap = new midtransClient.Snap({
        isProduction: false,
        serverKey: process.env.SERVER_KEY,
        clientKey: process.env.CLIENT_KEY,
      });

      snap.transaction
        .status(req.params.orderId)
        .then(async (response) => {
          const order = await Order.findOne({ orderId: req.params.orderId });

          order.paymentStatus = response.transaction_status;

          await order.save();

          let message = "";
          switch (order.paymentStatus) {
            case "settlement":
              message = "Pembayaran diterima";
              break;
            case "pending":
              message = "Menunggu pembayaran";
              break;
            case "expire":
              message = "Pembayaran kadaluarsa";
              break;
            case "cancel":
              message = "Pembayaran dibatalkan";
              break;
            case "deny":
              message = "Pembayaran ditolak";
              break;
            default:
              message = "Status pembayaran tidak dikenal";
          }

          res.status(200).json({ message });
        })
        .catch((error) => {
          res.status(404).json({ error: "Order not found!" });
        });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
);

export default router;
