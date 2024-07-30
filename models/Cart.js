import { Schema, model } from "mongoose";

const jakartaOffset = 7 * 60;

const cartSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      require: true,
      ref: "user",
      required: true,
    },
    services: [
      {
        serviceId: {
          type: Schema.Types.ObjectId,
          ref: "service",
          required: true,
        },
        qty: { type: Number, default: 1 },
      },
    ],
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

export default model("cart", cartSchema);
