#!/usr/bin/env node
// @ts-nocheck
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getFileTree } from "./utils.js";

import { createClient, describeServer } from "./client.js";

const client = createClient();

const server = new McpServer({
  name: "exaroton-mcp-server",
  version: "1.0.0",
});

/**
 * Wrap a tool handler so that returned data is JSON-serialized and thrown
 * errors are reported back to the model as tool errors instead of crashing.
 *
 * @param {(args: object) => Promise<unknown>} handler
 */
function tool(handler) {
  return async (args) => {
    try {
      const result = await handler(args ?? {});
      const text =
        typeof result === "string" ? result : JSON.stringify(result, null, 2);
      return { content: [{ type: "text", text }] };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text", text: `Error: ${err?.message ?? String(err)}` }],
      };
    }
  };
}

const serverId = z
  .string()
  .describe("The exaroton server ID (e.g. 'xxxxxxxxxxxxxxxx').");

/* ------------------------------------------------------------------ */
/* Account & listing                                                   */
/* ------------------------------------------------------------------ */

server.registerTool(
  "get_account",
  {
    title: "Get account info",
    description:
      "Get information about the exaroton account tied to the API token, including username, email, verification status, and remaining credits.",
    inputSchema: {},
  },
  tool(async () => {
    const account = await client.getAccount();
    return {
      name: account.name,
      email: account.email,
      verified: account.verified,
      credits: account.credits,
    };
  })
);

server.registerTool(
  "list_servers",
  {
    title: "List servers",
    description:
      "List all servers on the account with their ID, name, address, current status, software, and player counts.",
    inputSchema: {},
  },
  tool(async () => {
    const servers = await client.getServers();
    return servers.map(describeServer);
  })
);

server.registerTool(
  "get_server",
  {
    title: "Get server info",
    description:
      "Get detailed, up-to-date information about a single server, including status, address, host/port (when online), software, MOTD, and players.",
    inputSchema: { server_id: serverId },
  },
  tool(async ({ server_id }) => {
    const s = client.server(server_id);
    await s.get();
    return describeServer(s);
  })
);

/* ------------------------------------------------------------------ */
/* Power controls                                                      */
/* ------------------------------------------------------------------ */

server.registerTool(
  "start_server",
  {
    title: "Start server",
    description:
      "Start a server. Fails if the server is not currently offline. Set use_own_credits to true to pay with your own credits even when the server belongs to a credit pool.",
    inputSchema: {
      server_id: serverId,
      use_own_credits: z
        .boolean()
        .optional()
        .describe("Use your own credits instead of a shared pool. Defaults to false."),
    },
  },
  tool(async ({ server_id, use_own_credits = false }) => {
    await client.server(server_id).start(use_own_credits);
    return `Start request sent for server ${server_id}.`;
  })
);

server.registerTool(
  "stop_server",
  {
    title: "Stop server",
    description: "Stop a running server. Fails if the server is not online.",
    inputSchema: { server_id: serverId },
  },
  tool(async ({ server_id }) => {
    await client.server(server_id).stop();
    return `Stop request sent for server ${server_id}.`;
  })
);

server.registerTool(
  "restart_server",
  {
    title: "Restart server",
    description: "Restart a running server. Fails if the server is not online.",
    inputSchema: { server_id: serverId },
  },
  tool(async ({ server_id }) => {
    await client.server(server_id).restart();
    return `Restart request sent for server ${server_id}.`;
  })
);

server.registerTool(
  "extend_stop_time",
  {
    title: "Extend auto-stop timer",
    description:
      "Extend the time (in seconds) until the server automatically stops.",
    inputSchema: {
      server_id: serverId,
      seconds: z.number().int().positive().describe("Seconds to add to the stop timer."),
    },
  },
  tool(async ({ server_id, seconds }) => {
    await client.server(server_id).extendStopTime(seconds);
    return `Extended stop time by ${seconds}s for server ${server_id}.`;
  })
);

/* ------------------------------------------------------------------ */
/* Console                                                             */
/* ------------------------------------------------------------------ */

server.registerTool(
  "execute_command",
  {
    title: "Execute console command",
    description:
      "Run a command in the server console (e.g. 'say Hello world!'). The server must be online.",
    inputSchema: {
      server_id: serverId,
      command: z.string().describe("The console command to execute, without a leading slash."),
    },
  },
  tool(async ({ server_id, command }) => {
    await client.server(server_id).executeCommand(command);
    return `Command executed on server ${server_id}: ${command}`;
  })
);

server.registerTool(
  "get_server_logs",
  {
    title: "Get server logs",
    description:
      "Get the current server log contents. Cached, so it may lag slightly; not available while the server is loading, stopping, or saving.",
    inputSchema: { server_id: serverId },
  },
  tool(async ({ server_id }) => {
    return await client.server(server_id).getLogs();
  })
);

