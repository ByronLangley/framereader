import { Router, Request, Response, NextFunction } from "express";
import { jobIdSchema } from "../middleware/validators";
import { getJob } from "../services/jobStore";
import { cancelJob } from "../services/queueManager";
import { NotFoundError, ConflictError } from "../utils/errors";

export const jobRouter = Router();

jobRouter.delete(
  "/:jobId",
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const parsed = jobIdSchema.safeParse(req.params.jobId);
      if (!parsed.success) {
        throw new NotFoundError("Job not found.");
      }

      const job = getJob(parsed.data);
      if (!job) {
        throw new NotFoundError("Job not found.");
      }

      if (job.status === "processing") {
        throw new ConflictError("Job is already processing and cannot be cancelled.");
      }

      if (job.status !== "queued") {
        throw new ConflictError("Only queued jobs can be cancelled.");
      }

      cancelJob(parsed.data);

      res.json({
        jobId: parsed.data,
        status: "cancelled",
      });
    } catch (err) {
      next(err);
    }
  }
);
