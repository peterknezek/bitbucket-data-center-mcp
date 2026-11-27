import { readFile, stat } from "fs/promises";
import { basename, extname, isAbsolute } from "path";
import { type BitbucketClient } from "./client.js";

const IMAGE_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

export interface UploadedAttachment {
  fileName: string;
  /** Reference to use in Markdown, e.g. `attachment:12/3`. */
  ref: string;
}

/** Shape returned by the upload endpoint, e.g. `{"id":4391,"name":"a.png","url":"/rest/api/1.0/.../attachments/4391"}`. */
interface AttachmentUploadResponse {
  id?: number;
  name?: string;
  url?: string;
}

export async function readImage(filePath: string): Promise<{ fileName: string; blob: Blob }> {
  if (!isAbsolute(filePath)) {
    throw new Error(`Attachment path must be absolute: ${filePath}`);
  }
  const type = IMAGE_TYPES[extname(filePath).toLowerCase()];
  if (!type) {
    throw new Error(
      `Unsupported attachment type: ${filePath}. Supported: ${Object.keys(IMAGE_TYPES).join(", ")}.`,
    );
  }
  const info = await stat(filePath).catch(() => null);
  if (!info?.isFile()) {
    throw new Error(`Attachment file not found: ${filePath}`);
  }
  const data = await readFile(filePath);
  return { fileName: basename(filePath), blob: new Blob([data], { type }) };
}

/**
 * Uploads a file to the repository the way the Bitbucket web UI does when an image is pasted into a
 * PR description. Bitbucket Data Center has no documented REST endpoint for this, so it uses the
 * UI's own endpoint, which may change between Bitbucket versions.
 *
 * The web UI references uploads in Markdown as `attachment:<repositoryId>/<attachmentId>`.
 */
export async function uploadAttachment(
  client: BitbucketClient,
  project: string,
  repo: string,
  repositoryId: number,
  filePath: string,
): Promise<UploadedAttachment> {
  const { fileName, blob } = await readImage(filePath);
  const form = new FormData();
  form.append("file", blob, fileName);

  const res = await client.postForm<AttachmentUploadResponse>(`/projects/${project}/repos/${repo}/attachments`, form);
  if (res.id == null) {
    throw new Error(`Bitbucket accepted the upload of ${fileName} but returned no attachment ID: ${JSON.stringify(res)}`);
  }
  return { fileName, ref: `attachment:${repositoryId}/${res.id}` };
}

export async function uploadAttachments(
  client: BitbucketClient,
  project: string,
  repo: string,
  filePaths: string[],
): Promise<UploadedAttachment[]> {
  // Read everything first, so a bad path fails before anything is uploaded.
  await Promise.all(filePaths.map(readImage));
  if (filePaths.length === 0) return [];
  const { id: repositoryId } = await client.get<{ id: number }>(`/rest/api/1.0/projects/${project}/repos/${repo}`);
  const uploaded: UploadedAttachment[] = [];
  for (const filePath of filePaths) {
    uploaded.push(await uploadAttachment(client, project, repo, repositoryId, filePath));
  }
  return uploaded;
}

/** `{{attachment:<fileName>}}`, where `<fileName>` is the base name of a file in `attachments`. */
const PLACEHOLDER = /\{\{attachment:([^{}]+)\}\}/g;

const placeholder = (fileName: string) => `{{attachment:${fileName}}}`;

/** Unique placeholder file names in the order they first appear in the description. */
export function placeholderNames(description: string | undefined): string[] {
  return [...new Set([...(description ?? "").matchAll(PLACEHOLDER)].map((m) => m[1]))];
}

/**
 * Checks the attachments and the description's placeholders before anything is uploaded or saved:
 * every file must be a readable, supported image, base names must be unique, and every
 * `{{attachment:<fileName>}}` placeholder must name one of the files (exact, case-sensitive match).
 */
export async function validateAttachments(description: string | undefined, filePaths: string[]): Promise<void> {
  await Promise.all(filePaths.map(readImage));

  const byName = new Map<string, string[]>();
  for (const filePath of filePaths) {
    const name = basename(filePath);
    byName.set(name, [...(byName.get(name) ?? []), filePath]);
  }
  const duplicates = [...byName].filter(([, paths]) => paths.length > 1);
  if (duplicates.length) {
    throw new Error(
      "Attachment file names must be unique, so each {{attachment:<fileName>}} placeholder names one file. " +
        `Duplicates: ${duplicates.map(([name, paths]) => `${name} (${paths.join(", ")})`).join("; ")}.`,
    );
  }

  const unmatched = placeholderNames(description).filter((name) => !byName.has(name));
  if (unmatched.length) {
    const available = byName.size ? [...byName.keys()].join(", ") : "none";
    throw new Error(
      `No file in attachments matches these description placeholders: ${unmatched.map(placeholder).join(", ")}. ` +
        `Attachment file names: ${available}.`,
    );
  }
}

/**
 * Replaces every `{{attachment:<fileName>}}` placeholder with that file's `attachment:<repoId>/<id>`
 * reference, and appends files that no placeholder refers to under a "Screenshots" heading.
 * Returns `undefined` only when there was no description and nothing was uploaded.
 */
export function applyAttachments(
  description: string | undefined,
  attachments: UploadedAttachment[],
): string | undefined {
  if (attachments.length === 0) return description;
  let text = description ?? "";
  const unreferenced: UploadedAttachment[] = [];
  for (const attachment of attachments) {
    const token = placeholder(attachment.fileName);
    if (text.includes(token)) {
      text = text.split(token).join(attachment.ref);
    } else {
      unreferenced.push(attachment);
    }
  }
  return withAttachments(text, unreferenced);
}

/** Appends the uploaded images to the description as Markdown images under a "Screenshots" heading. */
export function withAttachments(description: string | undefined, attachments: UploadedAttachment[]): string {
  const text = description ?? "";
  if (attachments.length === 0) return text;
  const images = attachments.map((a) => `![${a.fileName.replace(/[[\]]/g, "")}](${a.ref})`).join("\n\n");
  const section = `### Screenshots\n\n${images}`;
  return text.trim() ? `${text.trimEnd()}\n\n${section}` : section;
}

/** One line per uploaded file, e.g. `- login.png -> attachment:12/7`, for the tool result. */
export function formatUploaded(attachments: UploadedAttachment[]): string[] {
  if (attachments.length === 0) return [];
  return [
    "",
    "Uploaded attachments (reuse these references in later edits instead of uploading again):",
    ...attachments.map((a) => `- ${a.fileName} -> ${a.ref}`),
  ];
}
