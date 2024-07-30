import { Schema, model } from "mongoose";

const jakartaOffset = 7 * 60 * 60 * 1000;

const orderSchema = new Schema(
  {
    orderId: { type: String, required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: "user", required: true },
    address: {
      type: String,
      required: function () {
        return this.deliveryOption === "pickup_by_laundry";
      },
    },
    phone: { type: Number, required: true },
    subtotal: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    voucherApplied: { type: Schema.Types.ObjectId, ref: "voucher" },
    total: {
      type: Number,
      required: true,
      default: function () {
        return this.subtotal - this.discount;
      },
    },
    paymentMethod: {
      type: String,
      enum: [
        "cod",
        "credit_card",
        "mandiri_clickpay",
        "cimb_clicks",
        "bca_klikbca",
        "bca_klikpay",
        "bri_epay",
        "echannel",
        "indosat_dompetku",
        "gopay",
        "shopeepay",
        "indomaret",
        "alfamart",
        "akulaku",
        "bank_transfer",
        "other",
      ],
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "settlement", "failed", "expired"],
      default: "pending",
    },
    orderStatus: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "received",
        "queue",
        "processing",
        "finished",
        "cancelled",
      ],
      default: "pending",
    },
    confirmedTime: {
      type: Date,
      set: (v) => new Date(v.getTime() + jakartaOffset),
    },
    ReceivedTime: {
      type: Date,
      set: (v) => new Date(v.getTime() + jakartaOffset),
    },
    queueTime: {
      type: Date,
      set: (v) => new Date(v.getTime() + jakartaOffset),
    },
    processingTime: {
      type: Date,
      set: (v) => new Date(v.getTime() + jakartaOffset),
    },
    finishTime: {
      type: Date,
      set: (v) => new Date(v.getTime() + jakartaOffset),
    },
    cancelledTime: {
      type: Date,
      set: (v) => new Date(v.getTime() + jakartaOffset),
    },
    deliveryOption: {
      type: String,
      enum: ["pickup_by_laundry", "self_service"],
      required: true,
    },
    deliveryStatus: {
      type: String,
      enum: [
        "pending",
        "pickup_scheduled",
        "picked_up",
        "ready_for_delivery",
        "out_for_delivery",
        "delivered",
        "delivery_failed",
      ],
      default: "pending",
    },
    pickupScheduledTime: {
      type: Date,
      set: (v) => new Date(v.getTime() + jakartaOffset),
    },
    pickedUpTime: {
      type: Date,
      set: (v) => new Date(v.getTime() + jakartaOffset),
    },
    readyForDeliveryTime: {
      type: Date,
      set: (v) => new Date(v.getTime() + jakartaOffset),
    },
    outForDeliveryTime: {
      type: Date,
      set: (v) => new Date(v.getTime() + jakartaOffset),
    },
    deliveredTime: {
      type: Date,
      set: (v) => new Date(v.getTime() + jakartaOffset),
    },
    deliveryFailedTime: {
      type: Date,
      set: (v) => new Date(v.getTime() + jakartaOffset),
    },
    shippingCost: {
      type: Number,
      required: function () {
        return this.deliveryOption === "pickup_by_laundry";
      },
    },
    services: [
      {
        serviceId: {
          type: Schema.Types.ObjectId,
          ref: "service",
          required: true,
        },
        qty: { type: Number, required: true },
        beforeWashingImages: [{ link: { type: String } }],
        afterWashingImages: [{ link: { type: String } }],
      },
    ],

    estimatedFinishTime: { type: Date },
  },
  {
    timestamps: {
      currentTime: () => new Date(Date.now() + jakartaOffset),
    },
  }
);

// Pre-save hook to calculate estimatedFinishTime
orderSchema.pre("save", async function (next) {
  if (this.isNew || this.isModified("services")) {
    let maxDuration = { days: 0, hours: 0 };
    for (let serviceItem of this.services) {
      const service = await model("service").findById(serviceItem.serviceId);
      if (service) {
        if (service.estimatedDuration.days > maxDuration.days) {
          maxDuration.days = service.estimatedDuration.days;
          maxDuration.hours = service.estimatedDuration.hours;
        } else if (
          service.estimatedDuration.days === maxDuration.days &&
          service.estimatedDuration.hours > maxDuration.hours
        ) {
          maxDuration.hours = service.estimatedDuration.hours;
        }
      }
    }
    const estimatedDuration =
      maxDuration.days * 24 * 60 * 60 * 1000 +
      maxDuration.hours * 60 * 60 * 1000;
    this.estimatedFinishTime = new Date(
      this.createdAt.getTime() + estimatedDuration
    );
  }
  next();
});

export default model("order", orderSchema);
