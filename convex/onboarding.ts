import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireViewer } from "./lib/auth";
import type { Role } from "./lib/validators";

export type ChecklistItem = {
  key: string;
  label: string;
  description: string;
  href: string;
  done: boolean;
};

const DEMO_COMPANY_PREFIX = "Demo Trading Co.";

/**
 * Getting-started checklist computed from real workspace data (bounded,
 * indexed reads). An item is ticked only when the record actually exists.
 */
async function checklistFor(ctx: QueryCtx, role: Role): Promise<ChecklistItem[]> {
  const items: ChecklistItem[] = [];

  if (role === "admin") {
    const companies = await ctx.db
      .query("companies")
      .withIndex("by_active", (q) => q.eq("active", true))
      .take(50);
    const companyConfigured = companies.some(
      (c) => !c.name.startsWith(DEMO_COMPANY_PREFIX) && Boolean(c.address) && Boolean(c.bankName || c.accountNumber),
    );
    const activeTemplate = await ctx.db
      .query("contractTemplates")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .first();
    const activeUsers = await ctx.db
      .query("users")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .take(2);
    items.push(
      {
        key: "company",
        label: "Configure your company",
        description: "Replace the placeholder with your legal entity, address and bank details.",
        href: "/admin/masters?tab=companies",
        done: companyConfigured,
      },
      {
        key: "template",
        label: "Activate a contract template",
        description: "Review the clauses, then activate and set a default template.",
        href: "/contract-templates",
        done: activeTemplate !== null,
      },
      {
        key: "team",
        label: "Approve a team member",
        description: "Approve a pending sign-up and assign Manager or Staff.",
        href: "/admin/team",
        done: activeUsers.length >= 2,
      },
    );
  }

  const supplier = await ctx.db
    .query("counterparties")
    .withIndex("by_archived_and_name", (q) => q.eq("archived", false))
    .first();
  const trade = await ctx.db.query("trades").withIndex("by_tradeDate").first();
  const confirmed =
    (await ctx.db
      .query("trades")
      .withIndex("by_status_and_date", (q) => q.eq("status", "confirmed"))
      .first()) ??
    (await ctx.db
      .query("trades")
      .withIndex("by_status_and_date", (q) => q.eq("status", "closed"))
      .first());
  const contract = await ctx.db.query("contracts").withIndex("by_updatedAt").first();
  const bl = await ctx.db.query("blDocuments").withIndex("by_status").first();
  const document = await ctx.db
    .query("documents")
    .withIndex("by_archived", (q) => q.eq("archived", false))
    .first();

  items.push(
    {
      key: "supplier",
      label: "Add a supplier",
      description: "Save contacts, bank details and default terms once.",
      href: "/suppliers/new",
      done: supplier !== null,
    },
    {
      key: "trade",
      label: "Book your first trade",
      description: "Use the 5-step wizard — supplier defaults fill in for you.",
      href: "/physical-trades/new",
      done: trade !== null,
    },
    {
      key: "confirm",
      label: role === "staff" ? "Get a trade confirmed" : "Confirm a trade",
      description:
        role === "staff"
          ? "Submit a trade for review; a Manager confirms it."
          : "Approve a trade that is In Review, or confirm your own.",
      href: "/physical-trades?status=pending_review",
      done: confirmed !== null,
    },
    {
      key: "contract",
      label: "Generate a contract",
      description: "Open a trade's Contract tab and generate the draft from trade data.",
      href: "/contracts",
      done: contract !== null,
    },
    {
      key: "bl",
      label: "Prepare a B/L",
      description: "On a confirmed trade's B/L & Dispatch tab, create the B/L from the trade.",
      href: "/dispatch",
      done: bl !== null,
    },
    {
      key: "document",
      label: "Upload a document",
      description: "Attach an invoice, packing list or certificate to a trade.",
      href: "/documents?upload=1",
      done: document !== null,
    },
  );
  return items;
}

async function prefsOf(ctx: QueryCtx, user: Doc<"users">) {
  return await ctx.db
    .query("userPrefs")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .unique();
}

export const progress = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireViewer(ctx);
    const prefs = await prefsOf(ctx, user);
    const items = await checklistFor(ctx, user.role!);
    return {
      role: user.role!,
      items,
      completed: items.filter((i) => i.done).length,
      total: items.length,
      prefs: {
        welcomeSeenAt: prefs?.welcomeSeenAt ?? null,
        toursCompleted: prefs?.toursCompleted ?? [],
        checklistDismissed: prefs?.checklistDismissed ?? false,
        checklistCollapsed: prefs?.checklistCollapsed ?? false,
      },
    };
  },
});

/** Updates the viewer's own onboarding preferences only. */
export const updatePrefs = mutation({
  args: {
    welcomeSeen: v.optional(v.boolean()),
    tourCompleted: v.optional(v.string()),
    resetTours: v.optional(v.boolean()),
    checklistDismissed: v.optional(v.boolean()),
    checklistCollapsed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireViewer(ctx);
    const existing = await prefsOf(ctx, user);
    let tours = existing?.toursCompleted ?? [];
    if (args.resetTours) tours = [];
    if (args.tourCompleted && !tours.includes(args.tourCompleted)) tours = [...tours, args.tourCompleted.slice(0, 40)];
    const next = {
      welcomeSeenAt: args.welcomeSeen === undefined ? existing?.welcomeSeenAt : args.welcomeSeen ? Date.now() : undefined,
      toursCompleted: tours.slice(-50),
      checklistDismissed: args.checklistDismissed ?? existing?.checklistDismissed ?? false,
      checklistCollapsed: args.checklistCollapsed ?? existing?.checklistCollapsed ?? false,
      updatedAt: Date.now(),
    };
    if (existing) await ctx.db.patch(existing._id, next);
    else await ctx.db.insert("userPrefs", { userId: user._id, ...next });
  },
});
