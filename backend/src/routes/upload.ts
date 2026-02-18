import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { config } from "../config";
import { processRateLimiter } from "../middleware/rateLimiter";
import { createJob } from "../services/jobStore";
import { canEnqueue, tryStartNext } from "../services/queueManager";
import { QueueFullError, ValidationError } from "../utils/errors";
import { MAX_FILE_SIZE_BYTES } from "@framereader/shared";
import { logger } from "../utils/logger";

// Ensure tmp directory exists
if (!fs.existsSync(config.tempDir)) {
  fs.mkdirSync(config.tempDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: config.tempDir,
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("video/")) {
      cb(null, true);
    } else {
      cb(new ValidationError("This file type is not supported. Try MP4, MOV, or WebM."));
    }
  },
});

export const uploadRouter = Router();

uploadRouter.post(
  "/",
  processRateLimiter,
  upload.single("video"),
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.file) {
        throw new ValidationError("No video file provided.");
      }

      if (!canEnqueue()) {
        // Clean up uploaded file
        fs.unlinkSync(req.file.path);
        throw new QueueFullError();
      }

      logger.info(`Upload received: ${req.file.originalname} (${req.file.size} bytes)`);

      const job = createJob("upload", null, req.file.path);

      tryStartNext();

      res.status(200).json({
        jobId: job.jobId,
        status: job.status,
      });
    } catch (err) {
      next(err);
    }
  }
);
