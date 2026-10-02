import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { uploadEvidenceFile } from "./evidence.upload.js";
import { createEvidence, listEvidence, evidenceOptions, evidenceStats, getEvidence, downloadEvidence, verifyEvidence } from "./evidence.controller.js";

const router = Router();

router.use(authenticate);
router.post("/", uploadEvidenceFile, createEvidence);
router.get("/", listEvidence);
router.get("/options", evidenceOptions);
router.get("/stats", evidenceStats);
router.get("/:id", getEvidence);
router.get("/:id/download", downloadEvidence);
router.post("/:id/verify", verifyEvidence);

export default router;
