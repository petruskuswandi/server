import express from "express";
import multer from "multer";
import path from "path";
import Store from "../models/Store.js";
import { authenticate } from "../middleware/authenticate.js";

const router = express.Router();

const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "upload/assets");
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

const uploadImg = multer({ storage: imageStorage });

const storeId = "669766675185121144e5d223";

const validatePhoneNumber = (phone) => {
  const cleanPhone = phone.replace(/\D/g, '');
  
  if (cleanPhone.length <= 10 || cleanPhone.length > 13) {
    return false;
  }
  
  const phoneRegex = /^((\+62|62)|0)[8]{1}[1-9]{1}\d{7,13}$/;
  return phoneRegex.test(cleanPhone);
}

router.get("/get-data", async (req, res) => {
  try {
    let data = await Store.findById(storeId);

    if (!data) {
      data = new Store({
        _id: storeId,
        name: "Default Store Name",
        province: "9",
        city: "108",
        address: "Default Address",
        phone: "Default Number",
        sliders: [
          {
            link: "Default Link",
            title: "Default Title",
            description: "Default Description",
          },
        ],
        logo: "",
      });
      await data.save();
    }

    res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.put(
  "/update-store",
  authenticate(["admin"]),
  uploadImg.fields([
    { name: "logo", maxCount: 1 },
    { name: "sliders", maxCount: 5 },
  ]),
  async (req, res) => {
    try {
      const { name, province, city, address, phone } = req.body;

      if (!phone) {
        return res.status(400).json({ message: "Nomor telepon wajib diisi" });
      }
      if (!validatePhoneNumber(phone)) {
        return res.status(400).json({ message: "Nomor telepon tidak valid. Pastikan nomor telepon memiliki panjang lebih dari 10 digit dan maksimal 13 digit, serta merupakan nomor telepon Indonesia yang valid." });
      }

      const updateData = {
        name,
        province,
        city,
        address,
        phone,
      };

      if (req.files["logo"]) {
        updateData.logo =
          process.env.SERVER + "/assets/" + req.files["logo"][0].filename;
      }

      if (req.files["sliders"]) {
        const newSliders = req.files["sliders"].map((file) => ({
          link: process.env.SERVER + "/assets/" + file.filename,
          title:
            req.body.sliderTitles && req.body.sliderTitles[file.originalname]
              ? req.body.sliderTitles[file.originalname]
              : "Default Title",
          description:
            req.body.sliderDescriptions &&
            req.body.sliderDescriptions[file.originalname]
              ? req.body.sliderDescriptions[file.originalname]
              : "Default Description",
        }));

        const store = await Store.findById(storeId);
        updateData.sliders = [...(store.sliders || []), ...newSliders];
      }

      const updatedStore = await Store.findOneAndUpdate(
        { _id: storeId },
        updateData,
        {
          new: true,
          upsert: true,
          runValidators: true,
          setDefaultsOnInsert: true,
        }
      );

      if (updatedStore) {
        res.status(200).json({
          message: "Store berhasil diperbarui atau dibuat",
          store: updatedStore,
        });
      } else {
        res
          .status(404)
          .json({ message: "Gagal memperbarui atau membuat store" });
      }
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  }
);

router.delete(
  "/delete-slider/:sliderId",
  authenticate(["admin"]),
  async (req, res) => {
    try {
      const { sliderId } = req.params;
      const store = await Store.findById(storeId);

      if (!store) {
        return res.status(404).json({ message: "Store tidak ditemukan" });
      }

      store.sliders = store.sliders.filter(
        (slider) => slider._id.toString() !== sliderId
      );
      await store.save();

      res.status(200).json({ message: "Slider berhasil dihapus", store });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  }
);

router.put(
  "/update-slider/:sliderId",
  authenticate(["admin"]),
  uploadImg.single("image"),
  async (req, res) => {
    try {
      const { sliderId } = req.params;
      const { title, description } = req.body;
      const store = await Store.findById(storeId);

      if (!store) {
        return res.status(404).json({ message: "Store tidak ditemukan" });
      }

      const sliderIndex = store.sliders.findIndex(
        (slider) => slider._id.toString() === sliderId
      );

      if (sliderIndex === -1) {
        return res.status(404).json({ message: "Slider tidak ditemukan" });
      }

      if (req.file) {
        store.sliders[sliderIndex].link =
          process.env.SERVER + "/assets/" + req.file.filename;
      }
      if (title !== undefined) {
        store.sliders[sliderIndex].title = title;
      }
      if (description !== undefined) {
        store.sliders[sliderIndex].description = description;
      }

      await store.save();

      res.status(200).json({ message: "Slider berhasil diupdate", store });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  }
);

export default router;
