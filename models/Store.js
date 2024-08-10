import { Schema, model } from "mongoose";

const jakartaOffset = 7 * 60;

const storeSchema = new Schema(
  {
    name: { type: String },
    province: { type: String },
    city: { type: String },
    address: { type: String },
    phone: {type: String},
    sliders: [
      {
        link: { type: String },
        title: { type: String },
        description: { type: String },
      },
    ],
    logo: { type: String },
  },
  { 
    timestamps: { 
      currentTime: () => {
        const now = new Date();
        return new Date(now.getTime() + jakartaOffset * 60000);
      }
    } 
  }
);

export default model("store", storeSchema);