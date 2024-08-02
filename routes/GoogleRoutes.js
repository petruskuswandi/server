import express from "express";
import jwt from "jsonwebtoken";
import passport from "passport";
import User from "../models/User.js"; // Pastikan untuk mengimpor model User

const router = express.Router();

function generateToken(user) {
  return jwt.sign({ id: user._id }, process.env.JWT_SECRET_KEY, {
    expiresIn: process.env.EXPIRES,
  });
}

router.get(
  "/google",
  passport.authenticate("google", { scope: ["email", "profile"] })
);

router.get(
  "/google/laundry",
  passport.authenticate("google", { failureRedirect: "/" }),
  async (req, res) => {
    if (!req.user) {
      return res.status(401).json({ message: "You're not authenticated!" });
    }

    try {
      // Cek apakah email sudah ada di database
      let user = await User.findOne({ username: req.user.username });

      if (user) {
        // Jika user ditemukan, update data berdasarkan _id
        await User.findByIdAndUpdate(
          user._id,
          {
            $set: {
              name: req.user.name,
              googleId: req.user.googleId,
              avatar: req.user.avatar,
              // tambahkan field lain yang perlu diupdate
            },
          },
          { new: true }
        );
      } else {
        // Jika user tidak ditemukan, buat user baru
        user = new User({
          name: req.user.name,
          username: req.user.username,
          googleId: req.user.googleId,
          avatar: req.user.avatar,
          // tambahkan field lain yang diperlukan
        });
        await user.save();
      }

      // Ambil user terbaru setelah update atau create
      user = await User.findOne({ username: req.user.username });

      const token = generateToken(user);

      res
        .status(200)
        .cookie("token", token)
        .redirect(process.env.DOMAIN);
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

export default router;
