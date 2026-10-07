type KnowledgeHit = {
  source: string;
  title: string;
  url?: string;
  excerpt: string;
};

type JsonRecord = Record<string, unknown>;

const headers = (values: Record<string, string>) => ({ Accept: "application/json", ...values });

function cleanText(value: unknown, maxLength = 1800): string {
  if (typeof value !== "string") return "";
  return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function safeBaseUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.origin + url.pathname.replace(/\/$/, "") : null;
  } catch {
    return null;
  }
}

async function getJson(url: string, init: RequestInit): Promise<JsonRecord> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!response.ok) throw new Error(`Knowledge provider returned ${response.status}.`);
  return await response.json() as JsonRecord;
}

async function getSharePointToken(): Promise<string | null> {
  const tenantId = process.env.SHAREPOINT_TENANT_ID;
  const clientId = process.env.SHAREPOINT_CLIENT_ID;
  const clientSecret = process.env.SHAREPOINT_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) return process.env.SHAREPOINT_ACCESS_TOKEN || null;
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Microsoft identity returned ${response.status}.`);
  const tokenResponse = await response.json() as JsonRecord;
  return typeof tokenResponse.access_token === "string" ? tokenResponse.access_token : null;
}

async function searchSharePoint(query: string): Promise<KnowledgeHit[]> {
  const token = await getSharePointToken();
  if (!token) return [];
  const url = "https://graph.microsoft.com/v1.0/search/query";
  const siteId = process.env.SHAREPOINT_SITE_ID;
  const result = await getJson(url, {
    method: "POST",
    headers: headers({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }),
    body: JSON.stringify({ requests: [{ entityTypes: ["driveItem", "listItem"], query: { queryString: `${query}${siteId ? ` siteid:${siteId}` : ""}` }, from: 0, size: 5 }] }),
  });
  const containers = (result.value as JsonRecord[] | undefined) ?? [];
  return containers.flatMap((container) => ((container.hitsContainers as JsonRecord[] | undefined) ?? []).flatMap((group) => ((group.hits as JsonRecord[] | undefined) ?? []).map((hit) => {
    const resource = (hit.resource as JsonRecord | undefined) ?? {};
    return {
      source: "SharePoint",
      title: cleanText(resource.name) || "SharePoint result",
      url: typeof resource.webUrl === "string" ? resource.webUrl : undefined,
      excerpt: cleanText(hit.summary) || cleanText(resource.description),
    };
  })));
}

async function searchJira(query: string): Promise<KnowledgeHit[]> {
  const baseUrl = safeBaseUrl(process.env.JIRA_BASE_URL);
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  if (!baseUrl || !email || !token) return [];
  const terms = [...new Set(query.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])].slice(0, 5);
  if (!terms.length) return [];
  const jql = `text ~ "${terms.join(" ")}" ORDER BY updated DESC`;
  const url = new URL(`${baseUrl}/rest/api/3/search`);
  url.searchParams.set("jql", jql);
  url.searchParams.set("fields", "summary,description,status,project");
  url.searchParams.set("maxResults", "5");
  const auth = Buffer.from(`${email}:${token}`).toString("base64");
  const result = await getJson(url.toString(), { headers: headers({ Authorization: `Basic ${auth}` }) });
  return ((result.issues as JsonRecord[] | undefined) ?? []).map((issue) => {
    const fields = (issue.fields as JsonRecord | undefined) ?? {};
    const key = typeof issue.key === "string" ? issue.key : "";
    return {
      source: "Jira",
      title: `${key}: ${cleanText(fields.summary, 240)}`,
      url: key ? `${baseUrl}/browse/${encodeURIComponent(key)}` : undefined,
      excerpt: cleanText(fields.description) || cleanText((fields.status as JsonRecord | undefined)?.name),
    };
  });
}

async function searchConfluence(query: string): Promise<KnowledgeHit[]> {
  const baseUrl = safeBaseUrl(process.env.CONFLUENCE_BASE_URL);
  const email = process.env.CONFLUENCE_EMAIL;
  const token = process.env.CONFLUENCE_API_TOKEN;
  if (!baseUrl || !email || !token) return [];
  const terms = [...new Set(query.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])].slice(0, 5);
  if (!terms.length) return [];
  const cql = `text ~ "${terms.join(" ")}" ORDER BY lastmodified DESC`;
  const url = new URL(`${baseUrl}/wiki/rest/api/content/search`);
  url.searchParams.set("cql", cql);
  url.searchParams.set("limit", "5");
  url.searchParams.set("expand", "body.storage,space,version");
  const auth = Buffer.from(`${email}:${token}`).toString("base64");
  const result = await getJson(url.toString(), { headers: headers({ Authorization: `Basic ${auth}` }) });
  return ((result.results as JsonRecord[] | undefined) ?? []).map((page) => {
    const body = (page.body as JsonRecord | undefined)?.storage as JsonRecord | undefined;
    const links = page._links as JsonRecord | undefined;
    const webUi = typeof links?.webui === "string" ? links.webui : undefined;
    return {
      source: "Confluence",
      title: cleanText(page.title, 240) || "Confluence page",
      url: webUi ? `${baseUrl}${webUi}` : undefined,
      excerpt: cleanText(body?.value),
    };
  });
}

export async function searchConnectedKnowledge(query: string): Promise<{ hits: KnowledgeHit[]; warnings: string[] }> {
  const providers = [searchSharePoint(query), searchJira(query), searchConfluence(query)];
  const results = await Promise.allSettled(providers);
  const hits: KnowledgeHit[] = [];
  const warnings: string[] = [];
  for (const [index, result] of results.entries()) {
    if (result.status === "fulfilled") hits.push(...result.value);
    else warnings.push(["SharePoint", "Jira", "Confluence"][index]);
  }
  return { hits, warnings };
}
