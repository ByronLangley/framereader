import winston from "winston";
import { config } from "../config";

export const logger = winston.createLogger({
  level: config.nodeEnv === "production" ? "error" : "debug",
  format: winston.format.combine(
    winston.format.timestamp(),
    config.nodeEnv === "production"
      ? winston.format.json()
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, ...rest }) => {
            const extra = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : "";
            return `${timestamp} [${level}]: ${message}${extra}`;
          })
        )
  ),
  transports: [new winston.transports.Console()],
});
