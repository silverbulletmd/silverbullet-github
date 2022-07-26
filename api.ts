import { readSecrets } from "@silverbulletmd/plugs/lib/secrets_page";

export async function getToken(): Promise<string | undefined> {
  try {
    let [token] = await readSecrets(["githubToken"]);
    return token;
  } catch (e) {
    console.error("No github-config page found, using default config");
    return undefined;
  }
}
export class GithubApi {
  constructor(private token?: string) {}

  async apiCall(url: string, options: any = {}): Promise<any> {
    let res = await fetch(url, {
      ...options,
      headers: {
        Authorization: this.token ? `token ${this.token}` : undefined,
      },
    });
    if (res.status !== 200) {
      throw new Error(await res.text());
    }
    return res.json();
  }

  async listEvents(username: string): Promise<any[]> {
    return this.apiCall(
      `https://api.github.com/users/${username}/events?per_page=100`
    );
  }

  async listPulls(
    repo: string,
    state: string = "all",
    sort: string = "updated"
  ): Promise<any[]> {
    return this.apiCall(
      `https://api.github.com/repos/${repo}/pulls?state=${state}&sort=${sort}&direction=desc&per_page=100`
    );
  }

  async listNotifications(): Promise<any[]> {
    return this.apiCall(`https://api.github.com/notifications?per_page=100`);
  }

  static async fromConfig(): Promise<GithubApi> {
    return new GithubApi(await getToken());
  }
}
