import { Router, Request, Response, NextFunction } from "express";
import { statusRateLimiter } from "../middleware/rateLimiter";
import { jobIdSchema } from "../middleware/validators";
import { getJob } from "../services/jobStore";
import { NotFoundError } from "../utils/errors";

export const statusRouter = Router();

statusRouter.get(
  "/:jobId",
  statusRateLimiter,
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const parsed = jobIdSchema.safeParse(req.params.jobId);
      if (!parsed.success) {
        throw new NotFoundError("Job not found.");
      }

      const job = getJob(parsed.data);
      if (!job) {
        throw new NotFoundError("Job not found. It may have expired.");
      }

      const estimatedTimeRemaining =
        job.metadata?.duration && job.status === "processing"
          ? Math.max(0, Math.round(job.metadata.duration * 0.75))
          : null;

      res.json({
        jobId: job.jobId,
        status: job.status,
        stages: job.stages,
        metadata: job.metadata
          ? {
              title: job.metadata.title,
              duration: job.metadata.duration,
              platform: job.platform,
            }
          : null,
        error: job.error
          ? {
              stage: job.error.stage,
              message: job.error.message,
              userMessage: job.error.userMessage,
            }
          : null,
        stageErrors: Object.keys(job.stageErrors).length > 0 ? job.stageErrors : undefined,
        estimatedTimeRemaining,
      });
    } catch (err) {
      next(err);
    }
  }
);
