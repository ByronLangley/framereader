import { Router, Request, Response, NextFunction } from "express";
import { processRequestSchema, detectPlatform } from "../middleware/validators";
import { processRateLimiter } from "../middleware/rateLimiter";
import { createJob } from "../services/jobStore";
import { canEnqueue, tryStartNext } from "../services/queueManager";
import { QueueFullError, ValidationError } from "../utils/errors";
import { logger } from "../utils/logger";

export const processRouter = Router();

processRouter.post(
  "/",
  processRateLimiter,
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const parsed = processRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(
          "This doesn't look like a supported video URL. Supported: YouTube, TikTok, Instagram, Vimeo.",
          parsed.error.message
        );
      }

      if (!canEnqueue()) {
        throw new QueueFullError();
      }

      const { videoUrl } = parsed.data;
      const platform = detectPlatform(videoUrl);

      logger.info(`Processing request for ${platform} URL: ${videoUrl}`);

      const job = createJob(platform, videoUrl, null);

      // Try to start processing if a slot is available
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
