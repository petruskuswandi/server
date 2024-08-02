import { Schema, model } from "mongoose";
import passportLocalMongoose from "passport-local-mongoose";
import findOrCreate from "mongoose-findorcreate";
import crypto from "crypto";

const jakartaOffset = 7 * 60 * 60 * 1000;

const userSchema = new Schema(
  {
    _id: { type: Schema.Types.ObjectId, auto: true },
    name: { type: String, required: true },
    avatar: { type: String },
    username: { type: String, required: true },
    phone: { type: Number },
    password: { type: String },
    hash: { type: String },
    salt: { type: String },
    role: { type: String, default: "user" },
    googleId: { type: String },
    resetPasswordToken: String,
    resetPasswordExpires: Date,
  },
  {
    timestamps: {
      currentTime: () => new Date(Date.now() + jakartaOffset),
    },
  }
);

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

userSchema.methods.PasswordToken = function () {
  const token = crypto.randomBytes(20).toString("hex");

  this.resetPasswordToken = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

  this.resetPasswordExpires = Date.now() + 18000000;

  return token;
};

export default model("user", userSchema);
