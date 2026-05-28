import { execSync } from "child_process";
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { type BitbucketClient } from "./client.js";
import { findOpenPrForBranch, getPrComments, getDefaultBranch, createPr, type CommentResult } from "./resources.js";

function formatComments(comments: CommentResult[], repoPath: string | undefined): string {
  if (comments.length === 0) {
    return "No unresolved inline PR comments found.";
  }

  return comments
    .map((c, i) => {
      const location = c.line != null ? `${c.file}:${c.line}` : c.file;
      const link =
        repoPath != null && c.line != null
          ? `[@${location}](cursor://file/${repoPath}/${c.file}:${c.line})`
          : `\`@${location}\``;
      const severity = c.severity !== "NORMAL" ? ` · **${c.severity}**` : "";
      const commentText = c.text.split("\n").join("\n> ");
      return `${link}${severity}\n> ${commentText}`;
    })
    .join("\n\n");
}

function git(cmd: string, cwd: string): string {
  return execSync(cmd, { cwd, encoding: "utf8" }).trim();
}

function parseRemoteUrl(remoteUrl: string): { project: string; repo: string } | null {
  // SCP-style: git@host:project/repo.git (no :// scheme)
  if (!remoteUrl.includes("://")) {
    const scpMatch = remoteUrl.match(/^[^@]+@[^:]+:([^/]+)\/(.+?)(?:\.git)?$/);
    if (scpMatch) {
      return { project: scpMatch[1].toUpperCase(), repo: scpMatch[2] };
    }
  }
  // URL-style: ssh://git@host:port/project/repo.git or https://host/scm/project/repo.git
  try {
    const parsed = new URL(remoteUrl);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const offset = parts[0].toLowerCase() === "scm" ? 1 : 0;
    return {
      project: parts[offset].toUpperCase(),
      repo: parts[offset + 1].replace(/\.git$/, ""),
    };
  } catch {
    return null;
  }
}

function parseBranchConvention(branch: string): { type: string; taskId: string; description: string } | null {
  const match = branch.match(/^(fix|feat|refactor|chore)\/([A-Z]+-\d+)_(.+)$/);
  if (!match) return null;
  return { type: match[1], taskId: match[2], description: match[3].replace(/-/g, " ") };
}

