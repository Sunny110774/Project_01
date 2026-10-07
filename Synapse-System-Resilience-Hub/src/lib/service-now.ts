type ServiceNowRecord = { sys_id?: string; number?: string; name?: string };
type ServiceNowResponse = { result?: ServiceNowRecord | ServiceNowRecord[] };

export type ServiceNowTicket = {
  sysId: string;
  number: string;
  url: string;
};

function configuration() {
  const baseUrl = process.env.SERVICENOW_INSTANCE_URL?.replace(/\/+$/, "");
  const token = process.env.SERVICENOW_ACCESS_TOKEN;
  const username = process.env.SERVICENOW_USERNAME;
  const password = process.env.SERVICENOW_PASSWORD;
  if (!baseUrl || (!token && (!username || !password))) return null;
  const authorization = token
    ? `Bearer ${token}`
    : `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  return { baseUrl, authorization };
}

export function isServiceNowConfigured() {
  return configuration() !== null;
}

async function requestServiceNow<T extends ServiceNowResponse>(path: string, init: RequestInit = {}): Promise<T> {
  const config = configuration();
  if (!config) throw new Error("ServiceNow is not configured on the server.");
  const response = await fetch(`${config.baseUrl}/api/now/table/${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: config.authorization,
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`ServiceNow returned HTTP ${response.status}.`);
  return await response.json() as T;
}

async function findServiceNowUser(assignee: string) {
  const query = new URLSearchParams({
    sysparm_query: `name=${assignee}`,
    sysparm_fields: "sys_id,name",
    sysparm_limit: "2",
  });
  const response = await requestServiceNow<ServiceNowResponse>(`sys_user?${query}`);
  const records = Array.isArray(response.result) ? response.result : [];
  const matches = records.filter((record) => record.name?.toLowerCase() === assignee.toLowerCase());
  if (matches.length !== 1 || !matches[0].sys_id) throw new Error(`A unique exact ServiceNow user match was not found for ${assignee}.`);
  return matches[0].sys_id;
}

function incidentState(status: string) {
  if (status === "In progress") return "2";
  if (status === "Resolved") return "6";
  if (status === "Closed") return "7";
  return "1";
}

export async function createServiceNowIncident(alert: {
  reference: string;
  subject: string;
  bodyText: string;
  status: string;
  assignee: string;
}): Promise<ServiceNowTicket> {
  const config = configuration();
  if (!config) throw new Error("ServiceNow is not configured on the server.");
  const assignedTo = await findServiceNowUser(alert.assignee);
  const response = await requestServiceNow<ServiceNowResponse>("incident", {
    method: "POST",
    body: JSON.stringify({
      short_description: alert.subject.slice(0, 160),
      description: `${alert.bodyText}\n\nSynopse alert: ${alert.reference}`,
      assigned_to: assignedTo,
      state: incidentState(alert.status),
      correlation_id: alert.reference,
    }),
  });
  const record = Array.isArray(response.result) ? response.result[0] : response.result;
  if (!record?.sys_id || !record.number) throw new Error("ServiceNow did not return an incident number.");
  return {
    sysId: record.sys_id,
    number: record.number,
    url: `${config.baseUrl}/nav_to.do?uri=incident.do?sys_id=${encodeURIComponent(record.sys_id)}`,
  };
}

export async function updateServiceNowIncident(sysId: string, update: { status?: string; assignee?: string | null }) {
  const fields: Record<string, string> = {};
  if (update.status) fields.state = incidentState(update.status);
  if (update.assignee !== undefined) fields.assigned_to = update.assignee ? await findServiceNowUser(update.assignee) : "";
  await requestServiceNow<ServiceNowResponse>(`incident/${encodeURIComponent(sysId)}`, {
    method: "PATCH",
    body: JSON.stringify(fields),
  });
}