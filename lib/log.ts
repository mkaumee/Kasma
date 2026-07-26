/**
 * Minimal structured (JSON) logger. One line per event with a level,
 * message, ISO timestamp, and arbitrary structured fields — friendly to log
 * aggregators. Swap the sink for a hosted logger later without touching call
 * sites.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

export function formatLine(
  level: LogLevel,
  msg: string,
  fields?: LogFields,
  now: Date = new Date(),
): string {
  return JSON.stringify({ level, msg, ...fields, ts: now.toISOString() });
}

function emit(level: LogLevel, msg: string, fields?: LogFields): void {
  const line = formatLine(level, msg, fields);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, fields?: LogFields) => emit("debug", msg, fields),
  info: (msg: string, fields?: LogFields) => emit("info", msg, fields),
  warn: (msg: string, fields?: LogFields) => emit("warn", msg, fields),
  error: (msg: string, fields?: LogFields) => emit("error", msg, fields),
};
