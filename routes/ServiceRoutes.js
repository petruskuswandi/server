import express from "express";
import { authenticate } from "../middleware/authenticate.js";
import multer from "multer";
import path from "path";
import Service from "../models/Service.js";
import XLSX from 'xlsx';

const serviceStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "upload/services");
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

const uploadImg = multer({ storage: serviceStorage }).array("image", 10);

const router = express.Router();

const upload = multer({ dest: "upload/services" });

// Fungsi helper untuk parsing JSON dengan aman
function safeParse(jsonString) {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

function toNumber(value, defaultValue = 0) {
  const num = Number(value);
  return isNaN(num) ? defaultValue : num;
}

router.post(
  "/add-service",
  authenticate(["admin"]),
  uploadImg,
  async (req, res) => {
    try {
      let images;
      if (req.files && req.files.length > 0) {
        images = req.files.map((img) => ({
          link: process.env.SERVER + "/services/" + img.filename,
        }));
      } else if (req.body.images) {
        images = Array.isArray(req.body.images)
          ? req.body.images
          : safeParse(req.body.images);

        images = images.map((item) =>
          typeof item === "string" ? { link: item } : item
        );
      }

      const {
        name,
        description,
        category,
        price,
        estimatedDuration,
        materials,
        laborCost,
        applicableShoeTypes,
        note,
      } = req.body;

      const parsedEstimatedDuration = safeParse(estimatedDuration) || {};
      const parsedMaterials = Array.isArray(materials)
        ? materials
        : safeParse(materials) || [];
      const parsedApplicableShoeTypes = Array.isArray(applicableShoeTypes)
        ? applicableShoeTypes
        : safeParse(applicableShoeTypes) || [];

      const numericPrice = toNumber(price);
      const numericLaborCost = toNumber(laborCost);

      const totalMaterialCost = parsedMaterials.reduce(
        (sum, material) => sum + toNumber(material.cost),
        0
      );

      const totalCost = totalMaterialCost + numericLaborCost;
      const profit = numericPrice - totalCost;

      if (name) {
        const existingService = await Service.findOne({
          name,
          _id: { $ne: req.params.id },
        });
        if (existingService) {
          return res
            .status(400)
            .json({ error: "A service with this name already exists!" });
        }
      }

      const service = await Service.create({
        name,
        description,
        category,
        price: numericPrice,
        estimatedDuration: {
          days: toNumber(parsedEstimatedDuration.days),
          hours: toNumber(parsedEstimatedDuration.hours),
        },
        materials: parsedMaterials,
        laborCost: numericLaborCost,
        profit: profit,
        applicableShoeTypes: parsedApplicableShoeTypes,
        images: images,
        note,
      });

      if (!service) {
        return res.status(500).json({ error: "Service failed to add!" });
      }

      return res
        .status(200)
        .json({ message: "Service successfully added.", service });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
);

router.post(
  "/upload-services",
  authenticate(["admin"]),
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const workbook = XLSX.readFile(req.file.path);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(sheet);

      // Collect all service names from the Excel file
      const serviceNames = jsonData.map(item => item.name);

      // Check for duplicate names within the Excel file
      const duplicateNames = serviceNames.filter((name, index) => serviceNames.indexOf(name) !== index);
      if (duplicateNames.length > 0) {
        return res.status(400).json({ message: `Duplicate service names found in Excel: ${duplicateNames.join(', ')}` });
      }

      // Check for existing services with the same names
      const existingServices = await Service.find({ name: { $in: serviceNames } });
      if (existingServices.length > 0) {
        const existingNames = existingServices.map(service => service.name);
        return res.status(400).json({ message: `Services already exist with names: ${existingNames.join(', ')}` });
      }

      const createdServices = await Promise.all(
        jsonData.map(async (item) => {
          const price = Number(item.price);
          const laborCost = Number(item.laborCost);
          const materials = JSON.parse(item.materials);
          
          const totalMaterialCost = materials.reduce(
            (sum, material) => sum + Number(material.cost),
            0
          );

          const totalCost = totalMaterialCost + laborCost;
          const profit = price - totalCost;

          return await Service.create({
            name: item.name,
            description: item.description,
            category: item.category,
            price: price,
            estimatedDuration: JSON.parse(item.estimatedDuration),
            materials: materials,
            laborCost: laborCost,
            profit: profit,
            applicableShoeTypes: JSON.parse(item.applicableShoeTypes),
            images: item.images ? JSON.parse(item.images) : [],
            note: item.note,
          });
        })
      );

      res.status(200).json({
        message: `${createdServices.length} services successfully uploaded`,
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

router.get("/show-services", async (req, res) => {
  try {
    const services = await Service.find()
      .sort({ createdAt: -1 })
      .populate({ path: "reviews.user" });

    return res.status(200).json(services);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get("/:name", async (req, res) => {
  try {
    const service = await Service.findOne({ name: req.params.name })
      .sort({ createdAt: -1 })
      .populate({
        path: "reviews.user",
      });

    if (!service) {
      return res.status(404).json({ error: "Service not found!" });
    }

    return res.status(200).json(service);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.put(
  "/update/:id",
  authenticate(["admin"]),
  uploadImg,
  async (req, res) => {
    try {
      let images;
      if (req.files && req.files.length > 0) {
        images = req.files.map((img) => ({
          link: process.env.SERVER + "/services/" + img.filename,
        }));
      } else if (req.body.images) {
        images = Array.isArray(req.body.images)
          ? req.body.images
          : safeParse(req.body.images);

        images = images.map((item) =>
          typeof item === "string" ? { link: item } : item
        );
      }

      const {
        name,
        description,
        category,
        price,
        estimatedDuration,
        materials,
        laborCost,
        applicableShoeTypes,
        note,
      } = req.body;

      const parsedEstimatedDuration = safeParse(estimatedDuration) || {};
      const parsedMaterials = Array.isArray(materials)
        ? materials
        : safeParse(materials) || [];
      const parsedApplicableShoeTypes = Array.isArray(applicableShoeTypes)
        ? applicableShoeTypes
        : safeParse(applicableShoeTypes) || [];

      const numericPrice = toNumber(price);
      const numericLaborCost = toNumber(laborCost);

      const totalMaterialCost = parsedMaterials.reduce(
        (sum, material) => sum + toNumber(material.cost),
        0
      );

      const totalCost = totalMaterialCost + numericLaborCost;
      const profit = numericPrice - totalCost;

      if (name) {
        const existingService = await Service.findOne({
          name,
          _id: { $ne: req.params.id },
        });
        if (existingService) {
          return res
            .status(400)
            .json({ error: "A service with this name already exists!" });
        }
      }

      const updatedService = await Service.findByIdAndUpdate(
        req.params.id,
        {
          name,
          description,
          category,
          price: numericPrice,
          estimatedDuration: {
            days: toNumber(parsedEstimatedDuration.days),
            hours: toNumber(parsedEstimatedDuration.hours),
          },
          materials: parsedMaterials,
          laborCost: numericLaborCost,
          profit: profit,
          applicableShoeTypes: parsedApplicableShoeTypes,
          images: images,
          note,
        },
        { new: true, runValidators: true }
      );

      if (!updatedService) {
        return res.status(404).json({ error: "Service not found!" });
      }

      return res.status(200).json({
        message: "Service successfully updated",
        service: updatedService,
      });
    } catch (error) {
      if (error.name === "MongoError" && error.code === 11000) {
        return res
          .status(400)
          .json({ error: "A service with this name already exists!" });
      }
      return res.status(500).json({ error: error.message });
    }
  }
);

router.delete("/delete/:id", authenticate(["admin"]), async (req, res) => {
  try {
    const service = await Service.findByIdAndDelete(req.params.id);

    if (!service) {
      return res.status(404).json({ error: "Service not found!" });
    }

    return res.status(200).json({ message: "Service successfully deleted!" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.delete("/delete-all", authenticate(["admin"]), async (req, res) => {
  try {
    await Service.deleteMany();

    res.status(200).json({ message: "All services successfully deleted" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post("/give-review/:id", authenticate(["user"]), async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);

    if (!service) {
      return res.status(404).json({ error: "Service not found!" });
    }

    const newReview = {
      user: req.user._id,
      rating: req.body.rating,
      comment: req.body.comment,
    };

    service.reviews.push(newReview);

    await service.save();

    res.status(200).json({ message: "Successfully saved review" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
