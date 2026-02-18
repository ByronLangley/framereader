import { Router, Request, Response, NextFunction } from "express";
import { statusRateLimiter } from "../middleware/rateLimiter";
import { jobIdSchema } from "../middleware/validators";
import { getJob } from "../services/jobStore";
import { NotFoundError } from "../utils/errors";

export const scriptRouter = Router();

scriptRouter.get(
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

      if (job.status !== "complete" || !job.script) {
        throw new NotFoundError("Script not yet available. Job is still processing.");
      }

      res.json({
        jobId: job.jobId,
        script: job.script,
        metadata: {
          title: job.metadata?.title || null,
          duration: job.metadata?.duration || null,
          platform: job.platform,
          processedAt: job.completedAt
            ? new Date(job.completedAt).toISOString()
            : new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);
