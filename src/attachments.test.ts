import { mkdtemp, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { BitbucketClient } from "./client.js";
import { uploadAttachments, withAttachments } from "./attachments.js";

let dir: string;
let png: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "bb-attach-"));
  png = join(dir, "login screen.png");
  await writeFile(png, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  await writeFile(join(dir, "notes.txt"), "hi");
});

afterEach(() => vi.unstubAllGlobals());

/** Answers the repository lookup with id 12 and every other request with `body`. */
function stubFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn(async (url: string) =>
    url.includes("/rest/api/1.0/projects/")
      ? new Response(JSON.stringify({ id: 12 }), { status: 200 })
      : new Response(JSON.stringify(body), { status }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const client = new BitbucketClient("https://bb.example", "token");

describe("uploadAttachments", () => {
  it("posts the file as multipart with the XSRF header and returns an attachment: reference", async () => {
    const fetchMock = stubFetch({
      id: 7,
      name: "login screen.png",
      url: "/rest/api/1.0/projects/PROJ/repos/repo/attachments/7",
    });

    const result = await uploadAttachments(client, "PROJ", "repo", [png]);

    expect(result).toEqual([{ fileName: "login screen.png", ref: "attachment:12/7" }]);
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls[0][0]).toBe("https://bb.example/rest/api/1.0/projects/PROJ/repos/repo");
    const [url, init] = calls[1];
    expect(url).toBe("https://bb.example/projects/PROJ/repos/repo/attachments");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["X-Atlassian-Token"]).toBe("no-check");
    const file = (init.body as FormData).get("file") as File;
    expect(file.name).toBe("login screen.png");
    expect(file.type).toBe("image/png");
  });

  it("fails when Bitbucket returns no attachment ID", async () => {
    stubFetch({ name: "x" });
    await expect(uploadAttachments(client, "PROJ", "repo", [png])).rejects.toThrow(/no attachment ID/);
  });

  it("makes no requests when there is nothing to upload", async () => {
    const fetchMock = stubFetch({});
    expect(await uploadAttachments(client, "PROJ", "repo", [])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects bad paths before uploading anything", async () => {
    const fetchMock = stubFetch({});
    await expect(uploadAttachments(client, "PROJ", "repo", [png, join(dir, "notes.txt")])).rejects.toThrow(
      /Unsupported attachment type/,
    );
    await expect(uploadAttachments(client, "PROJ", "repo", [join(dir, "missing.png")])).rejects.toThrow(/not found/);
    await expect(uploadAttachments(client, "PROJ", "repo", ["relative.png"])).rejects.toThrow(/absolute/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces Bitbucket errors", async () => {
    stubFetch({ errors: [{ message: "nope" }] }, 403);
    await expect(uploadAttachments(client, "PROJ", "repo", [png])).rejects.toThrow(/HTTP 403/);
  });
});

describe("withAttachments", () => {
  const shot = { fileName: "a.png", ref: "attachment:1/2" };

  it("appends a Screenshots section", () => {
    expect(withAttachments("- did a thing\n", [shot])).toBe(
      "- did a thing\n\n### Screenshots\n\n![a.png](attachment:1/2)",
    );
  });

  it("handles an empty description and no attachments", () => {
    expect(withAttachments(undefined, [shot])).toBe("### Screenshots\n\n![a.png](attachment:1/2)");
    expect(withAttachments("text", [])).toBe("text");
  });
});
