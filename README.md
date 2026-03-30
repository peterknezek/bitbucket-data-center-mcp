# bitbucket-data-center-mcp

A Model Context Protocol (MCP) server for Bitbucket Data Center, designed to improve developer productivity.

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- [pnpm](https://pnpm.io/) v8 or higher

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BITBUCKET_URL` | Yes | Base URL of your Bitbucket Data Center instance (e.g. `https://bitbucket.example.com`) |
| `BITBUCKET_TOKEN` | Yes | Personal access token for authentication |
| `DEBUG` | No | Set to any value to enable debug logging |

## Installation

```bash
git clone https://github.com/peterknezek/bitbucket-data-center-mcp.git
cd bitbucket-data-center-mcp
pnpm install
```

## Available Tools

| Name | Description |
|------|-------------|
| `get_pr_comments` | Fetches all unresolved inline review comments for the open PR on the current branch. Pass `repoPath` (from `git rev-parse --show-toplevel`) to auto-detect project, repo, and branch via git and enable clickable file links in Cursor. |

## Available Prompts

| Name | Description |
|------|-------------|
| `review-pr-comments` | Fetches and displays all unresolved PR review comments as formatted, navigable links |

## Connecting to an MCP Client

### Cursor

1. Open Cursor settings (Cmd/Ctrl + ,)
2. Navigate to **Tools & MCP** → **Installed MCP Server**
3. Add the following to your `mcp.json`:

```json
{
  "mcpServers": {
    "bitbucket-data-center-mcp": {
      "command": "npm",
      "args": ["--silent", "--prefix", "/path/to/bitbucket-data-center-mcp", "run", "dev"],
      "env": {
        "BITBUCKET_URL": "https://bitbucket.example.com",
        "BITBUCKET_TOKEN": "your-personal-access-token"
      }
    }
  }
}
```

**Note:** Replace `/path/to/bitbucket-data-center-mcp` with the actual path to this repository on your system.

### Claude Desktop

1. Open your Claude Desktop config file:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
2. Add the following to the `mcpServers` section:

```json
{
  "mcpServers": {
    "bitbucket-data-center-mcp": {
      "command": "npm",
      "args": ["--silent", "--prefix", "/path/to/bitbucket-data-center-mcp", "run", "dev"],
      "env": {
        "BITBUCKET_URL": "https://bitbucket.example.com",
        "BITBUCKET_TOKEN": "your-personal-access-token"
      }
    }
  }
}
```

**Note:** Replace `/path/to/bitbucket-data-center-mcp` with the actual path to this repository on your system.

## For Developers

### Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Run the MCP server |
| `pnpm test` | Run tests |
| `pnpm typecheck` | Type-check the project |
| `pnpm inspect` | Launch MCP Inspector UI |

### Debugging with MCP Inspector

The project includes [`@modelcontextprotocol/inspector`](https://github.com/modelcontextprotocol/inspector) as a dev dependency. Use it to interactively test tools, resources, and prompts exposed by the server.

**Start the inspector:**

```bash
pnpm inspect
```

The UI opens at **http://localhost:6274**.

**Connect to the server in the UI:**

| Field | Value |
|-------|-------|
| Transport | `STDIO` |
| Command | `tsx` |
| Arguments | `src/index.ts` |

Click **Connect**. The inspector spawns the server process and proxies the MCP protocol.

**Alternatively, pass the command directly on the CLI:**

```bash
npx @modelcontextprotocol/inspector tsx src/index.ts
```

**Environment variables:** Set `BITBUCKET_URL` and `BITBUCKET_TOKEN` in the **Environment Variables** section of the inspector UI before clicking Connect.
