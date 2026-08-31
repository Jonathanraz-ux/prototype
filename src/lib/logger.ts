type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = __DEV__ ? "debug" : "warn";

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatMessage(level: LogLevel, tag: string, message: string): string {
  const ts = new Date().toISOString().slice(11, 23);
  return `[${ts}] [${level.toUpperCase()}] [${tag}] ${message}`;
}

export const logger = {
  setLevel(level: LogLevel) {
    currentLevel = level;
  },

  debug(tag: string, message: string, data?: unknown) {
    if (!shouldLog("debug")) return;
    console.debug(formatMessage("debug", tag, message), data ?? "");
  },

  info(tag: string, message: string, data?: unknown) {
    if (!shouldLog("info")) return;
    console.info(formatMessage("info", tag, message), data ?? "");
  },

  warn(tag: string, message: string, data?: unknown) {
    if (!shouldLog("warn")) return;
    console.warn(formatMessage("warn", tag, message), data ?? "");
  },

  error(tag: string, message: string, error?: unknown) {
    if (!shouldLog("error")) return;
    console.error(formatMessage("error", tag, message), error ?? "");
  },
};
