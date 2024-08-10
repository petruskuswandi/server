import express from "express";
import { authenticate } from "../middleware/authenticate.js";
import Order from "../models/Order.js";
import Voucher from "../models/Voucher.js";
import Service from "../models/Service.js";
import Cart from "../models/Cart.js";
import Notification from "../models/Notification.js";
import User from "../models/User.js";
import multer from "multer";
import path from "path";

const router = express.Router();

const orderStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "upload/orders");
  },
  filename: (req, file, cb) => {
    cb(
      null,
      path.parse(file.originalname).name +
        "-" +
        Date.now() +
        path.extname(file.originalname)
    );
  },
});

const uploadImg = multer({ storage: orderStorage }).array("images", 10);

const paymentReceiptStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "upload/payment_receipts");
  },
  filename: (req, file, cb) => {
    cb(
      null,
      path.parse(file.originalname).name +
        "-" +
        Date.now() +
        path.extname(file.originalname)
    );
  },
});

const uploadPaymentReceipt = multer({ storage: paymentReceiptStorage }).array("paymentReceipt", 5);

router.post("/create", authenticate(["user"]), async (req, res) => {
  try {
    // Validasi jam operasional
    const currentTime = new Date();
    const currentHour = currentTime.getHours();
    const currentMinute = currentTime.getMinutes();
    const currentDay = currentTime.getDay(); // 0 adalah Minggu, 1 adalah Senin, dst.

    // Cek apakah hari ini adalah hari kerja (Senin-Sabtu)
    if (currentDay === 0) {
      // 0 adalah Minggu
      return res
        .status(400)
        .json({ error: "Orders cannot be placed on Sundays" });
    }

    // Cek apakah waktu saat ini berada di luar jam operasional (09:00 - 17:00)
    if (
      currentHour < 9 ||
      (currentHour === 17 && currentMinute > 0) ||
      currentHour > 17
    ) {
      return res.status(400).json({
        error: "Orders can only be placed between 9:00 AM and 5:00 PM",
      });
    }

    let orderData = req.body;
    orderData.user = req.user._id;

    if (!Array.isArray(orderData.services) || orderData.services.length === 0) {
      return res
        .status(400)
        .json({ error: "At least one service is required" });
    }

    let subtotal = 0;
    const serviceIds = [];
    for (let service of orderData.services) {
      const serviceDetails = await Service.findById(service.serviceId);
      if (!serviceDetails) {
        return res
          .status(400)
          .json({ error: `Service not found: ${service.serviceId}` });
      }
      subtotal += serviceDetails.price * service.qty;
      serviceIds.push(service.serviceId);
    }
    orderData.subtotal = subtotal;

    if (orderData.voucherCode) {
      const voucher = await Voucher.findOne({ code: orderData.voucherCode });
      if (voucher && voucher.isValid(req.user._id)) {
        if (
          !voucher.isApplicableToServices(serviceIds) ||
          voucher.isExcludedFromServices(serviceIds)
        ) {
          return res.status(400).json({
            error: "Voucher is not applicable for the selected services",
          });
        }
        orderData.discount = voucher.applyDiscount(orderData.subtotal);
        orderData.voucherApplied = voucher._id;
        voucher.usageCount += 1;
        await voucher.save();
      } else {
        return res.status(400).json({ error: "Internal Server Error" });
      }
    }

    orderData.total =
      orderData.subtotal - (orderData.discount || 0) + orderData.shippingCost;
    delete orderData.voucherCode;
    orderData.finishDate = null;

    const newOrder = await Order.create(orderData);

    const admins = await User.find({ role: "admin" });
    await Notification.create({
      type: "new_order",
      message: `New order received: ${newOrder.orderId}`,
      recipients: admins.map((admin) => ({ user: admin._id })),
      relatedOrder: newOrder._id,
    });

    res
      .status(201)
      .json({ message: "Order created successfully", order: newOrder });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/create-from-cart", authenticate(["user"]), async (req, res) => {
  try {
    // Validasi jam operasional
    const currentTime = new Date();
    const currentHour = currentTime.getHours();
    const currentMinute = currentTime.getMinutes();
    const currentDay = currentTime.getDay(); // 0 adalah Minggu, 1 adalah Senin, dst.

    // Cek apakah hari ini adalah hari kerja (Senin-Sabtu)
    if (currentDay === 0) {
      // 0 adalah Minggu
      return res
        .status(400)
        .json({ error: "Orders cannot be placed on Sundays" });
    }

    // Cek apakah waktu saat ini berada di luar jam operasional (09:00 - 17:00)
    if (
      currentHour < 9 ||
      (currentHour === 17 && currentMinute > 0) ||
      currentHour > 17
    ) {
      return res.status(400).json({
        error: "Orders can only be placed between 9:00 AM and 5:00 PM",
      });
    }

    const {
      orderId,
      address,
      phone,
      paymentMethod,
      deliveryOption,
      shippingCost,
      voucherCode,
      selectedServices,
    } = req.body;

    if (!selectedServices || selectedServices.length === 0) {
      return res.status(400).json({ error: "No services selected for order" });
    }

    const userId = req.user._id;
    const cart = await Cart.findOne({ user: userId }).populate(
      "services.serviceId"
    );

    if (!cart || cart.services.length === 0) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    const selectedCartServices = cart.services.filter((item) =>
      selectedServices.includes(item.serviceId._id.toString())
    );

    if (selectedCartServices.length === 0) {
      return res
        .status(400)
        .json({ error: "No valid services selected from cart" });
    }

    let orderData = {
      user: userId,
      orderId,
      services: selectedCartServices.map((item) => ({
        serviceId: item.serviceId._id,
        qty: item.qty,
      })),
      subtotal: 0,
      address,
      phone,
      paymentMethod,
      deliveryOption,
      shippingCost,
    };

    const serviceIds = [];
    for (let item of selectedCartServices) {
      orderData.subtotal += item.serviceId.price * item.qty;
      serviceIds.push(item.serviceId._id);
    }

    if (voucherCode) {
      const voucher = await Voucher.findOne({ code: voucherCode });
      if (voucher && voucher.isValid(req.user._id)) {
        if (
          !voucher.isApplicableToServices(serviceIds) ||
          voucher.isExcludedFromServices(serviceIds)
        ) {
          return res.status(400).json({
            error: "Voucher is not applicable for the selected services",
          });
        }
        orderData.discount = voucher.applyDiscount(orderData.subtotal);
        orderData.voucherApplied = voucher._id;
        voucher.usageCount += 1;
        await voucher.save();
      } else {
        return res.status(400).json({ error: "Invalid voucher" });
      }
    }

    orderData.total =
      orderData.subtotal + orderData.shippingCost - (orderData.discount || 0);
    orderData.finishDate = null;

    const newOrder = await Order.create(orderData);

    const admins = await User.find({ role: "admin" });
    await Notification.create({
      type: "new_order",
      message: `New order received: ${newOrder.orderId}`,
      recipients: admins.map((admin) => ({ user: admin._id })),
      relatedOrder: newOrder._id,
    });

    cart.services = cart.services.filter(
      (item) => !selectedServices.includes(item.serviceId._id.toString())
    );
    await cart.save();

    res.status(201).json({
      message: "Order created successfully from selected cart items",
      order: newOrder,
    });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/", authenticate(["admin"]), async (req, res) => {
  try {
    const orders = await Order.find()
      .sort({ createdAt: -1 })
      .populate("user", "name email")
      .populate("voucherApplied", "code discountValue")
      .populate("services.serviceId", "name price profit total category");

    res.status(200).json({ orders });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/my-orders", authenticate(["user"]), async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .populate("voucherApplied", "code discountValue")
      .populate("services.serviceId", "name price");

    res.status(200).json({ orders });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:orderId", authenticate(["user", "admin"]), async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId })
      .populate("user", "name email")
      .populate("voucherApplied", "code discountValue")
      .populate("services.serviceId", "name price");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (
      req.user.role !== "admin" &&
      order.user._id.toString() !== req.user._id.toString()
    ) {
      return res
        .status(403)
        .json({ message: "Not authorized to view this order" });
    }

    res.status(200).json(order);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/:orderId/status", authenticate(["admin"]), async (req, res) => {
  try {
    const { orderStatus } = req.body;
    const order = await Order.findOne({ orderId: req.params.orderId });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    order.orderStatus = orderStatus;

    // Update corresponding time fields based on the new status
    switch (orderStatus) {
      case "confirmed":
        order.confirmedTime = new Date();
        break;
      case "received":
        order.ReceivedTime = new Date();
        break;
      case "queue":
        order.queueTime = new Date();
        break;
      case "processing":
        order.processingTime = new Date();
        break;
      case "finished":
        order.finishTime = new Date();
        break;
      case "cancelled":
        order.cancelledTime = new Date();
        break;
    }

    await order.save();

    await Notification.create({
      type: "order_status",
      message: `Your order ${order.orderId} status has been updated to ${orderStatus}`,
      recipients: [{ user: order.user }],
      relatedOrder: order._id,
    });

    res
      .status(200)
      .json({ message: "Order status updated successfully", order });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/:orderId/payment", authenticate(["admin"]), async (req, res) => {
  try {
    const { paymentStatus } = req.body;
    const order = await Order.findOne({ orderId: req.params.orderId });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.paymentMethod !== "cod") {
      return res
        .status(400)
        .json({ message: "Payment status can only be updated for COD orders" });
    }

    const validStatuses = ["pending", "settlement"];
    if (!validStatuses.includes(paymentStatus)) {
      return res.status(400).json({ message: "Invalid payment status" });
    }

    order.paymentStatus = paymentStatus;

    if (paymentStatus === "settlement") {
      order.orderStatus = "confirmed";
    }

    await order.save();

    await Notification.create({
      type: "payment_status_update",
      message: `Payment status for your COD order ${order.orderId} has been updated to ${paymentStatus}`,
      recipients: [{ user: order.user }],
      relatedOrder: order._id,
    });

    res
      .status(200)
      .json({ message: "Payment status updated successfully", order });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:orderId", authenticate(["admin"]), async (req, res) => {
  try {
    const order = await Order.findOneAndDelete({ orderId: req.params.orderId });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    await Notification.create({
      type: "order_deleted",
      message: `Your order ${order.orderId} has been deleted by the admin`,
      recipients: [{ user: order.user }],
      relatedOrder: order._id,
    });

    res.status(200).json({ message: "Order deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post(
  "/:orderId/before-washing",
  authenticate(["admin"]),
  uploadImg,
  async (req, res) => {
    try {
      const { orderId } = req.params;
      const { serviceId } = req.body;

      let images;
      if (req.files && req.files.length > 0) {
        images = req.files.map((img) => ({
          link: process.env.SERVER + "/orders/" + img.filename,
        }));
      } else if (req.body.images) {
        images = Array.isArray(req.body.images)
          ? req.body.images
          : safeParse(req.body.images);

        images = images.map((item) =>
          typeof item === "string" ? { link: item } : item
        );
      }

      const order = await Order.findOne({ orderId: orderId });
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      const service = order.services.find(
        (s) => s.serviceId.toString() === serviceId
      );
      if (!service) {
        return res
          .status(404)
          .json({ error: "Service not found in this order" });
      }

      service.beforeWashingImages = images;
      await order.save();

      res
        .status(200)
        .json({ message: "Before washing images uploaded successfully" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.post(
  "/:orderId/after-washing",
  authenticate(["admin"]),
  uploadImg,
  async (req, res) => {
    try {
      const { orderId } = req.params;
      const { serviceId } = req.body;
      let images;
      if (req.files && req.files.length > 0) {
        images = req.files.map((img) => ({
          link: process.env.SERVER + "/orders/" + img.filename,
        }));
      } else if (req.body.images) {
        images = Array.isArray(req.body.images)
          ? req.body.images
          : safeParse(req.body.images);

        images = images.map((item) =>
          typeof item === "string" ? { link: item } : item
        );
      }

      const order = await Order.findOne({ orderId: orderId });
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      const service = order.services.find(
        (s) => s.serviceId.toString() === serviceId
      );
      if (!service) {
        return res
          .status(404)
          .json({ error: "Service not found in this order" });
      }

      service.afterWashingImages = images;
      await order.save();

      res
        .status(200)
        .json({ message: "After washing images uploaded successfully" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.post("/:orderId/upload-payment-receipt", authenticate(["user"]), uploadPaymentReceipt, async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const order = await Order.findOne({ orderId: orderId });
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Check if the authenticated user is the owner of the order
    if (order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "Not authorized to upload payment receipt for this order" });
    }

    let paymentReceipts = [];
    if (req.files && req.files.length > 0) {
      paymentReceipts = req.files.map((file) => ({
        link: process.env.SERVER + "/payment_receipts/" + file.filename,
      }));
    } else {
      return res.status(400).json({ error: "No files uploaded" });
    }

    order.uploadPaymentReceipt = paymentReceipts;
    order.paymentStatus = "pending"; // Set to pending for admin review
    await order.save();

    // Create a notification for admins
    const admins = await User.find({ role: "admin" });
    await Notification.create({
      type: "payment_receipt_uploaded",
      message: `Payment receipt uploaded for order ${order.orderId}`,
      recipients: admins.map((admin) => ({ user: admin._id })),
      relatedOrder: order._id,
    });

    res.status(200).json({ message: "Payment receipt uploaded successfully", order });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch(
  "/:orderId/delivery",
  authenticate(["admin"]),
  async (req, res) => {
    try {
      const { deliveryStatus } = req.body;
      const order = await Order.findOne({ orderId: req.params.orderId });

      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      order.deliveryStatus = deliveryStatus;

      switch (deliveryStatus) {
        case "pickup_scheduled":
          order.pickupScheduledTime = new Date();
          break;
        case "picked_up":
          order.pickedUpTime = new Date();
          break;
        case "ready_for_delivery":
          order.readyForDeliveryTime = new Date();
          break;
        case "out_for_delivery":
          order.outForDeliveryTime = new Date();
          break;
        case "delivered":
          order.deliveredTime = new Date();
          break;
        case "delivery_failed":
          order.deliveryFailedTime = new Date();
          break;
      }

      await order.save();

      await Notification.create({
        type: "delivery_status",
        message: `Delivery status for your order ${order.orderId} has been updated to ${deliveryStatus}`,
        recipients: [{ user: order.user }],
        relatedOrder: order._id,
      });

      res
        .status(200)
        .json({ message: "Delivery status updated successfully", order });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
