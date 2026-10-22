/// <reference types="vite/client" />
/**
 * convex-test harness: runs the real Convex functions + schema in memory, no
 * deployment needed. Identities are simulated the way Convex Auth encodes
 * them (`subject = "<userId>|<sessionId>"`).
 */
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import type { Id } from "../convex/_generated/dataModel";
import type { Role } from "../convex/lib/validators";

export const modules = import.meta.glob("../convex/**/*.*s");

export function makeTest() {
  return convexTest(schema, modules);
}

export type TestConvex = ReturnType<typeof makeTest>;

let seq = 0;

/** Inserts an app user and returns a client authenticated as them. */
export async function asUser(
  t: TestConvex,
  role: Role,
  opts: { status?: "active" | "pending" | "disabled"; name?: string; grants?: string[] } = {},
) {
  seq += 1;
  const userId: Id<"users"> = await t.run((ctx) =>
    ctx.db.insert("users", {
      name: opts.name ?? `${role} user ${seq}`,
      email: `${role}${seq}@example.test`,
      role,
      status: opts.status ?? "active",
      grants: opts.grants,
    }),
  );
  const sessionId = await t.run((ctx) =>
    ctx.db.insert("authSessions", { userId, expirationTime: Date.now() + 3_600_000 }),
  );
  return { userId, client: t.withIdentity({ subject: `${userId}|${sessionId}`, name: opts.name }) };
}
