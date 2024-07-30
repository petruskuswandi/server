import { Schema, model } from "mongoose";

const jakartaOffset = 7 * 60;

const notificationSchema = new Schema(
  {
    type: String,
    message: String,
    forRole: String,
    recipients: [
      {
        user: { type: Schema.Types.ObjectId, ref: "user" },
        isRead: { type: Boolean, default: false },
        isDeleted: { type: Boolean, default: false },
      },
    ],
    relatedOrder: { type: Schema.Types.ObjectId, ref: "order" },
    relatedVoucher: { type: Schema.Types.ObjectId, ref: "voucher" },
  },
  {
    timestamps: {
      currentTime: () => {
        const now = new Date();
        return new Date(now.getTime() + jakartaOffset * 60000);
      },
    },
  }
);

export default model("notification", notificationSchema);
