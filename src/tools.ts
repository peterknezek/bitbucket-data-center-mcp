import { execSync } from "child_process";
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { type BitbucketClient } from "./client.js";
import { findOpenPrForBranch, getPrComments, type CommentResult } from "./resources.js";

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
}