server.registerTool(
  "share_server_logs",
  {
    title: "Share server logs",
    description:
      "Upload the server logs to mclo.gs and return a shareable URL. Cached; not available while the server is loading, stopping, or saving.",
    inputSchema: { server_id: serverId },
  },
  tool(async ({ server_id }) => {
    const url = await client.server(server_id).shareLogs();
    return `Logs shared: ${url}`;
  })
);

/* ------------------------------------------------------------------ */
/* Options: RAM, MOTD, generic                                         */
/* ------------------------------------------------------------------ */

server.registerTool(
  "get_ram",
  {
    title: "Get server RAM",
    description: "Get the amount of RAM (in GiB) assigned to the server.",
    inputSchema: { server_id: serverId },
  },
  tool(async ({ server_id }) => {
    const ram = await client.server(server_id).getRAM();
    return `Server ${server_id} has ${ram} GiB of RAM.`;
  })
);

server.registerTool(
  "set_ram",
  {
    title: "Set server RAM",
    description: "Set the RAM (in full GiB) assigned to the server. Must be between 2 and 16.",
    inputSchema: {
      server_id: serverId,
      ram: z.number().int().min(2).max(16).describe("RAM in GiB (2-16)."),
    },
  },
  tool(async ({ server_id, ram }) => {
    await client.server(server_id).setRAM(ram);
    return `Set RAM of server ${server_id} to ${ram} GiB.`;
  })
);

server.registerTool(
  "get_motd",
  {
    title: "Get server MOTD",
    description: "Get the server's message of the day (MOTD).",
    inputSchema: { server_id: serverId },
  },
  tool(async ({ server_id }) => {
    return await client.server(server_id).getMOTD();
  })
);

server.registerTool(
  "set_motd",
  {
    title: "Set server MOTD",
    description: "Set the server's message of the day (MOTD).",
    inputSchema: {
      server_id: serverId,
      motd: z.string().describe("The new MOTD text."),
    },
  },
  tool(async ({ server_id, motd }) => {
    await client.server(server_id).setMOTD(motd);
    return `Set MOTD of server ${server_id}.`;
  })
);

/* ------------------------------------------------------------------ */
/* Player lists (whitelist, ops, bans, ...)                            */
/* ------------------------------------------------------------------ */

server.registerTool(
  "get_player_lists",
  {
    title: "List player lists",
    description:
      "List the names of all available player lists for the server (e.g. whitelist, ops, banned-players, banned-ips).",
    inputSchema: { server_id: serverId },
  },
  tool(async ({ server_id }) => {
    const lists = await client.server(server_id).getPlayerLists();
    return lists.map((l) => l.getName());
  })
);

server.registerTool(
  "get_player_list_entries",
  {
    title: "Get player list entries",
    description:
      "Get all entries in a named player list (e.g. the usernames on the whitelist).",
    inputSchema: {
      server_id: serverId,
      list: z.string().describe("Player list name, e.g. 'whitelist', 'ops', 'banned-players'."),
    },
  },
  tool(async ({ server_id, list }) => {
    return await client.server(server_id).getPlayerList(list).getEntries();
  })
);

server.registerTool(
  "add_player_list_entries",
  {
    title: "Add player list entries",
    description:
      "Add one or more entries (usually usernames) to a named player list. Combine multiple entries in one call when possible.",
    inputSchema: {
      server_id: serverId,
      list: z.string().describe("Player list name, e.g. 'whitelist'."),
      entries: z.array(z.string()).min(1).describe("Entries to add, e.g. ['Steve', 'Alex']."),
    },
  },
  tool(async ({ server_id, list, entries }) => {
    await client.server(server_id).getPlayerList(list).addEntries(entries);
    return `Added ${entries.length} entr${entries.length === 1 ? "y" : "ies"} to '${list}' on server ${server_id}.`;
  })
);

server.registerTool(
  "delete_player_list_entries",
  {
    title: "Delete player list entries",
    description:
      "Delete one or more entries from a named player list. Combine multiple entries in one call when possible.",
    inputSchema: {
      server_id: serverId,
      list: z.string().describe("Player list name, e.g. 'whitelist'."),
      entries: z.array(z.string()).min(1).describe("Entries to remove, e.g. ['Steve', 'Alex']."),
    },
  },
  tool(async ({ server_id, list, entries }) => {
    await client.server(server_id).getPlayerList(list).deleteEntries(entries);
    return `Deleted ${entries.length} entr${entries.length === 1 ? "y" : "ies"} from '${list}' on server ${server_id}.`;
  })
);

/* ------------------------------------------------------------------ */
/* Files                                                               */
/* ------------------------------------------------------------------ */

