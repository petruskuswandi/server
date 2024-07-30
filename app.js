import bodyParser from "body-parser";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import session from "express-session";
import passport from "passport";
import User from "./models/User.js";
import crypto from "crypto";

import userRoutes from "./routes/UserRoutes.js";
import cartRoutes from "./routes/CartRoutes.js";
import serviceRoutes from "./routes/ServiceRoutes.js";
import shippingRoutes from "./routes/ShippingRoutes.js";
import paymentRoutes from "./routes/PaymentRoutes.js";
import orderRoutes from "./routes/OrderRoutes.js";
import googleRoutes from "./routes/GoogleRoutes.js";
import voucherRoutes from "./routes/VoucherRoutes.js";
import storeRoutes from "./routes/StoreRoutes.js";
import notificationRoutes from "./routes/NotificationRoutes.js";

import { Strategy as GoogleStrategy } from "passport-google-oauth2";
import SendEmail from "./utils/Sendemail.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function generateRandomPassword() {
  return crypto.randomBytes(20).toString("hex");
}

const app = express();

app.use(
  cors({
    origin: process.env.DOMAIN,
    credentials: true,
  })
);

app.use(cookieParser());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "upload")));

app.use(
  session({
    secret: process.env.JWT_SECRET_KEY,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: 60 * 60 * 1000 * 24 * 3,
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

passport.use(User.createStrategy());

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
      callbackURL: "/auth/google/laundry",
      userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
      scope: ["profile", "email"],
    },
    async function (accessToken, refreshToken, profile, callback) {
      try {
        // Cari user berdasarkan googleId atau username
        let user = await User.findOne({
          $or: [
            { googleId: profile.id },
            { username: profile.emails[0].value },
          ],
        });

        if (user) {
          // Jika user ditemukan, update informasi yang diperlukan
          user.googleId = profile.id;
          user.name = profile.displayName;
          user.avatar = profile.photos[0].value;
          await user.save();
          return callback(null, user);
        } else {
          // Jika user tidak ditemukan, buat user baru
          const newUser = new User({
            googleId: profile.id,
            name: profile.displayName,
            username: profile.emails[0].value,
            avatar: profile.photos[0].value,
          });

          // Buat password baru dan kirim email
          const randomPassword = generateRandomPassword();
          await newUser.setPassword(randomPassword);

          await SendEmail({
            email: newUser.username,
            subject: "Akun Anda Telah Dibuat",
            message: `Selamat datang di layanan kami! Akun Anda telah dibuat menggunakan Google Sign-In.
            
            Username: ${newUser.username}
            Password sementara: ${randomPassword}
            
            Silakan gunakan password ini untuk login pertama kali, dan segera ubah password Anda setelah berhasil login.`,
          });

          await newUser.save();
          return callback(null, newUser);
        }
      } catch (err) {
        return callback(err, null);
      }
    }
  )
);

app.use("/auth", googleRoutes);
app.use("/user", userRoutes);
app.use("/services", serviceRoutes);
app.use("/cart", cartRoutes);
app.use("/shipping", shippingRoutes);
app.use("/payment", paymentRoutes);
app.use("/order", orderRoutes);
app.use("/voucher", voucherRoutes);
app.use("/store", storeRoutes);
app.use("/notification", notificationRoutes);

export default app;
