import User from "../models/User.js";
import jwt from "jsonwebtoken";

export const authenticate = (role = []) => {
  return async (req, res, next) => {
    const { token } = req.cookies;

    if (!token) {
      return res.status(403).json({ message: "You doesn't login!" });
    }

    try {
      const decode = jwt.verify(token, process.env.JWT_SECRET_KEY);

      req.user = await User.findById(decode.id);

      if (!role.includes(req.user.role)) {
        return res
          .status(403)
          .json({ message: "You don't have authorization!" });
      }

      next();
    } catch (error) {
      return res.status(403).json({ message: "Invalid token!" });
    }
  };
};
