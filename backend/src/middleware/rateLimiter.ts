import rateLimit from "express-rate-limit";

export const processRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Rate limit exceeded",
      userMessage:
        "You've submitted a lot of videos recently. Please wait a few minutes before submitting more.",
    },
  },
});

export const statusRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Too many status requests",
      userMessage: "Too many requests. Please slow down.",
    },
  },
});
