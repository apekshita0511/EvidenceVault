import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { listAudit, listCustody } from "./activity.controller.js";

const router = Router();

router.use(authenticate);
router.get("/audit", listAudit);
router.get("/custody", listCustody);

export default router;