server.registerTool(
  "get_file_info",
  {
    title: "Get file info",
    description:
      "Get metadata for a file or directory (name, size, whether it is a directory/text/config file, readable/writable flags).",
    inputSchema: {
      server_id: serverId,
      path: z.string().describe("File path relative to the server root, e.g. 'server.properties'."),
    },
  },
  tool(async ({ server_id, path }) => {
    const file = client.server(server_id).getFile(path);
    await file.getInfo();
    return {
      path: file.path,
      name: file.name,
      size: file.size,
      isDirectory: file.isDirectory,
      isTextFile: file.isTextFile,
      isConfigFile: file.isConfigFile,
      isLog: file.isLog,
      isReadable: file.isReadable,
      isWritable: file.isWritable,
    };
  })
);

server.registerTool(
  "list_files",
  {
    title: "List directory",
    description:
      "List the children of a directory on the server. Use an empty path or '/' for the server root.",
    inputSchema: {
      server_id: serverId,
      path: z.string().default("").describe("Directory path relative to the server root. Empty for root."),
    },
  },
  tool(async ({ server_id, path = "" }) => {
    const children = await client.server(server_id).getFile(path).getChildren();
    if (!children) return "Path is not a directory or has no children.";
    return children.map((c) => ({
      path: c.path,
      name: c.name,
      isDirectory: c.isDirectory,
      size: c.size,
    }));
  })
);

server.registerTool(
  "file_tree",
  {
    title: "file tree",
    description:
      "Recursively list the file tree of a directory on the server. Use an empty path or '/' for the server root. A full scan can take ~30s, so results are cached for 5 minutes per (server, path, dirs_only); pass force_refresh to bypass the cache.",
    inputSchema: {
      server_id: serverId,
      path: z.string().default("").describe("Directory path relative to the server root. Empty for root."),
      dirs_only: z
        .boolean()
        .default(false)
        .describe("If true, only include directories and omit file names. Defaults to false."),
      force_refresh: z
        .boolean()
        .default(false)
        .describe("If true, bypass the cache and re-scan. Defaults to false."),
    },
  },
  tool(async ({ server_id, path = "", dirs_only = false, force_refresh = false }) => {
    const tree = await getFileTree(client, server_id, path || "/", {
      dirsOnly: dirs_only,
      force: force_refresh,
    });
    return tree;
  })
);

server.registerTool(
  "read_file",
  {
    title: "Read file",
    description:
      "Read the text content of a file on the server. Avoid on very large or binary files.",
    inputSchema: {
      server_id: serverId,
      path: z.string().describe("File path relative to the server root."),
    },
  },
  tool(async ({ server_id, path }) => {
    return await client.server(server_id).getFile(path).getContent();
  })
);

server.registerTool(
  "read_file_by_lines",
  {
    title: "Read file by lines",
    description:
      "Read the text content of a file on the server line by line. Avoid on very large or binary files.",
    inputSchema: {
      server_id: serverId,
      from: z.number().int().min(0).default(0).describe("Starting line number (0-based)."),
      to: z.number().int().min(0).optional().describe("Ending line number (0-based, inclusive)."),
      path: z.string().describe("File path relative to the server root."),
    },
  },
  tool(async ({ server_id, path, from, to }) => {
    const content = await client.server(server_id).getFile(path).getContent();
    const lines = content.split('\n');
    return lines.slice(from, to);
  })
);

server.registerTool(
  "write_file",
  {
    title: "Write file",
    description:
      "Write (overwrite) the text content of a file on the server. Creates the file if it does not exist.",
    inputSchema: {
      server_id: serverId,
      path: z.string().describe("File path relative to the server root."),
      content: z.string().describe("The full new content of the file."),
    },
  },
  tool(async ({ server_id, path, content }) => {
    await client.server(server_id).getFile(path).putContent(content);
    return `Wrote ${content.length} bytes to '${path}' on server ${server_id}.`;
  })
);

server.registerTool(
  "write_file_by_lines",
  {
    title: "Write file by lines",
    description:
      "Write (overwrite) the text content of a file on the server line by line. Creates the file if it does not exist.",
    inputSchema: {
      server_id: serverId,
      path: z.string().describe("File path relative to the server root."),
      from: z.number().int().min(0).default(0).describe("Starting line number (0-based)."),
      to: z.number().int().min(0).optional().describe("Ending line number (0-based, inclusive)."),
      content: z.string().describe("The full new content of the file."),
    },
  },
  tool(async ({ server_id, path, from, to, content }) => {
    let existingContent = "";
    try {
      existingContent = await client.server(server_id).getFile(path).getContent();
    } catch (err) {
      // If the file does not exist, we treat it as empty.
      if (err.message.includes("File not found")) {
        existingContent = "";
      } else {
        throw err;
      }
    }
    const lines = existingContent.split('\n');
    const newLines = lines.slice(0, from).concat(content.split('\n')).concat(lines.slice(to + 1));
    const newContent = newLines.join('\n');
    await client.server(server_id).getFile(path).putContent(newContent);
    return `Wrote ${newContent.length} bytes to '${path}' on server ${server_id}.`;
  })
);

