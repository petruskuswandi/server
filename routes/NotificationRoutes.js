import express from "express";
import { authenticate } from "../middleware/authenticate.js";
import Notification from "../models/Notification.js";

const router = express.Router();

// Get notifications for the authenticated user
router.get("/", authenticate(["user", "admin"]), async (req, res) => {
  try {
    const notifications = await Notification.find({
      "recipients.user": req.user._id,
      "recipients.isDeleted": false,
    }).sort({ createdAt: -1 });

    res.json(
      notifications.map((notification) => ({
        ...notification.toObject(),
        isRead: notification.recipients.find((r) => r.user.equals(req.user._id))
          .isRead,
      }))
    );
  } catch (error) {
    res
      .status(500)
      .json({ error: "An error occurred while fetching notifications" });
  }
});

// Mark a notification as read
router.patch("/:id/read", authenticate(["user", "admin"]), async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      {
        _id: req.params.id,
        "recipients.user": req.user._id,
      },
      { $set: { "recipients.$.isRead": true } },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json({
      ...notification.toObject(),
      isRead: true,
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: "An error occurred while updating the notification" });
  }
});

// Delete all read notifications for the user
router.delete("/:id", authenticate(["user", "admin"]), async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      {
        _id: req.params.id,
        "recipients.user": req.user._id,
      },
      { $set: { "recipients.$.isDeleted": true } },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json({ message: "Notification deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ error: "An error occurred while deleting the notification" });
  }
});

export default router;
