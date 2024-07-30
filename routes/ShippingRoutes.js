import express from "express";
import { authenticate } from "../middleware/authenticate.js";
import axios from "axios";
import qs from "qs";

axios.defaults.baseURL = process.env.BASE_URL;
axios.defaults.headers.common["key"] = process.env.KEY;
axios.defaults.headers.post["Content-Type"] =
  "Application/x-www-form-urlencoded";

const router = express.Router();

router.get("/provinces", authenticate(["user", "admin"]), async (req, res) => {
  try {
    const provinces = await axios.get("/province");

    return res.status(200).json(provinces.data.rajaongkir.results);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get("/city/:province_id", authenticate(["user", "admin"]), async (req, res) => {
  try {
    const id = req.params.province_id;

    const cities = await axios.get(`/city?province=${id}`);

    res.status(200).json(cities.data.rajaongkir.results);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get(
  "/cost/:origin/:destination/:weight/:courier",
  authenticate(["user"]),
  async (req, res) => {
    try {
      const { origin, destination, weight, courier } = req.params;

      const data = qs.stringify({
        origin,
        destination,
        weight,
        courier,
      });

      const cost = await axios.post("/cost", data);

      res.status(200).json(cost.data.rajaongkir.results);
    } catch (error) {
      return res.status(500).json({ error: error });
    }
  }
);

export default router;
