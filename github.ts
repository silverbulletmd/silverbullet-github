import { applyQuery, QueryProviderEvent } from "$sb/plugs/query/engine.ts";
import { GithubApi } from "./api.ts";

export async function queryEvents({
  query,
}: QueryProviderEvent): Promise<any[]> {
  const api = await GithubApi.fromConfig();
  const usernameFilter = query.filter.find((f) => f.prop === "username");
  if (!usernameFilter) {
    throw Error("No 'username' filter specified, this is mandatory");
  }

  let usernames: string[] = [];
  if (usernameFilter.op === "=") {
    usernames = [usernameFilter.value];
  } else if (usernameFilter.op === "in") {
    usernames = usernameFilter.value;
  } else {
    throw new Error(`Unsupported operator ${usernameFilter.op}`);
  }
  const allEvents: any[] = [];
  for (
    const eventList of await Promise.all(
      usernames.map((username) => api.listEvents(username)),
    )
  ) {
    allEvents.push(...eventList);
  }
  query.filter.splice(query.filter.indexOf(usernameFilter), 1);

  return applyQuery(
    query,
    allEvents.map((e) => flattenObject(e)),
  );
}

export async function queryPulls({
  query,
}: QueryProviderEvent): Promise<any[]> {
  let api = await GithubApi.fromConfig();
  let repo = query.filter.find((f) => f.prop === "repo");
  if (!repo) {
    throw Error("No 'repo' specified, this is mandatory");
  }
  query.filter.splice(query.filter.indexOf(repo), 1);
  let repos: string[] = [];
  if (repo.op === "=") {
    repos = [repo.value];
  } else if (repo.op === "in") {
    repos = repo.value;
  } else {
    throw new Error(`Unsupported operator ${repo.op}`);
  }
  let allPulls: any[] = [];
  for (
    let pullList of await Promise.all(
      repos.map((repo) => api.listPulls(repo, "all", "updated")),
    )
  ) {
    allPulls.push(...pullList);
  }
  allPulls = applyQuery(
    query,
    allPulls.map((p) => flattenObject(p)),
  );
  return allPulls;
}

export async function queryNotifications({
  query,
}: QueryProviderEvent): Promise<any[]> {
  let api = await GithubApi.fromConfig();
  let allNotifications = await api.listNotifications();
  allNotifications = applyQuery(
    query,
    allNotifications.map((n) => flattenObject(n)),
  );
  return allNotifications;
}

export async function querySearchIssues({
  query,
}: QueryProviderEvent): Promise<any[]> {
  let api = await GithubApi.fromConfig();

  let queryFilter = query.filter.find((f) => f.prop === "query");
  if (!queryFilter) {
    throw Error("No 'query' specified, this is mandatory");
  }
  query.filter = query.filter.filter((f) => f.prop !== "query");

  let q = "";
  if (queryFilter.op === "=") {
    q = queryFilter.value;
  } else {
    throw new Error(`Unsupported operator ${queryFilter.op}`);
  }

  const searchResult = await api.searchIssues(q);
  const result = applyQuery(
    query,
    searchResult.items.map((n) => flattenObject(n)),
  );
  return result;
}

function flattenObject(obj: any, prefix = ""): any {
  let result: any = {};
  for (let [key, value] of Object.entries(obj)) {
    if (prefix) {
      key = prefix + "_" + key;
    }
    if (value && typeof value === "object") {
      result = { ...result, ...flattenObject(value, key) };
    } else {
      result[key] = value;
    }
  }
  return result;
}
