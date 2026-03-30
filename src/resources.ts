import { type BitbucketClient } from "./client.js";

interface PullRequest {
  id: number;
  fromRef: { displayId: string };
  draft?: boolean;
}

export async function findOpenPrForBranch(
  client: BitbucketClient,
  project: string,
  repo: string,
  branch: string,
): Promise<number> {
  const prs = await client.paginate<PullRequest>(
    `/rest/api/1.0/projects/${project}/repos/${repo}/pull-requests`,
    { state: "OPEN" },
  );

  const pr = prs.find((p) => !p.draft && p.fromRef.displayId === branch);

  if (!pr) {
    throw new Error(
      `No open pull request found for branch "${branch}" in ${project}/${repo}`,
    );
  }

  return pr.id;
}

export interface CommentResult {
  id: number;
  file: string;
  line: number | null;
  lineType: string | null;
  severity: string;
  text: string;
}

interface Activity {
  action: string;
  comment?: {
    id: number;
    text: string;
    severity?: string;
    threadResolved?: boolean;
    anchor?: {
      path?: string;
      line?: number;
      lineType?: string;
    };
  };
}

export async function getPrComments(
  client: BitbucketClient,
  project: string,
  repo: string,
  prId: number,
): Promise<CommentResult[]> {
  const activities = await client.paginate<Activity>(
    `/rest/api/1.0/projects/${project}/repos/${repo}/pull-requests/${prId}/activities`,
  );

  const commented = activities.filter((a) => a.action === "COMMENTED" && a.comment != null);
  const withAnchor = commented.filter((a) => a.comment!.anchor?.path != null);
  const unresolved = withAnchor.filter((a) => !a.comment!.threadResolved);

  if (process.env.DEBUG) {
    console.error(
      `[getPrComments] total activities=${activities.length} commented=${commented.length} withAnchor=${withAnchor.length} unresolved=${unresolved.length}`,
    );
  }

  return unresolved.map((a) => {
    const c = a.comment!;
    return {
      id: c.id,
      file: c.anchor!.path!,
      line: c.anchor!.line ?? null,
      lineType: c.anchor!.lineType ?? null,
      severity: c.severity ?? "NORMAL",
      text: c.text,
    };
  });
}
