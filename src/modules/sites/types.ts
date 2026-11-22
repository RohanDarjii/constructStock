export const siteStatuses = ["PLANNED", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED", "ARCHIVED"] as const;
export type SiteStatus = (typeof siteStatuses)[number];

export interface SiteView {
  id: string;
  code: string;
  name: string;
  description: string | null;
  location: { address: string | null; city: string; state: string | null; country: string };
  contact: { name: string | null; phone: string | null; email: string | null } | null;
  status: SiteStatus;
  startDate: string | null;
  expectedCompletionDate: string | null;
  budget: string | null;
  currencyCode: string;
  createdAt: string;
  updatedAt: string;
}
