import { mkdir, mkdtemp, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { BitbucketClient } from "./client.js";
import {
  applyAttachments,
  formatUploaded,
  placeholderNames,
  uploadAttachments,
  validateAttachments,
  withAttachments,
} from "./attachments.js";

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

describe("applyAttachments", () => {
  const before = { fileName: "calculator-mobile-before.png", ref: "attachment:3598/10" };
  const after = { fileName: "calculator-mobile-after.png", ref: "attachment:3598/11" };
  const extra = { fileName: "extra.png", ref: "attachment:3598/12" };

  it("replaces placeholders with bare references and adds no Screenshots section when all are placed", () => {
    const description = [
      "- changed the calculator",
      "",
      "| Before | After |",
      "| ------ | ----- |",
      "| ![Calculator, mobile, before]({{attachment:calculator-mobile-before.png}}) | ![Calculator, mobile, after]({{attachment:calculator-mobile-after.png}}) |",
    ].join("\n");

    expect(applyAttachments(description, [before, after])).toBe(
      [
        "- changed the calculator",
        "",
        "| Before | After |",
        "| ------ | ----- |",
        "| ![Calculator, mobile, before](attachment:3598/10) | ![Calculator, mobile, after](attachment:3598/11) |",
      ].join("\n"),
    );
  });

  it("replaces a repeated placeholder at every occurrence", () => {
    const description = "![a]({{attachment:calculator-mobile-before.png}}) and ![b]({{attachment:calculator-mobile-before.png}})";
    expect(applyAttachments(description, [before])).toBe("![a](attachment:3598/10) and ![b](attachment:3598/10)");
  });

  it("places referenced attachments and appends unreferenced ones under Screenshots", () => {
    expect(applyAttachments("- x\n\n![Before]({{attachment:calculator-mobile-before.png}})", [before, extra])).toBe(
      "- x\n\n![Before](attachment:3598/10)\n\n### Screenshots\n\n![extra.png](attachment:3598/12)",
    );
  });

  it("leaves existing attachment references untouched", () => {
    const description = "![old](attachment:3598/1)\n\n![new]({{attachment:extra.png}})";
    expect(applyAttachments(description, [extra])).toBe("![old](attachment:3598/1)\n\n![new](attachment:3598/12)");
    expect(applyAttachments(description.split("\n\n")[0], [])).toBe("![old](attachment:3598/1)");
  });

  it("matches today's output when there are no placeholders", () => {
    for (const description of ["- did a thing\n", "", undefined]) {
      expect(applyAttachments(description, [before, extra])).toBe(withAttachments(description, [before, extra]));
    }
    expect(applyAttachments(undefined, [])).toBeUndefined();
    expect(applyAttachments("text", [])).toBe("text");
  });

  it("matches placeholders case-sensitively", () => {
    expect(applyAttachments("![x]({{attachment:Extra.png}})", [extra])).toBe(
      "![x]({{attachment:Extra.png}})\n\n### Screenshots\n\n![extra.png](attachment:3598/12)",
    );
  });
});

describe("validateAttachments", () => {
  it("accepts placeholders that match attachment base names", async () => {
    await expect(validateAttachments("![x]({{attachment:login screen.png}})", [png])).resolves.toBeUndefined();
    await expect(validateAttachments(undefined, [])).resolves.toBeUndefined();
  });

  it("lists placeholders without a matching file", async () => {
    await expect(
      validateAttachments("{{attachment:missing.png}} {{attachment:Login screen.png}} {{attachment:missing.png}}", [png]),
    ).rejects.toThrow(
      "No file in attachments matches these description placeholders: {{attachment:missing.png}}, {{attachment:Login screen.png}}. " +
        "Attachment file names: login screen.png.",
    );
    await expect(validateAttachments("{{attachment:a.png}}", [])).rejects.toThrow(/Attachment file names: none/);
  });

  it("lists attachments that share a base name", async () => {
    const other = join(dir, "sub", "login screen.png");
    await mkdir(join(dir, "sub"), { recursive: true });
    await writeFile(other, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await expect(validateAttachments(undefined, [png, other])).rejects.toThrow(
      `Duplicates: login screen.png (${png}, ${other}).`,
    );
  });

  it("keeps the existing file checks", async () => {
    await expect(validateAttachments(undefined, ["relative.png"])).rejects.toThrow(/absolute/);
    await expect(validateAttachments(undefined, [join(dir, "notes.txt")])).rejects.toThrow(/Unsupported/);
  });
});

describe("placeholderNames and formatUploaded", () => {
  it("returns unique placeholder names in order", () => {
    expect(placeholderNames("{{attachment:b.png}} {{attachment:a.png}} {{attachment:b.png}} attachment:1/2")).toEqual([
      "b.png",
      "a.png",
    ]);
  });

  it("lists each uploaded file with its reference", () => {
    expect(formatUploaded([{ fileName: "a.png", ref: "attachment:1/2" }])).toEqual([
      "",
      "Uploaded attachments (reuse these references in later edits instead of uploading again):",
      "- a.png -> attachment:1/2",
    ]);
    expect(formatUploaded([])).toEqual([]);
  });
});
