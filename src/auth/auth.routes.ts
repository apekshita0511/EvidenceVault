import { Router } from "express";
import rateLimit from "express-rate-limit";
import { config } from "../config/env.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { register, login, me } from "./auth.controller.js";

const router = Router();

// Created per router build so the limit is read from config at startup.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.authRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many attempts, try again later" },
});

router.post("/register", limiter, register);
router.post("/login", limiter, login);
router.get("/me", authenticate, me);

export default router;
