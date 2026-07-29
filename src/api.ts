import { invoke } from "@tauri-apps/api/core";
import type {
  Customer, CustomerDetail, PipelineItem,
  SearchFilters, SearchResult, Tag, CalendarEvent, AnalyticsData,
} from "./types";

// --- Customers ---

export async function searchCustomers(filters: SearchFilters): Promise<SearchResult> {
  return invoke<SearchResult>("search_customers", { filters });
}

export async function getCustomer(id: number): Promise<CustomerDetail | null> {
  return invoke<CustomerDetail | null>("get_customer", { id });
}

export async function upsertCustomer(customer: Partial<Customer>): Promise<number> {
  return invoke<number>("upsert_customer", { customer });
}

export async function deleteCustomer(id: number): Promise<void> {
  return invoke<void>("delete_customer", { id });
}

// --- Pipeline ---

export async function getPipeline(
  stage?: string | null,
  keyword?: string | null,
  country?: string | null,
  customerType?: string | null,
  scale?: string | null,
): Promise<PipelineItem[]> {
  return invoke<PipelineItem[]>("get_pipeline", {
    stage: stage || null,
    keyword: keyword || null,
    country: country || null,
    customerType: customerType || null,
    scale: scale || null,
  });
}

export async function updatePipeline(pipeline: {
  customer_id: number; stage: string; product_interest?: string | null;
  estimated_value?: number | null; notes?: string | null;
  next_action?: string | null; next_action_date?: string | null;
}): Promise<{ id: number; stage: string }> {
  const result = await invoke<{ id: number; stage: string }>("update_pipeline_mcp", { pipeline });
  return result;
}

// --- Batch Import ---

export async function batchImportCustomers(customers: Partial<Customer>[]): Promise<{ imported: number; errors: { index: number; name: string; error: string }[] }> {
  return invoke("batch_import_customers", { customers });
}

export async function addContact(contact: {
  customer_id: number; name: string; title?: string | null; email?: string | null;
  phone?: string | null; role_category?: string | null; notes?: string | null;
}): Promise<number> {
  return invoke<number>("add_contact", { contact });
}

// --- Activities ---

export async function logActivity(activity: {
  customer_id: number; pipeline_id?: number | null;
  activity_type: string; summary: string;
}): Promise<number> {
  return invoke<number>("log_activity", { activity });
}

// --- Tags (Phase 3) ---

export async function getTags(): Promise<Tag[]> {
  return invoke<Tag[]>("get_tags");
}

export async function createTag(name: string, color: string): Promise<number> {
  return invoke<number>("create_tag", { name, color });
}

export async function deleteTag(id: number): Promise<void> {
  return invoke<void>("delete_tag", { id });
}

export async function getCustomerTags(customerId: number): Promise<Tag[]> {
  return invoke<Tag[]>("get_customer_tags", { customer_id: customerId });
}

export async function setCustomerTags(customerId: number, tagIds: number[]): Promise<void> {
  return invoke<void>("set_customer_tags", { customer_id: customerId, tag_ids: tagIds });
}

export async function getAllTagsWithCount(): Promise<(Tag & { customer_count: number })[]> {
  return invoke<(Tag & { customer_count: number })[]>("get_all_tags_with_count");
}

// --- Backup & Restore (Phase 4) ---

export async function getDatabaseInfo(): Promise<{
  db_path: string; file_size_bytes: number; wal_size_bytes: number;
  total_customers: number; total_contacts: number;
  total_pipeline: number; total_activities: number;
}> {
  return invoke("get_database_info");
}

export async function backupDatabase(destPath?: string): Promise<{ path: string; size_bytes: number; success: boolean }> {
  return invoke("backup_database", { destPath: destPath || null });
}

export async function restoreDatabase(srcPath: string): Promise<{ path: string; success: boolean; note: string }> {
  return invoke("restore_database", { srcPath });
}

export async function getCalendarEvents(): Promise<CalendarEvent[]> {
  return invoke<CalendarEvent[]>("get_calendar_events");
}

// --- Analytics (Phase 3) ---

export async function getAnalytics(): Promise<AnalyticsData> {
  return invoke<AnalyticsData>("get_analytics");
}

// --- Meta ---

export async function getDistinctCountries(): Promise<string[]> {
  return invoke<string[]>("get_distinct_countries");
}

export async function exportCustomersCsv(): Promise<string> {
  return invoke<string>("export_csv");
}
