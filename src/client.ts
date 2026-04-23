export class BitbucketClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  async get<T = unknown>(
    path: string,
    params?: Record<string, string>,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      let body = "";
      try { body = await res.text(); } catch { /* ignore */ }
      throw new Error(
        `Bitbucket API error: HTTP ${res.status} for ${url.toString()}${body ? ` — ${body}` : ""}`,
      );
    }
    return res.json() as Promise<T>;
  }

  async post<T = unknown>(path: string, body: unknown): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let errBody = "";
      try { errBody = await res.text(); } catch { /* ignore */ }
      throw new Error(
        `Bitbucket API error: HTTP ${res.status} for POST ${url.toString()}${errBody ? ` — ${errBody}` : ""}`,
      );
    }
    return res.json() as Promise<T>;
  }

  async paginate<T = unknown>(
    path: string,
    params?: Record<string, string>,
  ): Promise<T[]> {
    const results: T[] = [];
    let start = 0;
    const limit = 100;

    while (true) {
      const page = await this.get<{
        values: T[];
        isLastPage: boolean;
        nextPageStart?: number;
      }>(path, { ...params, limit: String(limit), start: String(start) });

      results.push(...page.values);

      if (page.isLastPage) break;
      start = page.nextPageStart ?? start + limit;
    }

    return results;
  }
}
