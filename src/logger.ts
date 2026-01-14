type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

function formatLog(
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>,
): string {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
  return `[${timestamp}] [${level}] ${message}${metaStr}`;
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => {
    console.log(formatLog("INFO", message, meta));
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    console.warn(formatLog("WARN", message, meta));
  },
  error: (message: string, meta?: Record<string, unknown>) => {
    console.error(formatLog("ERROR", message, meta));
  },
  debug: (message: string, meta?: Record<string, unknown>) => {
    if (process.env.NODE_ENV !== "production") {
      console.log(formatLog("DEBUG", message, meta));
    }
  },
};
