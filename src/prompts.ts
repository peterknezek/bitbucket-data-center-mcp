import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerPrompts(server: McpServer) {
  server.registerPrompt(
    "review-pr-comments",
    {
      title: "Review PR Comments",
      description: "Fetches and displays all unresolved PR review comments as formatted, navigable links.",
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
    "rebase-onto-main",
    {
      title: "Rebase onto Main",
      description:
        "Detects the default branch (main or master), fetches the latest changes, rebases the current branch onto it, resolves any conflicts, and force-pushes.",
    },
    async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: "Detect whether the default branch in this repo is called `main` or `master`, then rebase the current branch onto it, resolve any conflicts, and force-push.",
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
   - **Description**: 3–5 bullet points max, each one brief (what changed, not how). If the user gives screenshots, the bullets may be followed by a screenshots section that places each image with a \`{{attachment:<fileName>}}\` placeholder, where \`<fileName>\` is the image's base name, for example a Before/After table with \`![Login, before]({{attachment:login-before.png}})\` in its cells. Screenshots without a placeholder are added under a "### Screenshots" heading at the end.
7. Show the draft to the user and ask: "Does this look good? Any changes, reviewers or screenshots to add?"
8. Once confirmed, call \`create_pull_request\` with \`repoPath\`, \`title\`, \`description\`, \`reviewers\` (if any were specified), and \`attachments\` (absolute paths of any screenshots the user gave).
9. Stop. Do NOT do anything else after the pull request is created.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "update-pr-description",
    {
      title: "Update PR Description",
      description:
        "After new commits were pushed to the PR's branch, rewrites the PR description to match the branch's current changes, confirms with the user, then saves it on Bitbucket Data Center.",
    },
    async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `You are helping a developer update the description of their pull request after they pushed new commits to it. Your ONLY job is to draft the new description and call the update_pull_request tool. Do NOT modify any files, do NOT implement any changes, do NOT suggest code fixes.

Follow these steps exactly:

1. Run \`git rev-parse --show-toplevel\` to get the repo path.
2. Run \`git status -sb\` to check the branch is pushed. If it is ahead of its upstream, show the user \`git push\` and ask for confirmation before running it. Do NOT push without confirmation.
3. Run \`git log origin/HEAD..HEAD --oneline\` and \`git diff origin/HEAD..HEAD --stat\` to see everything the branch changes, including the new commits.
4. Draft the description: 3–5 brief bullet points covering the whole branch as it is now (what changed, not how), optionally followed by a screenshots section. Keep any existing \`![...](attachment:<repoId>/<attachmentId>)\` images unchanged so they stay visible.
5. Show the draft to the user and ask: "Update the PR description to this?"
6. Once confirmed, call \`update_pull_request\` with \`repoPath\` and \`description\`.
7. Stop. Do NOT do anything else after the description is updated.`,
          },
        },
      ],
    }),
  );
}
