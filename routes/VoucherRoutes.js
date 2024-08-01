import express from "express";
import { authenticate } from "../middleware/authenticate.js";
import Voucher from "../models/Voucher.js";
import Service from "../models/Service.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";

const router = express.Router();

const jakartaOffset = 7 * 60 * 60 * 1000;

// Create a new voucher
router.post("/create", authenticate(["admin"]), async (req, res) => {
  try {
    const voucherData = req.body;

    voucherData.startDate = new Date(new Date(voucherData.startDate).getTime())
    voucherData.endDate = new Date(new Date(voucherData.endDate).getTime())

    const now = new Date(Date.now() + jakartaOffset);
    if (new Date(voucherData.startDate) >= now) {
      return res
        .status(400)
        .json({ error: "Start date must be in the future" });
    }
    if (new Date(voucherData.endDate) <= new Date(voucherData.startDate)) {
      return res
        .status(400)
        .json({ error: "End date must be after start date" });
    }

    if (
      voucherData.applicableServices &&
      voucherData.applicableServices.length > 0
    ) {
      const foundApplicableServices = await Service.find({
        _id: { $in: voucherData.applicableServices },
      });

      if (
        foundApplicableServices.length !== voucherData.applicableServices.length
      ) {
        const invalidServices = voucherData.applicableServices.filter(
          (id) =>
            !foundApplicableServices.some(
              (service) => service._id.toString() === id
            )
        );
        return res.status(400).json({
          error: `Invalid applicable services: ${invalidServices.join(", ")}`,
        });
      }
    }

    // Validate excludedServices
    if (
      voucherData.excludedServices &&
      voucherData.excludedServices.length > 0
    ) {
      const foundExcludedServices = await Service.find({
        _id: { $in: voucherData.excludedServices },
      });

      if (
        foundExcludedServices.length !== voucherData.excludedServices.length
      ) {
        const invalidServices = voucherData.excludedServices.filter(
          (id) =>
            !foundExcludedServices.some(
              (service) => service._id.toString() === id
            )
        );
        return res.status(400).json({
          error: `Invalid excluded services: ${invalidServices.join(", ")}`,
        });
      }
    }

    // Validate that services don't appear in both arrays
    if (voucherData.applicableServices && voucherData.excludedServices) {
      const duplicates = voucherData.applicableServices.filter((id) =>
        voucherData.excludedServices.includes(id)
      );

      if (duplicates.length > 0) {
        return res.status(400).json({
          error: `Services cannot be both applicable and excluded: ${duplicates.join(
            ", "
          )}`,
        });
      }
    }

    // Validate users
    if (voucherData.users && voucherData.users.length > 0) {
      const foundUsers = await User.find({ _id: { $in: voucherData.users } });

      if (foundUsers.length !== voucherData.users.length) {
        const invalidUsers = voucherData.users.filter(
          (id) => !foundUsers.some((user) => user._id.toString() === id)
        );
        return res.status(400).json({
          error: `Invalid users: ${invalidUsers.join(", ")}`,
        });
      }
    }

    const newVoucher = await Voucher.create(voucherData);

    for (const userId of newVoucher.users) {
      await Notification.create({
        type: "new_voucher",
        message: `New voucher available: ${newVoucher.code}`,
        forRole: "user",
        recipients: [
          {
            user: userId,
          },
        ],
        relatedVoucher: newVoucher._id,
      });
    }

    res
      .status(201)
      .json({ message: "Voucher created successfully", voucher: newVoucher });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
});

// Get all vouchers 
router.get("/", authenticate(["admin"]), async (req, res) => {
  try {
    const vouchers = await Voucher.find()
      .sort({ createdAt: -1 })
      .populate("applicableServices", "name category price")
      .populate("excludedServices", "name category price")
      .populate("users", "name email");

    const total = await Voucher.countDocuments();

    res.status(200).json({
      vouchers,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get a specific voucher by code
router.get("/:code", async (req, res) => {
  try {
    const voucher = await Voucher.findOne({
      code: req.params.code.toUpperCase(),
    })
      .populate("applicableServices", "name category price")
      .populate("excludedServices", "name category price")
      .populate("users", "name email");

    if (!voucher) {
      return res.status(404).json({ message: "Voucher not found" });
    }
    res.status(200).json(voucher);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update a voucher
router.patch("/:id", authenticate(["admin"]), async (req, res) => {
  try {
    const updateData = { ...req.body };

    // Convert startDate and endDate to Date objects if they exist in the request body
    if (updateData.startDate) {
      updateData.startDate = new Date(updateData.startDate);
    }
    if (updateData.endDate) {
      updateData.endDate = new Date(updateData.endDate);
    }

    const updatedVoucher = await Voucher.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
      .populate("applicableServices", "name category price")
      .populate("excludedServices", "name category price")
      .populate("users", "name email");

    if (!updatedVoucher) {
      return res.status(404).json({ message: "Voucher not found" });
    }

    for (const userId of updatedVoucher.users) {
      await Notification.create({
        type: "voucher_updated",
        message: `Voucher: ${updatedVoucher.code}`,
        forRole: "user",
        recipients: [
          {
            user: userId,
          },
        ],
        relatedVoucher: updatedVoucher._id,
      });
    }

    res.status(200).json({
      message: "Voucher updated successfully",
      voucher: updatedVoucher,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a voucher
router.delete("/:id", authenticate(["admin"]), async (req, res) => {
  try {
    const deletedVoucher = await Voucher.findByIdAndDelete(req.params.id);
    if (!deletedVoucher) {
      return res.status(404).json({ message: "Voucher not found" });
    }

    for (const userId of deletedVoucher.users) {
      await Notification.create({
        type: "new_voucher",
        message: `New voucher available: ${deletedVoucher.code}`,
        forRole: "user",
        recipients: [
          {
            user: userId,
          },
        ],
        relatedVoucher: deletedVoucher._id,
      });
    }

    res.status(200).json({ message: "Voucher deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Validate a voucher
router.post("/validate", authenticate(["admin", "user"]), async (req, res) => {
  try {
    const { code, services } = req.body;
    const voucher = await Voucher.findOne({ code: code.toUpperCase() });

    if (!voucher) {
      return res.status(404).json({ message: "Voucher not found" });
    }

    if (!voucher.isValid(req.user)) {
      return res
        .status(400)
        .json({ message: "Voucher is not valid or has expired" });
    }

    // Check if the voucher is applicable to the user
    if (!voucher.isApplicableToUser(req.user)) {
      return res
        .status(400)
        .json({ message: "Voucher is not applicable for this user" });
    }

    // Fetch service details and calculate subtotal
    const serviceIds = services.map((s) => s.serviceId);
    const serviceDetails = await Service.find({ _id: { $in: serviceIds } });

    let subtotal = 0;
    for (let service of services) {
      const detail = serviceDetails.find(
        (d) => d._id.toString() === service.serviceId
      );
      if (!detail) {
        return res
          .status(400)
          .json({ message: `Service with id ${service.serviceId} not found` });
      }
      subtotal += detail.price * (service.qty || service.quantity);
    }

    if (subtotal < voucher.minPurchase) {
      return res.status(400).json({
        message: `Minimum purchase of ${voucher.minPurchase} required`,
      });
    }

    // Check applicableServices
    if (!voucher.isApplicableToServices(serviceIds)) {
      return res.status(400).json({
        message: "Voucher is not applicable for any of the selected services",
      });
    }

    // Check excludedServices
    if (voucher.isExcludedFromServices(serviceIds)) {
      return res.status(400).json({
        message:
          "Voucher is not applicable for one or more of the selected services",
      });
    }

    const discount = voucher.applyDiscount(subtotal);
    const total = subtotal - discount;

    res.status(200).json({
      message: "Voucher is valid",
      voucherId: voucher._id,
      subtotal: subtotal,
      discount: discount,
      total: total,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
