import { type BitbucketClient } from "./client.js";

interface RepositoryRef {
  slug: string;
  project: { key: string };
}

export interface EditablePullRequest {
  id: number;
  version: number;
  title: string;
  description?: string;
  state: "OPEN" | "MERGED" | "DECLINED";
  draft?: boolean;
  toRef: { id: string; repository: RepositoryRef };
  reviewers?: Array<{ user: { name: string } }>;
  links?: { self?: Array<{ href: string }> };
}

export async function getEditablePr(
  client: BitbucketClient,
  project: string,
  repo: string,
  prId: number,
): Promise<EditablePullRequest> {
  return client.get<EditablePullRequest>(`/rest/api/1.0/projects/${project}/repos/${repo}/pull-requests/${prId}`);
}

/**
 * Bitbucket's PUT replaces every editable field, so anything left out (reviewers in particular)
 * can be cleared. Send back the current reviewers, target branch and draft status unchanged.
 */
export async function updatePrText(
  client: BitbucketClient,
  project: string,
  repo: string,
  pr: EditablePullRequest,
  text: { title: string; description: string },
): Promise<EditablePullRequest> {
  const payload: Record<string, unknown> = {
    version: pr.version,
    title: text.title,
    description: text.description,
    reviewers: (pr.reviewers ?? []).map((r) => ({ user: { name: r.user.name } })),
    toRef: {
      id: pr.toRef.id,
      repository: { slug: pr.toRef.repository.slug, project: { key: pr.toRef.repository.project.key } },
    },
  };
  if (pr.draft != null) payload.draft = pr.draft;

  return client.put<EditablePullRequest>(
    `/rest/api/1.0/projects/${project}/repos/${repo}/pull-requests/${pr.id}`,
    payload,
  );
}
