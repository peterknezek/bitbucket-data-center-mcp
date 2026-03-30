import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerPrompts(server: McpServer) {
  server.registerPrompt(
    "review-pr-comments",
    {
      title: "Review PR Comments",
      description:
        "Fetches and displays all unresolved PR review comments as formatted, navigable links.",
    },
    async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `You are helping a developer review pull request comments. Display the comments only — do not implement any fixes.

Follow these steps exactly:

1. Run \`git rev-parse --show-toplevel\` to get the absolute path of the repository root.
2. Call the \`get_pr_comments\` tool with \`repoPath\` set to that path.
3. Present the formatted comments to the developer exactly as returned by the tool.
4. Stop here. Do NOT implement any changes, do NOT edit any files, do NOT suggest fixes unless the developer explicitly asks.`,
          },
        },
      ],
    }),
  );
}
