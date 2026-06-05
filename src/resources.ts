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
  const prs = await client.paginate<PullRequest>(`/rest/api/1.0/projects/${project}/repos/${repo}/pull-requests`, {
    state: "OPEN",
  });

  const pr = prs.find((p) => !p.draft && p.fromRef.displayId === branch);

  if (!pr) {
    throw new Error(`No open pull request found for branch "${branch}" in ${project}/${repo}`);
  }

  return pr.id;
}

export interface ReplyResult {
  id: number;
  text: string;
  replies: ReplyResult[];
}

export interface CommentResult {
  id: number;
  file: string;
  line: number | null;
  lineType: string | null;
  severity: string;
  text: string;
  replies: ReplyResult[];
}

interface Comment {
  id: number;
  text: string;
  severity?: string;
  threadResolved?: boolean;
  anchor?: {
    path?: string;
    line?: number;
    lineType?: string;
  };
  comments?: Comment[];
}

interface Activity {
  action: string;
  comment?: Comment;
}

interface BranchRef {
  displayId: string;
}

export async function getDefaultBranch(client: BitbucketClient, project: string, repo: string): Promise<string> {
  const branch = await client.get<BranchRef>(`/rest/api/1.0/projects/${project}/repos/${repo}/branches/default`);
  return branch.displayId;
}

interface CreatePrPayload {
  title: string;
  description?: string;
  state: "OPEN";
  draft: boolean;
  fromRef: { id: string; repository: { slug: string; project: { key: string } } };
  toRef: { id: string; repository: { slug: string; project: { key: string } } };
  reviewers: Array<{ user: { name: string } }>;
}

export interface CreatedPr {
  id: number;
  links: { self: Array<{ href: string }> };
}

export async function createPr(
  client: BitbucketClient,
  project: string,
  repo: string,
  options: {
    title: string;
    description?: string;
    fromBranch: string;
    toBranch: string;
    reviewers?: string[];
    draft?: boolean;
  },
): Promise<CreatedPr> {
  const refRepo = { slug: repo, project: { key: project } };
  const payload: CreatePrPayload = {
    title: options.title,
    description: options.description,
    state: "OPEN",
    draft: options.draft ?? false,
    fromRef: { id: `refs/heads/${options.fromBranch}`, repository: refRepo },
    toRef: { id: `refs/heads/${options.toBranch}`, repository: refRepo },
    reviewers: (options.reviewers ?? []).map((name) => ({ user: { name } })),
  };
  return client.post<CreatedPr>(`/rest/api/1.0/projects/${project}/repos/${repo}/pull-requests`, payload);
}

export interface CommentReply {
  id: number;
  text: string;
}

export async function replyToPrComment(
  client: BitbucketClient,
  project: string,
  repo: string,
  prId: number,
  commentId: number,
  text: string,
): Promise<CommentReply> {
  return client.post<CommentReply>(`/rest/api/1.0/projects/${project}/repos/${repo}/pull-requests/${prId}/comments`, {
    text,
    parent: { id: commentId },
  });
}

function mapReplies(comments: Comment[] | undefined): ReplyResult[] {
  if (!comments?.length) return [];
  return comments.map((c) => ({ id: c.id, text: c.text, replies: mapReplies(c.comments) }));
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
      replies: mapReplies(c.comments),
    };
  });
}
