import type { PublishEvent, QueryProviderEvent } from "$sb/app_event.ts";
import {
  applyQuery,
  evalQueryExpression,
  liftAttributeFilter,
} from "$sb/lib/query.ts";
import { renderToText } from "$sb/lib/tree.ts";
import {
  editor,
  markdown,
  space,
  system,
} from "$sb/silverbullet-syscall/mod.ts";
import { GithubApi } from "./api.ts";
import {
  extractFrontmatter,
  prepareFrontmatterDispatch,
} from "$sb/lib/frontmatter.ts";

export async function queryEvents({
  query,
}: QueryProviderEvent): Promise<any[]> {
  const api = await GithubApi.fromConfig();
  const usernameFilter = liftAttributeFilter(query.filter, "username");
  if (!usernameFilter) {
    throw Error("No 'username' filter specified, this is mandatory");
  }

  const username: string = evalQueryExpression(usernameFilter, {});
  const allEvents: any[] = await api.listEvents(username);

  return applyQuery(
    query,
    allEvents.map((e) => flattenObject(e)),
  );
}

export async function queryPulls({
  query,
}: QueryProviderEvent): Promise<any[]> {
  const api = await GithubApi.fromConfig();
  const repoFilter = liftAttributeFilter(query.filter, "repo");
  if (!repoFilter) {
    throw Error("No 'repo' specified, this is mandatory");
  }
  const repo: string = evalQueryExpression(repoFilter, {});
  let allPulls: any[] = await api.listPulls(repo, "all", "updated");
  allPulls = applyQuery(
    query,
    allPulls.map((p) => flattenObject(p)),
  );
  return allPulls;
}

export async function queryNotifications({
  query,
}: QueryProviderEvent): Promise<any[]> {
  const api = await GithubApi.fromConfig();
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
  const api = await GithubApi.fromConfig();

  const queryFilter = liftAttributeFilter(query.filter, "query");
  if (!queryFilter) {
    throw Error("No 'query' specified, this is mandatory");
  }

  const q = evalQueryExpression(queryFilter, {});

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

export async function shareGistCommand() {
  const pageName = await editor.getCurrentPage();
  const text = await editor.getText();
  const tree = await markdown.parseMarkdown(text);
  let { $share } = await extractFrontmatter(tree, ["$share"]);
  const cleanText = renderToText(tree);

  if (!$share) {
    $share = [];
  }

  // Check if already published
  for (const uri of $share) {
    if (uri.startsWith("gh-gist:")) {
      // Already published, let's just update it
      await system.invokeFunction("server", "updateGist", {
        name: pageName,
        uri: uri,
      });
      await editor.flashNotification("Updated!");
      await editor.openUrl(`https://gist.github.com/${uri.split(":")[1]}`);
      return; // Done
    }
  }

  const gistId = await system.invokeFunction(
    "server",
    "createGist",
    pageName,
    cleanText,
  );

  const dispatchData = prepareFrontmatterDispatch(tree, {
    $share: [...$share, `gh-gist:${gistId}`],
  });

  await editor.flashNotification("Done!");

  await editor.dispatch(dispatchData);

  await editor.openUrl(`https://gist.github.com/${gistId}`);
}

export async function createGist(pageName: string, text: string) {
  const api = await GithubApi.fromConfig();
  return api.createGist("", true, {
    [`${pageName}.md`]: {
      content: text,
    },
  });
}

export async function getGist(id: string): Promise<Record<string, any>> {
  const api = await GithubApi.fromConfig();
  return api.getGist(id);
}

export async function loadGistCommand() {
  const gistUrl = await editor.prompt("Gist URL:");
  if (!gistUrl) {
    return;
  }
  const pieces = gistUrl.split("/");
  const gistId = pieces[pieces.length - 1];
  const gist = await system.invokeFunction("server", "getGist", gistId);
  if (Object.keys(gist).length !== 1) {
    await editor.flashNotification(
      "Only gists with a single file are supported",
      "error",
    );
    return;
  }
  const pageName = Object.keys(gist)[0].replace(/\.md$/, "");
  const text = (Object.values(gist)[0] as any).content;
  const finalPageName = await editor.prompt("Page name:", pageName);
  if (!finalPageName) {
    return;
  }
  await space.writePage(
    finalPageName,
    `---\n$share:\n- 'gh-gist:${gistId}'\n---\n${text}`,
  );
  await editor.navigate(finalPageName);
}

export async function openGistCommand() {
  const text = await editor.getText();
  const tree = await markdown.parseMarkdown(text);
  const { $share } = await extractFrontmatter(tree);
  if (!$share) {
    await editor.flashNotification("Not currently shared as gist", "error");
    return;
  }
  for (const uri of $share) {
    if (uri.startsWith("gh-gist:")) {
      const gistId = uri.split(":")[1];
      const url = `https://gist.github.com/${gistId}`;
      await editor.openUrl(url);
      return;
    }
  }
  await editor.flashNotification("Not currently shared as gist", "error");
}

export async function updateGist(event: PublishEvent) {
  const gistId = event.uri.split(":")[1];
  const api = await GithubApi.fromConfig();
  const text = await space.readPage(event.name);
  const tree = await markdown.parseMarkdown(text);
  // Only for side effect
  extractFrontmatter(tree, ["$share"]);
  const cleanText = renderToText(tree);

  await api.updateGist(gistId, "", true, {
    [`${event.name}.md`]: {
      content: cleanText,
    },
  });
  return true;
}
