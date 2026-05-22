type LogLevel = "debug" | "info" | "warn" | "error";

interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  child: (namespace: string) => Logger;
}

function createLogger(namespace?: string): Logger {
  const prefix = namespace ? `[${namespace}]` : "";

  function log(level: LogLevel, ...args: unknown[]) {
    const timestamp = new Date().toISOString();
    const label = `${timestamp} ${level.toUpperCase().padStart(5)} ${prefix}`;
    if (level === "error") {
      console.error(label, ...args);
    } else if (level === "warn") {
      console.warn(label, ...args);
    } else if (level === "debug") {
      console.debug(label, ...args);
    } else {
      console.info(label, ...args);
    }
  }

  return {
    debug: (...args: unknown[]) => log("debug", ...args),
    info: (...args: unknown[]) => log("info", ...args),
    warn: (...args: unknown[]) => log("warn", ...args),
    error: (...args: unknown[]) => log("error", ...args),
    child: (ns: string) => createLogger(ns),
  };
}

export const logger = createLogger();
