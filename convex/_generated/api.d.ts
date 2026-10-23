/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activity from "../activity.js";
import type * as ai from "../ai.js";
import type * as auth from "../auth.js";
import type * as blDocuments from "../blDocuments.js";
import type * as commodities from "../commodities.js";
import type * as companies from "../companies.js";
import type * as contractTemplates from "../contractTemplates.js";
import type * as contracts from "../contracts.js";
import type * as counterparties from "../counterparties.js";
import type * as dashboard from "../dashboard.js";
import type * as dispatch from "../dispatch.js";
import type * as documents from "../documents.js";
import type * as fx from "../fx.js";
import type * as http from "../http.js";
import type * as lib_ai from "../lib/ai.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_blDraft from "../lib/blDraft.js";
import type * as lib_defaults from "../lib/defaults.js";
import type * as lib_documents from "../lib/documents.js";
import type * as lib_format from "../lib/format.js";
import type * as lib_helpContent from "../lib/helpContent.js";
import type * as lib_inheritance from "../lib/inheritance.js";
import type * as lib_money from "../lib/money.js";
import type * as lib_numbering from "../lib/numbering.js";
import type * as lib_roles from "../lib/roles.js";
import type * as lib_search from "../lib/search.js";
import type * as lib_settings from "../lib/settings.js";
import type * as lib_shipment from "../lib/shipment.js";
import type * as lib_templateEngine from "../lib/templateEngine.js";
import type * as lib_tradeValidation from "../lib/tradeValidation.js";
import type * as lib_validators from "../lib/validators.js";
import type * as lib_workflow from "../lib/workflow.js";
import type * as lookups from "../lookups.js";
import type * as onboarding from "../onboarding.js";
import type * as search from "../search.js";
import type * as seed from "../seed.js";
import type * as settings from "../settings.js";
import type * as tradeTemplates from "../tradeTemplates.js";
import type * as trades from "../trades.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activity: typeof activity;
  ai: typeof ai;
  auth: typeof auth;
  blDocuments: typeof blDocuments;
  commodities: typeof commodities;
  companies: typeof companies;
  contractTemplates: typeof contractTemplates;
  contracts: typeof contracts;
  counterparties: typeof counterparties;
  dashboard: typeof dashboard;
  dispatch: typeof dispatch;
  documents: typeof documents;
  fx: typeof fx;
  http: typeof http;
  "lib/ai": typeof lib_ai;
  "lib/audit": typeof lib_audit;
  "lib/auth": typeof lib_auth;
  "lib/blDraft": typeof lib_blDraft;
  "lib/defaults": typeof lib_defaults;
  "lib/documents": typeof lib_documents;
  "lib/format": typeof lib_format;
  "lib/helpContent": typeof lib_helpContent;
  "lib/inheritance": typeof lib_inheritance;
  "lib/money": typeof lib_money;
  "lib/numbering": typeof lib_numbering;
  "lib/roles": typeof lib_roles;
  "lib/search": typeof lib_search;
  "lib/settings": typeof lib_settings;
  "lib/shipment": typeof lib_shipment;
  "lib/templateEngine": typeof lib_templateEngine;
  "lib/tradeValidation": typeof lib_tradeValidation;
  "lib/validators": typeof lib_validators;
  "lib/workflow": typeof lib_workflow;
  lookups: typeof lookups;
  onboarding: typeof onboarding;
  search: typeof search;
  seed: typeof seed;
  settings: typeof settings;
  tradeTemplates: typeof tradeTemplates;
  trades: typeof trades;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
