import { z } from "zod";
import { PLATFORM_PATTERNS } from "@framereader/shared";
import type { Platform } from "@framereader/shared";

export const processRequestSchema = z.object({
  videoUrl: z.string().url("Invalid URL format").max(2048, "URL is too long"),
});

export const jobIdSchema = z.string().uuid("Invalid job ID format");

export function detectPlatform(url: string): Platform {
  for (const [platform, patterns] of Object.entries(PLATFORM_PATTERNS)) {
    if (patterns.some((pattern) => pattern.test(url))) {
      return platform as Platform;
    }
  }
  return "unknown";
}
