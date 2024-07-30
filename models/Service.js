import { Schema, model } from "mongoose";

const jakartaOffset = 7 * 60 * 60 * 1000;

const serviceSchema = new Schema(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
    category: {
      type: String,
      required: true,
    },
    price: { type: Number, required: true },
    estimatedDuration: {
      days: { type: Number, default: 0 },
      hours: { type: Number, required: true, min: 0, max: 23 },
    },
    materials: [
      {
        name: { type: String, required: true },
        cost: { type: Number, required: true },
      },
    ],
    laborCost: { type: Number, required: true },
    profit: { type: Number, required: true },
    rating: { type: Number, default: 0 },
    images: [{ link: { type: String } }],
    applicableShoeTypes: [{ type: String, required: false }], // misalnya: ['Sneakers', 'Leather', 'Suede', 'Canvas']
    reviews: [
      {
        user: { type: Schema.Types.ObjectId, ref: "user", required: true },
        rating: { type: Number, required: true, min: 1, max: 5 },
        comment: { type: String },
        date: { type: Date, default: Date.now },
      },
    ],
    isAvailable: { type: Boolean, default: true },
    note: { type: String },
  },
  { timestamps: {
    currentTime: () => new Date(Date.now() + jakartaOffset)
  } }
);

serviceSchema.pre("save", function (next) {
  if (this.reviews.length > 0) {
    const totalRating = this.reviews.reduce(
      (sum, review) => sum + review.rating,
      0
    );
    this.rating = Math.ceil(totalRating / this.reviews.length);
  }
  next();
});

export default model("service", serviceSchema);
