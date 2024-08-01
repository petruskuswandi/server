import { Schema, model } from "mongoose";

const jakartaOffset = 7 * 60 * 60 * 1000;

const voucherSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    discountType: {
      type: String,
      enum: ["percentage", "fixed"],
      required: true,
    },
    discountValue: {
      type: Number,
      required: true,
    },
    maxDiscount: {
      type: Number,
      default: null,
    },
    minPurchase: {
      type: Number,
      default: 0,
    },
    startDate: {
      type: Date,
      required: true,
      set: (v) => {
        if (v instanceof Date) {
          return new Date(v.getTime() + jakartaOffset);
        }
        return new Date(new Date(v).getTime() + jakartaOffset);
      },
    },
    endDate: {
      type: Date,
      required: true,
      set: (v) => {
        if (v instanceof Date) {
          return new Date(v.getTime() + jakartaOffset);
        }
        return new Date(new Date(v).getTime() + jakartaOffset);
      },
    },
    usageLimit: {
      type: Number,
      default: null,
    },
    usageCount: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    applicableServices: [
      {
        type: Schema.Types.ObjectId,
        ref: "service",
      },
    ],
    excludedServices: [
      {
        type: Schema.Types.ObjectId,
        ref: "service",
      },
    ],
    users: [
      {
        type: Schema.Types.ObjectId,
        ref: "user",
      },
    ],
  },
  {
    timestamps: {
      currentTime: () => new Date(Date.now() + jakartaOffset),
    },
  }
);

// Middleware to check if the voucher has expired
voucherSchema.pre("save", function (next) {
  if (this.endDate < new Date(Date.now() + jakartaOffset)) {
    this.isActive = false;
  }
  next();
});

// Method to check if the voucher is valid
voucherSchema.methods.isValid = function (user) {
  const now = new Date(Date.now() + jakartaOffset);
  return (
    this.isActive &&
    now >= this.startDate &&
    now <= this.endDate &&
    (this.usageLimit === null || this.usageCount < this.usageLimit) &&
    this.isApplicableToUser(user)
  );
};

// Method to apply discount
voucherSchema.methods.applyDiscount = function (subtotal) {
  if (subtotal < this.minPurchase) {
    return 0;
  }

  let discount = 0;
  if (this.discountType === "percentage") {
    discount = subtotal * (this.discountValue / 100);
  } else {
    discount = this.discountValue;
  }

  if (this.maxDiscount === 0) {
    discount = Math.min(discount, this.discountValue);
  } else {
    discount = Math.min(discount, this.maxDiscount);
  }

  return Math.min(discount, subtotal);
};

// Method to check if voucher is applicable to services
voucherSchema.methods.isApplicableToServices = function (serviceIds) {
  if (this.applicableServices && this.applicableServices.length > 0) {
    return serviceIds.some((id) =>
      this.applicableServices.includes(id.toString())
    );
  }
  return true;
};

// Method to check if voucher is excluded from services
voucherSchema.methods.isExcludedFromServices = function (serviceIds) {
  if (this.excludedServices && this.excludedServices.length > 0) {
    return serviceIds.some((id) =>
      this.excludedServices.includes(id.toString())
    );
  }
  return false;
};

voucherSchema.methods.isApplicableToUser = function (user) {
  if (!user) {
    return false;
  }
  const userId = user._id || user.id || user;
  return (
    this.users.length === 0 ||
    this.users.some((id) => id.toString() === userId.toString())
  );
};

export default model("voucher", voucherSchema);
