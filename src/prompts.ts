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

  server.registerPrompt(
    "create-pull-request",
    {
      title: "Create Pull Request",
      description:
        "Analyzes the current branch, drafts a PR title and short description following git conventions, confirms with the user, then creates the pull request on Bitbucket Data Center.",
    },
    async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `You are helping a developer create a pull request. Your ONLY job is to summarize the changes, draft a title, and call the create_pull_request tool. Do NOT modify any files, do NOT implement any changes, do NOT suggest code fixes — not even if you notice issues in the diff.

Follow these steps exactly:

1. Run \`git rev-parse --show-toplevel\` to get the repo path.
2. Run \`git branch --show-current\` to get the current branch name.
3. Extract the type and task ID from the branch using the pattern \`(fix|feat|refactor|chore)/([A-Z]+-\\d+)_\`.
   - Example: \`feat/CDC-123_add-login-flow\` → type=feat, taskId=CDC-123
   - If the branch does not match, ask the user: "What is the Jira task ID for this work? (e.g. CDC-123)" and wait for their answer before continuing.
4. Run \`git log origin/HEAD..HEAD --oneline\` to see the commits on this branch.
5. Run \`git diff origin/HEAD..HEAD --stat\` to understand what files changed.
6. Draft:
   - **Title**: \`<type>(<taskId>): <brief description>\` — imperative mood, lowercase, no period
   - **Description**: 3–5 bullet points max, each one brief (what changed, not how)
7. Show the draft to the user and ask: "Does this look good? Any changes or reviewers to add?"
8. Once confirmed, call \`create_pull_request\` with \`repoPath\`, \`title\`, \`description\`, and \`reviewers\` (if any were specified).
9. Stop. Do NOT do anything else after the pull request is created.`,
          },
        },
      ],
    }),
  );
}
