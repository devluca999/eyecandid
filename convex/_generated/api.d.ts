/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as access from "../access.js";
import type * as account from "../account.js";
import type * as billing from "../billing.js";
import type * as crons from "../crons.js";
import type * as edits from "../edits.js";
import type * as entitlements from "../entitlements.js";
import type * as events from "../events.js";
import type * as flags from "../flags.js";
import type * as funnel from "../funnel.js";
import type * as http from "../http.js";
import type * as jobs from "../jobs.js";
import type * as lib_docs from "../lib/docs.js";
import type * as lib_entitle from "../lib/entitle.js";
import type * as lib_flags from "../lib/flags.js";
import type * as lib_mediaStore from "../lib/mediaStore.js";
import type * as lib_owner from "../lib/owner.js";
import type * as lib_users from "../lib/users.js";
import type * as lib_webhookSig from "../lib/webhookSig.js";
import type * as lib_workerAuth from "../lib/workerAuth.js";
import type * as media from "../media.js";
import type * as notify from "../notify.js";
import type * as pipeline from "../pipeline.js";
import type * as presence from "../presence.js";
import type * as projects from "../projects.js";
import type * as users from "../users.js";
import type * as wake from "../wake.js";
import type * as workers from "../workers.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  account: typeof account;
  billing: typeof billing;
  crons: typeof crons;
  edits: typeof edits;
  entitlements: typeof entitlements;
  events: typeof events;
  flags: typeof flags;
  funnel: typeof funnel;
  http: typeof http;
  jobs: typeof jobs;
  "lib/docs": typeof lib_docs;
  "lib/entitle": typeof lib_entitle;
  "lib/flags": typeof lib_flags;
  "lib/mediaStore": typeof lib_mediaStore;
  "lib/owner": typeof lib_owner;
  "lib/users": typeof lib_users;
  "lib/webhookSig": typeof lib_webhookSig;
  "lib/workerAuth": typeof lib_workerAuth;
  media: typeof media;
  notify: typeof notify;
  pipeline: typeof pipeline;
  presence: typeof presence;
  projects: typeof projects;
  users: typeof users;
  wake: typeof wake;
  workers: typeof workers;
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
