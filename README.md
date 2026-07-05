# by Claude for Claude

# exaroton MCP server

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes the
[exaroton](https://exaroton.com) Minecraft server hosting API (by Aternos) to MCP-compatible
clients such as Claude Code, Claude Desktop, and others.

It wraps the official [`exaroton`](https://www.npmjs.com/package/exaroton) Node.js client and
surfaces server management, console, files, player lists, and credit pools as MCP tools.

## Requirements

- Node.js 22 or later
- An exaroton API token — generate one at <https://exaroton.com/account>

## Installation

```bash
npm install
```

## Configuration

The server reads your API token from the `EXAROTON_API_TOKEN` environment variable.

Add it to your MCP client config. For **Claude Desktop** (`claude_desktop_config.json`) or
**Claude Code** (`.mcp.json` / `claude mcp add`):

```json
{
  "mcpServers": {
    "exaroton": {
      "command": "node",
      "args": ["/absolute/path/to/exaroton-mcp-server/src/index.js"],
      "env": {
        "EXAROTON_API_TOKEN": "your-token-here"
      }
    }
  }
}
```

Or with the Claude Code CLI:

```bash
claude mcp add exaroton -e EXAROTON_API_TOKEN=your-token-here -- node /absolute/path/to/exaroton-mcp-server/src/index.js
```

> Keep your token secret — do not commit it to version control.

## Tools

### Account & servers
| Tool | Description |
| --- | --- |
| `get_account` | Account username, email, verification status, and credits. |
| `list_servers` | All servers with ID, name, address, status, software, players. |
| `get_server` | Detailed, up-to-date info for one server. |

### Power controls
| Tool | Description |
| --- | --- |
| `start_server` | Start a server (optionally with your own credits). |
| `stop_server` | Stop a running server. |
| `restart_server` | Restart a running server. |
| `extend_stop_time` | Extend the auto-stop timer by N seconds. |

### Console & logs
| Tool | Description |
| --- | --- |
| `execute_command` | Run a console command. |
| `get_server_logs` | Fetch current log contents (cached). |
| `share_server_logs` | Upload logs to mclo.gs and return a URL. |

### Settings
| Tool | Description |
| --- | --- |
| `get_ram` / `set_ram` | Read / set assigned RAM in GiB (2–16). |
| `get_motd` / `set_motd` | Read / set the message of the day. |

### Player lists (whitelist, ops, bans, …)
| Tool | Description |
| --- | --- |
| `get_player_lists` | List available player-list names. |
| `get_player_list_entries` | Get entries in a named list. |
| `add_player_list_entries` | Add one or more entries. |
| `delete_player_list_entries` | Remove one or more entries. |

### Files
| Tool | Description |
| --- | --- |
| `get_file_info` | Metadata for a file or directory. |
| `list_files` | List a directory's children. |
| `read_file` | Read a text file's content. |
| `write_file` | Overwrite / create a text file. |
| `delete_file` | Delete a file or directory. |
| `create_directory` | Create a directory. |

### Credit pools
| Tool | Description |
| --- | --- |
| `list_credit_pools` | All credit pools with balances and shares. |
| `get_pool` | Details for one pool. |
| `get_pool_members` | Members of a pool. |
| `get_pool_servers` | Servers paid for by a pool. |

## Notes

- Server status is returned both as the numeric exaroton code and a friendly `statusName`
  (`offline`, `online`, `starting`, `stopping`, `restarting`, `saving`, `loading`, `crashed`,
  `pending`, `transferring`, `preparing`).
- Power actions fail if the server is in the wrong state (e.g. stopping an offline server); the
  error is returned to the model rather than crashing the server.
- Logs are cached and are unavailable while the server is loading, stopping, or saving.

## Development

```bash
npm start   # runs the server on stdio
```

## License

MIT
