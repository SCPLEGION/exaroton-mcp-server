// @ts-nocheck
import { Client } from "exaroton";
import pLimit from "p-limit";

/*
 * The exaroton API rate-limits by request rate: bursts return HTTP 429 with an
 * HTML (non-JSON) body, which the exaroton library mis-surfaces as
 * "TypeError: Cannot read properties of null (reading 'success')". We avoid it
 * with (1) a global throttle spacing out request starts and (2) retry-with-backoff.
 */
const MIN_GAP_MS = 150; // ~6.6 requests/second globally
const CONCURRENCY = 4;
const RETRIES = 5;
const BASE_DELAY_MS = 500;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let nextSlot = 0;
async function throttle() {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + MIN_GAP_MS;
  if (wait) await new Promise((r) => setTimeout(r, wait));
}

async function withRetry(fn, { retries = RETRIES, baseDelay = BASE_DELAY_MS } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      await throttle();
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt > retries) throw err;
      const delay = baseDelay * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

/**
 * Recursively scan a directory into a nested tree object.
 *
 * @param {Client} client
 * @param {string} server_id
 * @param {string} dirPath
 * @param {{ dirsOnly?: boolean }} [options] When dirsOnly is true, file names
 *   are omitted and only the directory structure is returned.
 * @returns {Promise<object>} Nested tree; files live under a `files` array per directory.
 */
async function recursiveScan(client, server_id, dirPath = "/", { dirsOnly = false } = {}) {
  const excludedDirs = new Set(["/plugins/Nexo/pack/template_packs", "/libraries"]);
  const limit = pLimit(CONCURRENCY);
  const tree = {};

  async function walk(currentPath, obj) {
    if (excludedDirs.has(currentPath)) return;

    const children = await limit(() =>
      withRetry(() => client.server(server_id).getFile(currentPath).getChildren())
    );
    if (!children) return;

    const subWalks = [];
    for (const child of children) {
      const name = child.name || child;
      const fullPath = currentPath === "/" ? `/${name}` : `${currentPath}/${name}`;

      if (child.isDirectory || child.type === "dir") {
        obj[name] = {};
        subWalks.push(walk(fullPath, obj[name]));
      } else if (!dirsOnly) {
        (obj.files ??= []).push(name);
      }
    }

    await Promise.all(subWalks);
  }

  await walk(dirPath, tree);

  return tree;
}

/*
 * A full recursive scan can take ~30s, so cache results per
 * (server_id, path, dirsOnly) for a short TTL. The cache stores the in-flight
 * promise, so concurrent MCP calls for the same key share a single scan.
 */
const scanCache = new Map(); // key -> { at: number, promise: Promise<object> }

function cacheKey(server_id, dirPath, dirsOnly) {
  return `${server_id} ${dirPath} ${dirsOnly ? "d" : "f"}`;
}

/**
 * Cached wrapper around {@link recursiveScan}.
 *
 * @param {Client} client
 * @param {string} server_id
 * @param {string} dirPath
 * @param {{ dirsOnly?: boolean, force?: boolean, ttl?: number }} [options]
 *   force bypasses (and refreshes) the cache; ttl overrides the cache lifetime in ms.
 * @returns {Promise<object>}
 */
async function getFileTree(
  client,
  server_id,
  dirPath = "/",
  { dirsOnly = false, force = false, ttl = CACHE_TTL_MS } = {}
) {
  const path = dirPath || "/";
  const key = cacheKey(server_id, path, dirsOnly);
  const now = Date.now();
  const cached = scanCache.get(key);

  if (!force && cached && now - cached.at < ttl) {
    return cached.promise;
  }

  const promise = recursiveScan(client, server_id, path, { dirsOnly });
  scanCache.set(key, { at: now, promise });

  // Don't cache failures: drop this entry if the scan rejects.
  promise.catch(() => {
    if (scanCache.get(key)?.promise === promise) scanCache.delete(key);
  });

  return promise;
}

export { recursiveScan, getFileTree };
