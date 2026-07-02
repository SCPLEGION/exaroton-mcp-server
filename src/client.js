// @ts-nocheck
import { Client } from "exaroton";

/**
 * Human-readable names for the numeric exaroton server status codes.
 * See https://developers.exaroton.com/#header-server-status
 */
export const STATUS_NAMES = {
  0: "offline",
  1: "online",
  2: "starting",
  3: "stopping",
  4: "restarting",
  5: "saving",
  6: "loading",
  7: "crashed",
  8: "pending",
  9: "transferring",
  10: "preparing",
};

/**
 * Create the shared exaroton API client from the environment.
 *
 * @returns {Client}
 */
export function createClient() {
  const token = process.env.EXAROTON_API_TOKEN;
  if (!token) {
    throw new Error(
      "EXAROTON_API_TOKEN environment variable is not set. " +
        "Generate a token at https://exaroton.com/account and provide it to the MCP server."
    );
  }
  return new Client(token);
}

/**
 * Present a raw server object with a friendly status label added.
 *
 * @param {object} server
 * @returns {object}
 */
export function describeServer(server) {
  const json = typeof server.toJSON === "function" ? server.toJSON() : server;
  return {
    ...json,
    statusName: STATUS_NAMES[json.status] ?? "unknown",
  };
}
