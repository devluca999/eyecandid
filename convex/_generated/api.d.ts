/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as crons from "../crons.js";
import type * as edits from "../edits.js";
import type * as events from "../events.js";
import type * as flags from "../flags.js";
import type * as http from "../http.js";
import type * as jobs from "../jobs.js";
import type * as lib_docs from "../lib/docs.js";
import type * as lib_mediaStore from "../lib/mediaStore.js";
import type * as lib_owner from "../lib/owner.js";
import type * as lib_workerAuth from "../lib/workerAuth.js";
import type * as media from "../media.js";
import type * as pipeline from "../pipeline.js";
import type * as projects from "../projects.js";
import type * as workers from "../workers.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  crons: typeof crons;
  edits: typeof edits;
  events: typeof events;
  flags: typeof flags;
  http: typeof http;
  jobs: typeof jobs;
  "lib/docs": typeof lib_docs;
  "lib/mediaStore": typeof lib_mediaStore;
  "lib/owner": typeof lib_owner;
  "lib/workerAuth": typeof lib_workerAuth;
  media: typeof media;
  pipeline: typeof pipeline;
  projects: typeof projects;
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
