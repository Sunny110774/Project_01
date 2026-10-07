import sampleAlerts from "../../prisma/demo-alerts.json";

export type Priority = "P1" | "P2" | "P3" | "P4";
export type AlertStatus = "New" | "Open" | "In progress" | "Resolved";

export type AlertItem = {
  id: string;
  priority: Priority;
  subject: string;
  location: string;
  source: string;
  status: AlertStatus;
  assignee: string;
  created: string;
  createdAt?: string;
  ageMinutes: number;
  slaMinutes: number;
  body: string;
  ticket: string;
  ticketUrl?: string | null;
  sender?: string;
  recipient?: string | null;
  bodyHtml?: string | null;
  rawEmail?: string | null;
};

export const demoAlerts = sampleAlerts as unknown as AlertItem[];

export const prioritySlaMinutes: Record<Priority, number> = {
  P1: 30,
  P2: 60,
  P3: 240,
  P4: 480,
};
