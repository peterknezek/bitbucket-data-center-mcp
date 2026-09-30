# bitbucket-data-center-mcp

A Model Context Protocol (MCP) server for Bitbucket Data Center, designed to improve developer productivity.

## Prerequisites

- [Node.js](https://nodejs.org/) v22.19 or higher (v24 LTS recommended)
- [pnpm](https://pnpm.io/) v9 or higher

## Environment Variables

| Variable          | Required | Description                                                                            |
| ----------------- | -------- | -------------------------------------------------------------------------------------- |
| `BITBUCKET_URL`   | Yes      | Base URL of your Bitbucket Data Center instance (e.g. `https://bitbucket.example.com`) |
| `BITBUCKET_TOKEN` | Yes      | Personal access token for authentication                                               |
| `DEBUG`           | No       | Set to any value to enable debug logging                                               |

## Installation

```bash
git clone https://github.com/peterknezek/bitbucket-data-center-mcp.git
cd bitbucket-data-center-mcp
pnpm install
```

## Available Tools

| Name                   | Description                                                                                                                                                                                                                                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_pr_comments`      | Fetches all unresolved inline review comments for the open PR on the current branch, including full reply threads rendered as nested trees. Pass `repoPath` (from `git rev-parse --show-toplevel`) to auto-detect project, repo, and branch via git and enable clickable file links in Cursor.                                     |
| `create_pull_request`  | Creates a pull request on Bitbucket Data Center. Auto-detects project, repo, and branch from `repoPath`. Auto-generates a PR title from branch naming convention (`<type>/<taskId>_<description>`), resolves the default target branch, validates that the branch has been pushed, and optionally adds reviewers and draft status. |
| `get_pr_review_status` | Checks whether a pull request has been reviewed and, if so, whether it was approved. The status is derived from reviewer statuses in the Bitbucket API, without LLM analysis. Pass `prId`, or `repoPath` to use the open PR for the current branch. See [PR review status](#pr-review-status).                                     |
| `reply_to_pr_comment`  | Posts a reply to a specific pull request comment by its ID. Use the comment IDs returned by `get_pr_comments`. Useful for acknowledging a review comment or explaining what fix was applied. Pass `repoPath` (from `git rev-parse --show-toplevel`) to auto-detect project, repo, and branch.                                      |

### PR review status

`get_pr_review_status` reads the reviewers of a pull request and returns one of the following statuses:

| Status         | Meaning                                                                        | Reviewed | Approved |
| -------------- | ------------------------------------------------------------------------------ | -------- | -------- |
| `APPROVED`     | At least one reviewer approved and nobody marked the PR as **Needs work**      | yes      | yes      |
| `NEEDS_WORK`   | At least one reviewer marked the PR as **Needs work**, even if others approved | yes      | no       |
| `NOT_REVIEWED` | Reviewers are assigned, but none has approved or requested changes yet         | no       | no       |
| `NO_REVIEWERS` | No reviewers are assigned to the PR                                            | no       | no       |

Example response:

```text
PR #42: feat(CDC-123): add login flow
State: OPEN
Review status: APPROVED
Reviewed: yes
Approved: yes

Reviewed and approved — 1 of 2 reviewer(s) approved.

Reviewers:
- Jane Doe (jdoe): APPROVED
- John Smith (jsmith): UNAPPROVED
```

Merge checks configured in Bitbucket (for example, a minimum number of approvals) are not evaluated, so `APPROVED` does not guarantee the PR can be merged. When `prId` is omitted, the tool looks up the open, non-draft PR for the current branch.

## Available Prompts

| Name                  | Description                                                                                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `review-pr-comments`  | Fetches and displays all unresolved PR review comments as formatted, navigable links                                                                                                      |
| `create-pull-request` | Analyzes the current branch, drafts a PR title and short description following branch naming conventions, confirms with the user, then creates the pull request on Bitbucket Data Center. |
| `rebase-onto-main`    | Detects the default branch (main or master), fetches the latest changes, rebases the current branch onto it, resolves any conflicts, and force-pushes.                                    |

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

| Command          | Description             |
| ---------------- | ----------------------- |
| `pnpm dev`       | Run the MCP server      |
| `pnpm test`      | Run tests               |
| `pnpm typecheck` | Type-check the project  |
| `pnpm inspect`   | Launch MCP Inspector UI |

### Debugging with MCP Inspector

The project includes [`@modelcontextprotocol/inspector`](https://github.com/modelcontextprotocol/inspector) (v2) as a dev dependency. Use it to interactively test tools, resources, and prompts exposed by the server.

**Start the inspector with the server preconfigured:**

```bash
pnpm exec mcp-inspector -e BITBUCKET_URL=https://bitbucket.example.com -e BITBUCKET_TOKEN=your-personal-access-token tsx src/index.ts
```

The terminal prints a URL like `http://127.0.0.1:6274?MCP_INSPECTOR_API_TOKEN=…`. Open that exact URL (it includes the session auth token), then toggle the `tsx` server card to **Connected**. The inspector spawns the server process and proxies the MCP protocol.

**Environment variables:** The spawned server does not inherit your shell environment. Pass `BITBUCKET_URL` and `BITBUCKET_TOKEN` with `-e KEY=VALUE` as shown above.

`pnpm inspect` starts the inspector with an empty server list. You can add the server there via **Add Servers → Add manually**.

**Scripted checks with the inspector CLI:**

```bash
pnpm exec mcp-inspector --cli tsx src/index.ts -e BITBUCKET_URL=https://bitbucket.example.com -e BITBUCKET_TOKEN=your-personal-access-token --method tools/list
```

Mode flags (`--web`, `--cli`, `--tui`) must come first. In `--cli` mode, put the server command before the options.
