import pino from "pino";
import pinoHttp, { Options as PinoHttpOptions } from "pino-http";

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers['x-api-key']",
    ],
    remove: true,
  },
});

export const httpLogger = pinoHttp({
  logger,
  customAttributeKeys: { req: "request", res: "response", err: "error", responseTime: "rt" },
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      ip: (req.headers["x-forwarded-for"] as string) || req.socket?.remoteAddress,
      userId: (req as any).user?.uid,
    }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
  customLogLevel: (res, err) => {
    if (err || (res.statusCode ?? 0) >= 500) return "error";
    if ((res.statusCode ?? 0) >= 400) return "warn";
    return "info";
  },
  customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
  customErrorMessage: (req, res, err) => `${req.method} ${req.url} ${res.statusCode} - ${err.message}`,
  autoLogging: { ignorePaths: ["/api/health", "/favicon.ico", "/robots.txt", "/swagger", "/docs", "/openapi.json", "/static", "/assets"] },
} as PinoHttpOptions);