server.registerTool(
  "delete_file",
  {
    title: "Delete file",
    description: "Delete a file or directory on the server.",
    inputSchema: {
      server_id: serverId,
      path: z.string().describe("File or directory path relative to the server root."),
    },
  },
  tool(async ({ server_id, path }) => {
    await client.server(server_id).getFile(path).delete();
    return `Deleted '${path}' on server ${server_id}.`;
  })
);

server.registerTool(
  "create_directory",
  {
    title: "Create directory",
    description: "Create a new directory on the server.",
    inputSchema: {
      server_id: serverId,
      path: z.string().describe("Directory path relative to the server root."),
    },
  },
  tool(async ({ server_id, path }) => {
    await client.server(server_id).getFile(path).createAsDirectory();
    return `Created directory '${path}' on server ${server_id}.`;
  })
);

server.registerTool(
  "upload_file",
  {
    title: "Upload file",
    description:
      "Upload a local file (binary-safe, e.g. a plugin or mod .jar) from the machine running this MCP server to a path on the game server. Overwrites the destination if it exists.",
    inputSchema: {
      server_id: serverId,
      source_path: z
        .string()
        .describe("Absolute path to the local file to upload, e.g. '/home/user/EssentialsX.jar'."),
      path: z
        .string()
        .describe("Destination path on the server relative to its root, e.g. 'plugins/EssentialsX.jar'."),
    },
  },
  tool(async ({ server_id, source_path, path }) => {
    await client.server(server_id).getFile(path).upload(source_path);
    return `Uploaded '${source_path}' to '${path}' on server ${server_id}.`;
  })
);

server.registerTool(
  "download_file",
  {
    title: "Download file",
    description:
      "Download a file from the game server to a local path on the machine running this MCP server (binary-safe).",
    inputSchema: {
      server_id: serverId,
      path: z
        .string()
        .describe("Source path on the server relative to its root, e.g. 'world/level.dat'."),
      destination_path: z
        .string()
        .describe("Absolute local path to write the downloaded file to."),
    },
  },
  tool(async ({ server_id, path, destination_path }) => {
    await client.server(server_id).getFile(path).download(destination_path);
    return `Downloaded '${path}' from server ${server_id} to '${destination_path}'.`;
  })
);

/* ------------------------------------------------------------------ */
/* Credit pools                                                        */
/* ------------------------------------------------------------------ */

server.registerTool(
  "list_credit_pools",
  {
    title: "List credit pools",
    description:
      "List all credit pools the account is a member of, with balances and share information.",
    inputSchema: {},
  },
  tool(async () => {
    const pools = await client.getPools();
    return pools.map((p) => ({
      id: p.id,
      name: p.name,
      credits: p.credits,
      servers: p.servers,
      members: p.members,
      isOwner: p.isOwner,
      ownShare: p.ownShare,
      ownCredits: p.ownCredits,
    }));
  })
);

server.registerTool(
  "get_pool",
  {
    title: "Get credit pool",
    description: "Get detailed information about a single credit pool by ID.",
    inputSchema: {
      pool_id: z.string().describe("The credit pool ID."),
    },
  },
  tool(async ({ pool_id }) => {
    const pool = client.pool(pool_id);
    await pool.get();
    return {
      id: pool.id,
      name: pool.name,
      credits: pool.credits,
      servers: pool.servers,
      members: pool.members,
      owner: pool.owner,
      isOwner: pool.isOwner,
      ownShare: pool.ownShare,
      ownCredits: pool.ownCredits,
    };
  })
);

server.registerTool(
  "get_pool_members",
  {
    title: "Get credit pool members",
    description: "List the members of a credit pool and their shares.",
    inputSchema: {
      pool_id: z.string().describe("The credit pool ID."),
    },
  },
  tool(async ({ pool_id }) => {
    return await client.pool(pool_id).getMembers();
  })
);

server.registerTool(
  "get_pool_servers",
  {
    title: "Get credit pool servers",
    description: "List the servers paid for by a credit pool.",
    inputSchema: {
      pool_id: z.string().describe("The credit pool ID."),
    },
  },
  tool(async ({ pool_id }) => {
    const servers = await client.pool(pool_id).getServers();
    return servers.map(describeServer);
  })
);

/* ------------------------------------------------------------------ */

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr so we don't corrupt the stdio JSON-RPC stream.
  console.error("exaroton MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting exaroton MCP server:", err);
  process.exit(1);
});
