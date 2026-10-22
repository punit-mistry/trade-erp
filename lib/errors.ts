import { ConvexError } from "convex/values";

/** Extracts a user-presentable message from a Convex/server error. */
export function getErrorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (error instanceof ConvexError) {
    const data = error.data as unknown;
    if (typeof data === "string") return data;
    if (data && typeof data === "object" && "message" in data && typeof data.message === "string") {
      return data.message;
    }
  }
  if (error instanceof Error) {
    // Hide server stack noise; Convex prefixes uncaught errors with request ids.
    const m = error.message.match(/Uncaught (?:Convex)?Error: (.*?)(?:\n|$)/);
    if (m) return m[1];
    return error.message || fallback;
  }
  return fallback;
}

export function getErrorCode(error: unknown): string | undefined {
  if (error instanceof ConvexError) {
    const data = error.data as unknown;
    if (data && typeof data === "object" && "code" in data && typeof data.code === "string") return data.code;
  }
  return undefined;
}
