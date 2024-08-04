import express from "express";
import User from "../models/User.js";
import jwt from "jsonwebtoken";
import passport from "passport";
import { authenticate } from "../middleware/authenticate.js";
import SendEmail from "../utils/Sendemail.js";
import crypto from "crypto";
import { promisify } from "util";
import multer from "multer";
import path from "path";

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "upload/avatar");
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

const uploadAvatar = multer({ storage: avatarStorage });

const router = express.Router();

function generateToken(user) {
  return jwt.sign({ id: user._id }, process.env.JWT_SECRET_KEY, {
    expiresIn: process.env.EXPIRES,
  });
}

// Register
router.post("/register", async (req, res) => {
  try {
    const { name, username, password, phone } = req.body;
    if (password.length < 8) {
      return res
        .status(400)
        .json({ message: "Password harus minimal 8 karakter" });
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: "Email sudah terdaftar" });
    }

    if (phone) {
      if (typeof req.body.phone !== "string") {
        return res.status(400).json({
          error: "Nomor telepon harus berupa string",
        });
      }

      const phoneLength = phone.replace(/\D/g, "").length; // Menghapus karakter non-digit
      if (phoneLength < 10 || phoneLength > 13) {
        return res.status(400).json({
          error: "Nomor telepon harus terdiri dari 10 hingga 13 digit",
        });
      }

      // Memeriksa apakah nomor telepon sudah digunakan oleh pengguna lain
      const existingUser = await User.findOne({ phone });
      if (existingUser) {
        return res.status(400).json({ error: "Nomor telepon sudah digunakan" });
      }
    }

    const newUser = new User({ name, username, phone, googleId: "" });
    const registeredUser = await User.register(newUser, password);

    const token = generateToken(registeredUser);
    res.status(201).cookie("token", token).json({ isRegister: true });
  } catch (error) {   
    return res.status(500).json({ error: error.message });
  }
});

// Login
router.post("/login", async (req, res, next) => {
  try {
    passport.authenticate("local", (err, user) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (!user) {
        return res.status(404).json({ error: "Wrong, Username or password!" });
      }
      req.login(user, (error) => {
        if (error) {
          return res.status(500).json({ error: error.message });
        }
        const token = generateToken(user);

        return res
          .status(200)
          .cookie("token", token)
          .json({
            isLogin: true,
            user: { id: user._id, username: user.username, name: user.name },
            message: "Success Login!",
          });
      });
    })(req, res, next);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Profile
router.get("/profile", authenticate(["admin", "user"]), async (req, res) => {
  try {
    const { user } = req;

    res.status(200).json(user);
  } catch (error) {
    return res.status(500).json({ error: error });
  }
});

// Update Profile
router.put(
  "/update-profile",
  authenticate(["admin", "user"]),
  async (req, res) => {
    try {
      const id = req.user._id;
      const currentUser = await User.findById(id);

      if (!currentUser) {
        return res.status(404).json({ error: "User tidak ditemukan" });
      }

      // Validasi nomor telepon
      if (req.body.phone && req.body.phone !== currentUser.phone) {
        if (typeof req.body.phone !== "string") {
          return res.status(400).json({
            error: "Nomor telepon harus berupa string",
          });
        }

        const phoneLength = req.body.phone.replace(/\D/g, "").length; // Menghapus karakter non-digit
        if (phoneLength < 10 || phoneLength > 13) {
          return res.status(400).json({
            error: "Nomor telepon harus terdiri dari 10 hingga 13 digit",
          });
        }

        // Memeriksa apakah nomor telepon sudah digunakan oleh pengguna lain
        const existingUser = await User.findOne({
          phone: req.body.phone,
          _id: { $ne: id },
        });

        if (existingUser) {
          return res
            .status(400)
            .json({ error: "Nomor telepon sudah digunakan" });
        }
      }

      const updatedUser = await User.findByIdAndUpdate(id, req.body, {
        new: true,
        runValidators: true,
      });

      res
        .status(200)
        .json({ message: "Profil berhasil diperbarui!", user: updatedUser });
    } catch (error) {
      if (error.name === "ValidationError") {
        return res.status(400).json({ error: error.message });
      }
      return res.status(500).json({ error: "Terjadi kesalahan server" });
    }
  }
);

// Show all user
router.get("/get", authenticate(["admin"]), async (req, res) => {
  try {
    const data = await User.find();

    const users = data.filter((user) => user.role === "user");

    res.status(200).json(users);
  } catch (error) {
    return res.status(500).json({ error: error });
  }
});

// Delete user
router.delete("/delete/:id", authenticate(["admin"]), async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);

    if (!user) {
      return res.status(404).json({ error: "User not found!" });
    }

    res.status(200).json({ message: "User Deleted!" });
  } catch (error) {
    return res.status(500).json({ error: error });
  }
});

// Send Email
router.post("/send-email", async (req, res) => {
  try {
    const user = await User.findOne({ username: req.body.email });

    if (!user) {
      return res.status(404).json({ error: "Email not found!" });
    }

    const token = user.PasswordToken();

    await user.save({ validateBeforeSave: true });

    const url = `${process.env.DOMAIN}/reset-password/${token}`;

    const message = `Klik link ini: ${url}`;

    await SendEmail({
      email: user.username,
      subject: "Reset Password",
      message,
    });

    return res.status(200).json({
      message: `Link reset password sudah terkirim ke email ${user.username}`,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Change Password
router.put(
  "/change-password",
  authenticate(["admin", "user"]),
  async (req, res) => {
    try {
      const { oldPassword, newPassword } = req.body;

      const user = await User.findById(req.user._id);

      if (oldPassword && newPassword) {
        user.changePassword(oldPassword, newPassword, (error) => {
          if (error) {
            return res.status(400).json({ message: "Password tidak sesuai" });
          } else {
            return res
              .status(200)
              .json({ message: "Password berhasil diganti" });
          }
        });
      }
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

router.post("/logout", (req, res) => {
  try {
    res.cookie("token", null, {
      expiresIn: new Date(Date.now()),
    });

    res.status(200).json({ message: "Success logout!" });
  } catch (error) {
    return res.status(500).json({ error: error });
  }
});

// Reset Password
router.put("/reset-password/:token", async (req, res) => {
  try {
    const resetPasswordToken = crypto
      .createHash("sha256")
      .update(req.params.token)
      .digest("hex");

    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res
        .status(400)
        .json({ error: "Token tidak valid atau sudah kadaluarsa" });
    }

    const setPasswordAsync = promisify(user.setPassword).bind(user);

    await setPasswordAsync(req.body.password);

    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();

    res.status(200).json({ message: "Password berhasil direset" });
  } catch (error) {
    res.status(500).json({ error: "Gagal mereset password" });
  }
});

router.post(
  "/upload-avatar",
  authenticate(["admin", "user"]),
  uploadAvatar.single("file"),
  async (req, res) => {
    try {
      const user = await User.findById(req.user._id);

      const imageLink = process.env.SERVER + "/avatar/" + req.file.filename;

      user.avatar = imageLink;

      await user.save();

      res.status(200).json({ message: "Avatar berhasil disimpan" });
    } catch (error) {
      return res.status(500).json({ message: error });
    }
  }
);

export default router;
