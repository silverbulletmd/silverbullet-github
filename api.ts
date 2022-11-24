import { readSecrets } from "$sb/lib/secrets_page.ts";

export async function getToken(): Promise<string | undefined> {
  try {
    const [token] = await readSecrets(["githubToken"]);
    return token;
  } catch {
    console.error("No github-config page found, using default config");
    return undefined;
  }
}
export class GithubApi {
  constructor(private token?: string) {}

  async apiCall(url: string, options: any = {}): Promise<any> {
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: this.token ? `token ${this.token}` : undefined,
      },
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(await res.text());
    }
    return res.json();
  }

  listEvents(username: string): Promise<any[]> {
    return this.apiCall(
      `https://api.github.com/users/${username}/events?per_page=100`,
    );
  }

  listPulls(
    repo: string,
    state = "all",
    sort = "updated",
  ): Promise<any[]> {
    return this.apiCall(
      `https://api.github.com/repos/${repo}/pulls?state=${state}&sort=${sort}&direction=desc&per_page=100`,
    );
  }

  searchIssues(
    query: string,
    sort = "",
  ): Promise<{ items: any[] }> {
    query = encodeURIComponent(query);

    return this.apiCall(
      `https://api.github.com/search/issues?q=${query}&sort=${sort}&direction=desc&per_page=100`,
    );
  }

  listNotifications(): Promise<any[]> {
    return this.apiCall(`https://api.github.com/notifications?per_page=100`);
  }

  async createGist(
    description: string,
    isPublic: boolean,
    files: Record<string, { content: string }>,
  ): Promise<string> {
    const result = await this.apiCall(`https://api.github.com/gists`, {
      method: "POST",
      body: JSON.stringify({
        description,
        public: isPublic,
        files,
      }),
    });
    return result.id;
  }

  updateGist(
    id: string,
    description: string,
    isPublic: boolean,
    files: Record<string, { content: string }>,
  ) {
    return this.apiCall(`https://api.github.com/gists/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        description,
        public: isPublic,
        files,
      }),
    });
  }

  async getGist(id: string): Promise<Record<string, any>> {
    const resp = await this.apiCall(`https://api.github.com/gists/${id}`);
    return resp.files;
  }

  static async fromConfig(): Promise<GithubApi> {
    return new GithubApi(await getToken());
  }
}