export function registerTools(server: McpServer, client: BitbucketClient) {
  server.registerTool(
    "get_pr_comments",
    {
      title: "Get PR Comments",
      description:
        "Fetches all unresolved inline review comments for the open pull request on the current branch. " +
        "Pass repoPath (from `git rev-parse --show-toplevel`) to auto-detect everything and enable clickable file links. " +
        "Alternatively pass project, repo, and branch explicitly.",
      inputSchema: z.object({
        repoPath: z
          .string()
          .optional()
          .describe(
            "Absolute path to the local repository root (from `git rev-parse --show-toplevel`). " +
              "Auto-detects project, repo, and branch via git. Also enables clickable Cursor file links.",
          ),
        project: z
          .string()
          .optional()
          .describe("Bitbucket project key. Inferred from git remote when repoPath is provided."),
        repo: z
          .string()
          .optional()
          .describe("Bitbucket repository slug. Inferred from git remote when repoPath is provided."),
        branch: z.string().optional().describe("Source branch. Inferred from git when repoPath is provided."),
      }),
    },
    async ({ repoPath, project, repo, branch }) => {
      let resolvedProject = project;
      let resolvedRepo = repo;
      let resolvedBranch = branch;

      if (repoPath && (!resolvedProject || !resolvedRepo || !resolvedBranch)) {
        const remoteUrl = git("git remote get-url origin", repoPath);
        const parsed = parseRemoteUrl(remoteUrl);
        if (!parsed) {
          throw new Error(`Could not parse git remote URL: ${remoteUrl}`);
        }
        resolvedProject = resolvedProject ?? parsed.project;
        resolvedRepo = resolvedRepo ?? parsed.repo;
        resolvedBranch = resolvedBranch ?? git("git branch --show-current", repoPath);
      }

      if (!resolvedProject || !resolvedRepo || !resolvedBranch) {
        throw new Error(
          "Provide repoPath (from `git rev-parse --show-toplevel`) or pass project, repo, and branch explicitly.",
        );
      }

      const prId = await findOpenPrForBranch(client, resolvedProject, resolvedRepo, resolvedBranch);
      const comments = await getPrComments(client, resolvedProject, resolvedRepo, prId);

      return {
        content: [{ type: "text", text: formatComments(comments, repoPath) }],
      };
    },
  );

  server.registerTool(
    "create_pull_request",
    {
      title: "Create Pull Request",
      description:
        "Creates a pull request on Bitbucket Data Center. " +
        "IMPORTANT: Your ONLY job is to summarize the changes, draft a title, and call this tool. " +
        "Do NOT modify any files, do NOT implement changes, do NOT suggest code fixes — not even if you notice issues in the diff. " +
        "\n\nBefore calling this tool, follow these steps:\n" +
        "1. Run `git rev-parse --show-toplevel` to get repoPath.\n" +
        "2. Run `git branch --show-current` to get the branch name.\n" +
        "3. Extract type and taskId from the branch using pattern `(fix|feat|refactor|chore)/([A-Z]+-\\d+)_`. " +
        "Example: `feat/CDC-123_add-login` → type=feat, taskId=CDC-123. " +
        "If the branch does not match, ask the user for the Jira task ID before proceeding.\n" +
        "4. Run `git log origin/HEAD..HEAD --oneline` and `git diff origin/HEAD..HEAD --stat` to understand what changed.\n" +
        "5. Draft title as `<type>(<taskId>): <brief description>` (imperative, lowercase, no period) " +
        "and a description of 3–5 brief bullet points (what changed, not how).\n" +
        "6. Show the draft to the user and ask for confirmation and whether to add reviewers.\n" +
        "7. Call this tool with repoPath, title, description, and reviewers.\n" +
        "8. If the tool reports that the branch has not been pushed, show the suggested git push command to the user and ask for confirmation before running it. Do NOT push without confirmation.\n" +
        "9. Stop after the PR is created. Do NOT do anything else.",
      inputSchema: z.object({
        repoPath: z
          .string()
          .optional()
          .describe(
            "Absolute path to the local repository root (from `git rev-parse --show-toplevel`). " +
            "Auto-detects project, repo, and branch via git.",
          ),
        project: z
          .string()
          .optional()
          .describe("Bitbucket project key. Inferred from git remote when repoPath is provided."),
        repo: z
          .string()
          .optional()
          .describe("Bitbucket repository slug. Inferred from git remote when repoPath is provided."),
        branch: z
          .string()
          .optional()
          .describe("Source branch (fromRef). Inferred from git when repoPath is provided."),
        title: z
          .string()
          .optional()
          .describe(
            "PR title. If omitted, auto-generated from branch name as <type>(<taskId>): <description>.",
          ),
        taskId: z
          .string()
          .optional()
          .describe(
            "Jira task ID (e.g. CDC-123). Required when branch name does not follow the convention and title is not provided.",
          ),
        description: z
          .string()
          .optional()
          .describe("Short bullet-point description of what changed."),
        targetBranch: z
          .string()
          .optional()
          .describe("Target branch (toRef). Defaults to the repository's default branch."),
        reviewers: z
          .array(z.string())
          .optional()
          .describe("List of Bitbucket usernames to add as reviewers."),
        draft: z
          .boolean()
          .optional()
          .describe("Create as a draft pull request. Defaults to false."),
      }),
    },
    async ({ repoPath, project, repo, branch, title, taskId, description, targetBranch, reviewers, draft }) => {
      let resolvedProject = project;
      let resolvedRepo = repo;
      let resolvedBranch = branch;

      if (repoPath && (!resolvedProject || !resolvedRepo || !resolvedBranch)) {
        const remoteUrl = git("git remote get-url origin", repoPath);
        const parsed = parseRemoteUrl(remoteUrl);
        if (!parsed) {
          throw new Error(`Could not parse git remote URL: ${remoteUrl}`);
        }
        resolvedProject = resolvedProject ?? parsed.project;
        resolvedRepo = resolvedRepo ?? parsed.repo;
        resolvedBranch = resolvedBranch ?? git("git branch --show-current", repoPath);
      }

      if (!resolvedProject || !resolvedRepo || !resolvedBranch) {
        throw new Error(
          "Provide repoPath (from `git rev-parse --show-toplevel`) or pass project, repo, and branch explicitly.",
        );
      }

      if (repoPath) {
        const remoteRef = git(`git ls-remote --heads origin refs/heads/${resolvedBranch}`, repoPath);
        if (!remoteRef) {
          return {
            content: [{
              type: "text",
              text: [
                `Branch "${resolvedBranch}" has not been pushed to origin yet.`,
                `Bitbucket cannot create a PR from a branch that doesn't exist on the remote.`,
                ``,
                `Push it first with:`,
                ``,
                `  git push -u origin ${resolvedBranch}`,
                ``,
                `Then retry creating the pull request.`,
              ].join("\n"),
            }],
          };
        }
      }

      const resolvedTarget = targetBranch ?? await getDefaultBranch(client, resolvedProject, resolvedRepo);

      if (resolvedBranch === resolvedTarget) {
        throw new Error(
          `Source branch "${resolvedBranch}" and target branch "${resolvedTarget}" are the same.`,
        );
      }

      let resolvedTitle = title;
      if (!resolvedTitle) {
        const convention = parseBranchConvention(resolvedBranch);
        if (convention) {
          resolvedTitle = `${convention.type}(${convention.taskId}): ${convention.description}`;
        } else if (taskId) {
          resolvedTitle = `${resolvedBranch.replace(/_/g, " ")}: ${taskId}`;
        } else {
          throw new Error(
            `Branch "${resolvedBranch}" does not follow convention (<type>/<taskId>_<desc>). ` +
            "Provide taskId or title explicitly.",
          );
        }
      }

      const pr = await createPr(client, resolvedProject, resolvedRepo, {
        title: resolvedTitle,
        description,
        fromBranch: resolvedBranch,
        toBranch: resolvedTarget,
        reviewers,
        draft,
      });

      const prUrl = pr.links.self[0]?.href ?? "(URL unavailable)";
      const lines = [
        "Pull request created successfully.",
        `ID: ${pr.id}`,
        `Repository: ${resolvedRepo}`,
        `Title: ${resolvedTitle}`,
        `From: ${resolvedBranch} → ${resolvedTarget}`,
      ];
      if (draft) lines.push("Status: Draft");
      lines.push(``, prUrl);

      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );
}
