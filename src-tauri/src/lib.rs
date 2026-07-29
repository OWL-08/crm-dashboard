mod db;
mod mcp;

use db::{Activity, AnalyticsData, CalendarEvent, Contact, Customer, Database, Pipeline, SearchFilters, Tag, TagWithCount};
use std::sync::Arc;

struct AppState {
    db: Arc<Database>,
}

// ====================
// Customer commands
// ====================

#[tauri::command]
fn search_customers(state: tauri::State<AppState>, filters: SearchFilters) -> Result<db::SearchResult, String> {
    state.db.search_customers(&filters).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_customer(state: tauri::State<AppState>, id: i64) -> Result<Option<db::CustomerDetail>, String> {
    state.db.get_customer_detail(id).map_err(|e| e.to_string())
}

#[tauri::command]
fn upsert_customer(state: tauri::State<AppState>, customer: Customer) -> Result<i64, String> {
    state.db.upsert_customer(&customer).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_customer(state: tauri::State<AppState>, id: i64) -> Result<(), String> {
    state.db.delete_customer(id).map_err(|e| e.to_string())
}

#[tauri::command]
fn add_contact(state: tauri::State<AppState>, contact: Contact) -> Result<i64, String> {
    state.db.add_contact(&contact).map_err(|e| e.to_string())
}

#[tauri::command]
fn batch_import_customers(state: tauri::State<AppState>, customers: Vec<Customer>) -> Result<serde_json::Value, String> {
    let mut imported = 0i64;
    let mut errors: Vec<serde_json::Value> = Vec::new();
    for (i, c) in customers.iter().enumerate() {
        match state.db.upsert_customer(c) {
            Ok(_) => imported += 1,
            Err(e) => errors.push(serde_json::json!({"index": i, "name": &c.name, "error": e.to_string()})),
        }
    }
    Ok(serde_json::json!({"imported": imported, "errors": errors}))
}

// ====================
// Pipeline commands
// ====================

#[tauri::command]
fn update_pipeline(state: tauri::State<AppState>, pipeline: Pipeline) -> Result<i64, String> {
    state.db.upsert_pipeline(&pipeline).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_pipeline(
    state: tauri::State<AppState>,
    stage: Option<String>,
    keyword: Option<String>,
    country: Option<String>,
    customer_type: Option<String>,
    scale: Option<String>,
) -> Result<Vec<serde_json::Value>, String> {
    let items = state.db.get_pipeline(
        stage.as_deref(),
        keyword.as_deref(),
        country.as_deref(),
        customer_type.as_deref(),
        scale.as_deref(),
    ).map_err(|e| e.to_string())?;
    let result: Vec<serde_json::Value> = items.into_iter().map(|(c, p)| {
        let contacts = state.db.get_customer_contacts(c.id.unwrap_or(0)).unwrap_or_default();
        serde_json::json!({"customer": c, "pipeline": p, "contacts": contacts})
    }).collect();
    Ok(result)
}

#[tauri::command]
fn update_pipeline_mcp(state: tauri::State<AppState>, pipeline: serde_json::Value) -> Result<serde_json::Value, String> {
    let customer_id = pipeline.get("customer_id").and_then(|v| v.as_i64()).ok_or("customer_id required")?;
    let stage = pipeline.get("stage").and_then(|v| v.as_str()).unwrap_or("lead");
    let p = Pipeline {
        id: None,
        customer_id,
        contact_id: pipeline.get("contact_id").and_then(|v| v.as_i64()),
        stage: stage.to_string(),
        product_interest: pipeline.get("product_interest").and_then(|v| v.as_str()).map(String::from),
        estimated_value: pipeline.get("estimated_value").and_then(|v| v.as_f64()),
        notes: pipeline.get("notes").and_then(|v| v.as_str()).map(String::from),
        next_action: pipeline.get("next_action").and_then(|v| v.as_str()).map(String::from),
        next_action_date: pipeline.get("next_action_date").and_then(|v| v.as_str()).map(String::from),
        created_at: None,
        updated_at: None,
    };
    let pid = state.db.upsert_pipeline(&p).map_err(|e| e.to_string())?;

    if let Some(note) = pipeline.get("activity_note").and_then(|v| v.as_str()) {
        let _ = state.db.add_activity(&Activity {
            id: None, customer_id, pipeline_id: Some(pid),
            activity_type: "stage_change".to_string(),
            summary: format!("Stage → {}: {}", stage, note),
            created_at: None,
        });
    }

    Ok(serde_json::json!({"id": pid, "stage": stage}))
}

// ====================
// Activity commands
// ====================

#[tauri::command]
fn log_activity(state: tauri::State<AppState>, activity: Activity) -> Result<i64, String> {
    state.db.add_activity(&activity).map_err(|e| e.to_string())
}

// ====================
// Tags (Phase 3)
// ====================

#[tauri::command]
fn get_tags(state: tauri::State<AppState>) -> Result<Vec<Tag>, String> {
    state.db.get_tags().map_err(|e| e.to_string())
}

#[tauri::command]
fn create_tag(state: tauri::State<AppState>, name: String, color: String) -> Result<i64, String> {
    state.db.create_tag(&name, &color).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_tag(state: tauri::State<AppState>, id: i64) -> Result<(), String> {
    state.db.delete_tag(id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_customer_tags(state: tauri::State<AppState>, customer_id: i64) -> Result<Vec<Tag>, String> {
    state.db.get_customer_tags(customer_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_customer_tags(state: tauri::State<AppState>, customer_id: i64, tag_ids: Vec<i64>) -> Result<(), String> {
    state.db.set_customer_tags(customer_id, &tag_ids).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_all_tags_with_count(state: tauri::State<AppState>) -> Result<Vec<TagWithCount>, String> {
    state.db.get_all_tags_with_count().map_err(|e| e.to_string())
}

// ====================
// Calendar (Phase 3)
// ====================

#[tauri::command]
fn get_calendar_events(state: tauri::State<AppState>) -> Result<Vec<CalendarEvent>, String> {
    state.db.get_calendar_events().map_err(|e| e.to_string())
}

// ====================
// Analytics (Phase 3)
// ====================

#[tauri::command]
fn get_analytics(state: tauri::State<AppState>) -> Result<AnalyticsData, String> {
    state.db.get_analytics().map_err(|e| e.to_string())
}

// ====================
// Meta
// ====================

#[tauri::command]
fn get_distinct_countries(state: tauri::State<AppState>) -> Result<Vec<String>, String> {
    state.db.get_distinct_countries().map_err(|e| e.to_string())
}

#[tauri::command]
fn export_csv(state: tauri::State<AppState>) -> Result<String, String> {
    let customers = state.db.get_all_customers_csv().map_err(|e| e.to_string())?;
    let mut csv = String::from("name,website,country,industry,customer_type,scale,source,notes\n");
    for c in &customers {
        csv.push_str(&format!(
            "{},{},{},{},{},{},{},{}\n",
            escape_csv(&c.name),
            escape_csv(&c.website.as_deref().unwrap_or("")),
            escape_csv(&c.country.as_deref().unwrap_or("")),
            escape_csv(&c.industry.as_deref().unwrap_or("")),
            escape_csv(&c.customer_type.as_deref().unwrap_or("")),
            escape_csv(&c.scale.as_deref().unwrap_or("")),
            escape_csv(&c.source.as_deref().unwrap_or("")),
            escape_csv(&c.notes.as_deref().unwrap_or("")),
        ));
    }
    Ok(csv)
}

fn escape_csv(s: &str) -> String {
    if s.contains(',') || s.contains('"') || s.contains('\n') {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

// ====================
// Backup & Restore (Phase 4)
// ====================

#[tauri::command]
fn get_database_info(state: tauri::State<AppState>) -> Result<serde_json::Value, String> {
    state.db.get_database_info().map_err(|e| e.to_string())
}

#[tauri::command]
fn backup_database(state: tauri::State<AppState>, dest_path: Option<String>) -> Result<serde_json::Value, String> {
    // Determine backup path
    let path = if let Some(p) = dest_path {
        if p.is_empty() {
            default_backup_path(&state.db.db_path)
        } else {
            p
        }
    } else {
        default_backup_path(&state.db.db_path)
    };

    // Ensure parent directory exists
    if let Some(parent) = std::path::Path::new(&path).parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    state.db.backup_to(&path)?;
    let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "path": path,
        "size_bytes": metadata.len(),
        "success": true
    }))
}

fn default_backup_path(db_path: &str) -> String {
    let db = std::path::Path::new(db_path);
    let parent = db.parent().unwrap_or(std::path::Path::new("."));
    let backup_dir = parent.join("backups");
    let ts = chrono::Local::now().format("%Y%m%d_%H%M%S");
    backup_dir.join(format!("crm-backup-{}.db", ts)).to_string_lossy().to_string()
}

#[tauri::command]
fn restore_database(state: tauri::State<AppState>, src_path: String) -> Result<serde_json::Value, String> {
    state.db.restore_from(&src_path)?;
    Ok(serde_json::json!({
        "path": src_path,
        "success": true,
        "note": "数据库已恢复，建议重启应用以确保全部数据正确加载"
    }))
}

// ====================
// App entry
// ====================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db_path = dirs_next().unwrap_or_else(|| std::path::PathBuf::from(".")).join("crm.db");
    let db_path_str = db_path.to_string_lossy().to_string();
    let db = Arc::new(Database::new(&db_path_str).expect("Failed to initialize database"));
    println!("Database at: {}", db_path_str);

    // Start MCP server on port 9876
    let db_for_mcp = db.clone();
    mcp::start_mcp_server(db_for_mcp, 9876);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState { db })
        .invoke_handler(tauri::generate_handler![
            // Customers
            search_customers,
            get_customer,
            upsert_customer,
            delete_customer,
            add_contact,
            batch_import_customers,
            // Pipeline
            update_pipeline,
            update_pipeline_mcp,
            get_pipeline,
            // Activities
            log_activity,
            // Tags
            get_tags,
            create_tag,
            delete_tag,
            get_customer_tags,
            set_customer_tags,
            get_all_tags_with_count,
            // Calendar
            get_calendar_events,
            // Analytics
            get_analytics,
            // Meta
            get_distinct_countries,
            export_csv,
            // Backup & Restore
            get_database_info,
            backup_database,
            restore_database,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn dirs_next() -> Option<std::path::PathBuf> {
    if let Ok(data_dir) = std::env::var("APPDATA") {
        let path = std::path::PathBuf::from(data_dir).join("CRM-Dashboard");
        let _ = std::fs::create_dir_all(&path);
        return Some(path);
    }
    if let Ok(home) = std::env::var("HOME") {
        let path = std::path::PathBuf::from(home).join(".crm-dashboard");
        let _ = std::fs::create_dir_all(&path);
        return Some(path);
    }
    if let Ok(profile) = std::env::var("USERPROFILE") {
        let path = std::path::PathBuf::from(profile).join("CRM-Dashboard");
        let _ = std::fs::create_dir_all(&path);
        return Some(path);
    }
    None
}
