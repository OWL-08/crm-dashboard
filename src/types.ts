// --- Core Data Types ---

export type PipelineStage = "lead" | "contacted" | "replied" | "negotiating" | "won" | "lost";

export interface Customer {
  id: number;
  name: string;
  website: string | null;
  country: string | null;
  industry: string | null;
  customer_type: string | null;
  scale: string | null;
  source: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface Contact {
  id: number;
  customer_id: number;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  role_category: string | null;
  notes: string | null;
}

export interface Pipeline {
  id: number;
  customer_id: number;
  contact_id: number | null;
  stage: string;
  product_interest: string | null;
  estimated_value: number | null;
  notes: string | null;
  next_action: string | null;
  next_action_date: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface Activity {
  id: number;
  customer_id: number;
  pipeline_id: number | null;
  activity_type: string;
  summary: string;
  created_at: string | null;
}

export interface CustomerDetail {
  customer: Customer;
  contacts: Contact[];
  pipeline: Pipeline | null;
  activities: Activity[];
}

export interface PipelineItem {
  customer: Customer;
  pipeline: Pipeline;
  contacts: Contact[];
}

// --- Search & Filter ---

export interface SearchFilters {
  keyword?: string | null;
  country?: string | null;
  stage?: string | null;
  customer_type?: string | null;
  scale?: string | null;
  limit?: number | null;
  offset?: number | null;
}

export interface SearchResult {
  customers: Customer[];
  total: number;
}

// --- Tags (Phase 3) ---

export interface Tag {
  id: number;
  name: string;
  color: string;
}

export interface TagWithCount extends Tag {
  customer_count: number;
}

export interface CustomerTag {
  customer_id: number;
  tag_id: number;
}

// --- Calendar (Phase 3) ---

export interface CalendarEvent {
  customer_id: number;
  customer_name: string;
  next_action: string | null;
  next_action_date: string;
  stage: string;
}

// --- Analytics (Phase 3) ---

export interface AnalyticsData {
  pipeline_distribution: { stage: string; count: number }[];
  country_distribution: { country: string; count: number }[];
  type_distribution: { type: string; count: number }[];
  total_customers: number;
  total_contacts: number;
  recent_activity_count: number;
  won_rate: number;
  contacted_rate: number;
}

// --- UI State ---

export type AppView = "pipeline" | "customers" | "analytics" | "calendar" | "tags";

export const STAGES: PipelineStage[] = ["lead", "contacted", "replied", "negotiating", "won", "lost"];

export const STAGE_LABELS: Record<string, string> = {
  lead: "待联系", contacted: "已联系", replied: "已回复",
  negotiating: "洽谈中", won: "已成交", lost: "已流失",
};

export const ROLE_LABELS: Record<string, string> = {
  "技术": "🔧 技术", "商务": "💼 商务", "管理层": "👔 管理层",
};
