import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { asUser, makeTest } from "./helpers";

describe("users & access control", () => {
  test("unauthenticated callers are rejected", async () => {
    const t = makeTest();
    await expect(t.query(api.users.directory, {})).rejects.toThrow(/sign in/i);
    expect(await t.query(api.users.me, {})).toBeNull();
  });

  test("pending accounts cannot read business data", async () => {
    const t = makeTest();
    const { client } = await asUser(t, "staff", { status: "pending" });
    await expect(client.query(api.lookups.list, { kind: "currency" })).rejects.toThrow(/awaiting approval/i);
  });

  test("only admins can list users or change access", async () => {
    const t = makeTest();
    const { client: manager } = await asUser(t, "manager");
    const { userId: staffId, client: staff } = await asUser(t, "staff");
    await expect(manager.query(api.users.list, {})).rejects.toThrow(/access denied/i);
    await expect(manager.mutation(api.users.setAccess, { userId: staffId, role: "admin" })).rejects.toThrow(
      /access denied/i,
    );
    await expect(staff.mutation(api.users.setAccess, { userId: staffId, role: "admin" })).rejects.toThrow(
      /access denied/i,
    );
  });

  test("a user cannot change their own role through profile update", async () => {
    const t = makeTest();
    const { userId, client } = await asUser(t, "staff");
    // updateProfile only accepts name/title; extra fields are rejected by the validator.
    await expect(
      client.mutation(api.users.updateProfile, { name: "X", role: "admin" } as unknown as { name: string }),
    ).rejects.toThrow();
    await client.mutation(api.users.updateProfile, { name: "Renamed" });
    const me = await t.run((ctx) => ctx.db.get(userId));
    expect(me?.role).toBe("staff");
    expect(me?.name).toBe("Renamed");
  });

  test("admins cannot demote themselves and the last admin is protected", async () => {
    const t = makeTest();
    const { userId: adminId, client: admin } = await asUser(t, "admin");
    await expect(admin.mutation(api.users.setAccess, { userId: adminId, role: "staff" })).rejects.toThrow(
      /own role/i,
    );
    const { userId: staffId } = await asUser(t, "staff", { status: "pending" });
    await admin.mutation(api.users.setAccess, { userId: staffId, status: "active", role: "manager" });
    const promoted = await t.run((ctx) => ctx.db.get(staffId));
    expect(promoted?.role).toBe("manager");
    expect(promoted?.status).toBe("active");
  });
});
