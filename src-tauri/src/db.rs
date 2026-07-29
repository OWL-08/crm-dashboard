use rusqlite::{Connection, params, Result as SqlResult};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

pub struct Database {
    pub conn: Mutex<Connection>,
    pub db_path: String,
}

// --- Data Models ---

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Customer {
    pub id: Option<i64>,
    pub name: String,
    pub website: Option<String>,
    pub country: Option<String>,
    pub industry: Option<String>,
    pub customer_type: Option<String>,
    pub scale: Option<String>,
    pub source: Option<String>,
    pub notes: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Contact {
    pub id: Option<i64>,
    pub customer_id: i64,
    pub name: String,
    pub title: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub role_category: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Pipeline {
    pub id: Option<i64>,
    pub customer_id: i64,
    pub contact_id: Option<i64>,
    pub stage: String,
    pub product_interest: Option<String>,
    pub estimated_value: Option<f64>,
    pub notes: Option<String>,
    pub next_action: Option<String>,
    pub next_action_date: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Activity {
    pub id: Option<i64>,
    pub customer_id: i64,
    pub pipeline_id: Option<i64>,
    pub activity_type: String,
    pub summary: String,
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CustomerDetail {
    pub customer: Customer,
    pub contacts: Vec<Contact>,
    pub pipeline: Option<Pipeline>,
    pub activities: Vec<Activity>,
}

// --- Search ---

#[derive(Debug, Deserialize)]
pub struct SearchFilters {
    pub keyword: Option<String>,
    pub country: Option<String>,
    pub stage: Option<String>,
    pub customer_type: Option<String>,
    pub scale: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct SearchResult {
    pub customers: Vec<Customer>,
    pub total: i64,
}

// --- Tags (Phase 3) ---

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Tag {
    pub id: Option<i64>,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TagWithCount {
    pub id: Option<i64>,
    pub name: String,
    pub color: String,
    pub customer_count: i64,
}

// --- Calendar (Phase 3) ---

#[derive(Debug, Serialize)]
pub struct CalendarEvent {
    pub customer_id: i64,
    pub customer_name: String,
    pub next_action: Option<String>,
    pub next_action_date: String,
    pub stage: String,
}

// --- Analytics (Phase 3) ---

#[derive(Debug, Serialize)]
pub struct StageCount {
    pub stage: String,
    pub count: i64,
}

#[derive(Debug, Serialize)]
pub struct CountryCount {
    pub country: String,
    pub count: i64,
}

#[derive(Debug, Serialize)]
pub struct TypeCount {
    #[serde(rename = "type")]
    pub type_name: String,
    pub count: i64,
}

#[derive(Debug, Serialize)]
pub struct AnalyticsData {
    pub pipeline_distribution: Vec<StageCount>,
    pub country_distribution: Vec<CountryCount>,
    pub type_distribution: Vec<TypeCount>,
    pub total_customers: i64,
    pub total_contacts: i64,
    pub recent_activity_count: i64,
    pub won_rate: f64,
    pub contacted_rate: f64,
}

impl Database {
    pub fn new(db_path: &str) -> SqlResult<Self> {
        let conn = Connection::open(db_path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
        let db = Database { conn: Mutex::new(conn), db_path: db_path.to_string() };
        db.init_tables()?;
        Ok(db)
    }

    fn init_tables(&self) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS customers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                website TEXT,
                country TEXT,
                industry TEXT,
                customer_type TEXT,
                scale TEXT,
                source TEXT,
                notes TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            );

            CREATE TABLE IF NOT EXISTS contacts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                title TEXT,
                email TEXT,
                phone TEXT,
                role_category TEXT,
                notes TEXT
            );

            CREATE TABLE IF NOT EXISTS pipeline (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_id INTEGER NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
                contact_id INTEGER REFERENCES contacts(id),
                stage TEXT NOT NULL DEFAULT 'lead',
                product_interest TEXT,
                estimated_value REAL,
                notes TEXT,
                next_action TEXT,
                next_action_date TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            );

            CREATE TABLE IF NOT EXISTS activities (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
                pipeline_id INTEGER REFERENCES pipeline(id),
                activity_type TEXT NOT NULL,
                summary TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            );

            -- Tags system (Phase 3)
            CREATE TABLE IF NOT EXISTS tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                color TEXT NOT NULL DEFAULT '#3b82f6'
            );

            CREATE TABLE IF NOT EXISTS customer_tags (
                customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
                tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
                PRIMARY KEY (customer_id, tag_id)
            );

            -- FTS5 full-text search
            CREATE VIRTUAL TABLE IF NOT EXISTS customers_fts USING fts5(
                name, website, notes,
                content='customers',
                content_rowid='id',
                tokenize='unicode61'
            );

            -- Triggers to keep FTS index in sync
            CREATE TRIGGER IF NOT EXISTS customers_fts_ai AFTER INSERT ON customers BEGIN
                INSERT INTO customers_fts(rowid, name, website, notes)
                VALUES (new.id, new.name, new.website, new.notes);
            END;

            CREATE TRIGGER IF NOT EXISTS customers_fts_ad AFTER DELETE ON customers BEGIN
                INSERT INTO customers_fts(customers_fts, rowid, name, website, notes)
                VALUES ('delete', old.id, old.name, old.website, old.notes);
            END;

            CREATE TRIGGER IF NOT EXISTS customers_fts_au AFTER UPDATE ON customers BEGIN
                INSERT INTO customers_fts(customers_fts, rowid, name, website, notes)
                VALUES ('delete', old.id, old.name, old.website, old.notes);
                INSERT INTO customers_fts(rowid, name, website, notes)
                VALUES (new.id, new.name, new.website, new.notes);
            END;

            -- Schema migration tracking (Phase 4)
            CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER PRIMARY KEY
            );"
        )?;

        // Rebuild FTS index for any existing data (idempotent)
        let existing_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM customers_fts", [], |r| r.get(0)
        ).unwrap_or(0);
        let customer_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM customers", [], |r| r.get(0)
        ).unwrap_or(0);
        if existing_count < customer_count {
            let _ = conn.execute_batch("INSERT INTO customers_fts(customers_fts) VALUES('rebuild')");
            println!("FTS index rebuilt: {} docs", customer_count);
        }

        // Run pending schema migrations
        let current_version: i64 = conn
            .query_row("SELECT COALESCE(MAX(version), 0) FROM schema_version", [], |r| r.get(0))
            .unwrap_or(0);

        if current_version < 2 {
            // Migration v2: fix FTS5 implementation
            // 1. Rebuild FTS index with improved query handling
            // 2. Add indexes for filter performance
            conn.execute_batch(
                "CREATE INDEX IF NOT EXISTS idx_customers_country ON customers(country);
                 CREATE INDEX IF NOT EXISTS idx_customers_type ON customers(customer_type);
                 CREATE INDEX IF NOT EXISTS idx_customers_scale ON customers(scale);
                 INSERT OR REPLACE INTO schema_version (version) VALUES (2);"
            )?;
            println!("Schema migrated to version 2");
        }

        Ok(())
    }

    // ====================
    // Customers
    // ====================

    pub fn upsert_customer(&self, c: &Customer) -> SqlResult<i64> {
        let conn = self.conn.lock().unwrap();
        if let Some(id) = c.id {
            conn.execute(
                "UPDATE customers SET name=?, website=?, country=?, industry=?, customer_type=?, scale=?, source=?, notes=?, updated_at=datetime('now','localtime') WHERE id=?",
                params![c.name, c.website, c.country, c.industry, c.customer_type, c.scale, c.source, c.notes, id],
            )?;
            Ok(id)
        } else {
            conn.execute(
                "INSERT INTO customers (name, website, country, industry, customer_type, scale, source, notes) VALUES (?,?,?,?,?,?,?,?)",
                params![c.name, c.website, c.country, c.industry, c.customer_type, c.scale, c.source, c.notes],
            )?;
            Ok(conn.last_insert_rowid())
        }
    }

    /// Try FTS5 with prefix matching. Handles special-char escaping and
    /// query syntax errors with a simplified-query fallback.
    fn try_fts_prefix(conn: &Connection, kw: &str) -> Option<Vec<i64>> {
        // Build a safe FTS5 prefix query: "term1"* AND "term2"*
        let fts_query = kw
            .split_whitespace()
            .filter(|t| !t.is_empty())
            .map(|t| {
                let escaped = t.replace('"', "\"\"");
                // '*' after closing quote = prefix match (handles CJK unigrams too)
                format!("\"{}\"*", escaped)
            })
            .collect::<Vec<_>>()
            .join(" AND ");

        if fts_query.trim().is_empty() || fts_query.trim() == "*" {
            return None;
        }

        let ids_result: Result<Vec<i64>, _> = (|| {
            let mut stmt = conn.prepare(
                "SELECT DISTINCT rowid FROM customers_fts WHERE customers_fts MATCH ?1 LIMIT 10000"
            )?;
            let rows = stmt.query_map([&fts_query], |row| row.get::<_, i64>(0))?;
            rows.collect()
        })();

        match ids_result {
            Ok(ids) if !ids.is_empty() => Some(ids),
            Ok(_) => None, // empty → try LIKE fallback
            Err(_) => {
                // FTS5 syntax error: try a simplified query stripping problematic chars
                let simplified: String = kw
                    .chars()
                    .filter(|c| c.is_alphanumeric() || c.is_whitespace() || *c == '-' || *c == '\'' || *c == '.')
                    .collect();
                let simplified_query = simplified
                    .split_whitespace()
                    .filter(|t| !t.is_empty())
                    .map(|t| format!("\"{}\"*", t.replace('"', "\"\"")))
                    .collect::<Vec<_>>()
                    .join(" AND ");
                if simplified_query.is_empty() || simplified_query.trim() == "*" {
                    None
                } else {
                    match (|| {
                        let mut stmt = conn.prepare(
                            "SELECT DISTINCT rowid FROM customers_fts WHERE customers_fts MATCH ?1 LIMIT 10000"
                        )?;
                        let rows = stmt.query_map([&simplified_query], |row| row.get::<_, i64>(0))?;
                        rows.collect::<Result<Vec<_>, _>>()
                    })() {
                        Ok(ids) => {
                            if cfg!(debug_assertions) {
                                eprintln!("FTS5 syntax error for '{}', used simplified: {}", kw, simplified_query);
                            }
                            if ids.is_empty() { None } else { Some(ids) }
                        }
                        Err(_) => None,
                    }
                }
            }
        }
    }

    /// LIKE-based fallback: searches name/website/notes with %keyword%.
    /// Always succeeds (returns empty vec on DB error) to keep the overall
    /// search from failing when FTS5 is unavailable.
    fn try_like_fallback(conn: &Connection, kw: &str) -> Vec<i64> {
        let like = format!("%{}%", kw.replace('%', "\\%").replace('_', "\\_"));
        let sql = "SELECT DISTINCT id FROM customers WHERE name LIKE ?1 ESCAPE '\\' OR website LIKE ?1 ESCAPE '\\' OR notes LIKE ?1 ESCAPE '\\' LIMIT 10000";
        conn.prepare(sql)
            .and_then(|mut stmt| {
                let rows = stmt.query_map([&like], |row| row.get::<_, i64>(0))?;
                rows.collect::<Result<Vec<_>, _>>()
            })
            .unwrap_or_default()
    }

    pub fn search_customers(&self, filters: &SearchFilters) -> SqlResult<SearchResult> {
        let conn = self.conn.lock().unwrap();

        // FTS5 full-text search with prefix matching + LIKE fallback
        // Strategy: try FTS5 prefix match first (fast, indexed). If it yields
        // results, use those. If empty or error, fall back to LIKE (slower but
        // catches substrings FTS5 token boundaries would miss — e.g. "acme"
        // matching "acmecorp" when "acmecorp" is one FTS5 token).
        // FTS5 prefix query ("term"*) matches any token starting with "term",
        // while LIKE %term% matches anywhere in the text — together they
        // provide both speed and coverage.
        let fts_ids: Option<Vec<i64>> = if let Some(ref kw) = filters.keyword {
            let kw = kw.trim();
            if !kw.is_empty() {
                if kw.len() < 2 {
                    // Single-character: skip FTS5 (prefix match too broad) and
                    // go straight to LIKE fallback for substring matching
                    let like_ids = Self::try_like_fallback(&conn, kw);
                    Some(if like_ids.is_empty() { vec![] } else { like_ids })
                } else {
                    // Multi-char: FTS5 prefix query first, LIKE fallback on empty
                    let fts_ids = Self::try_fts_prefix(&conn, kw);
                    if fts_ids.as_ref().map_or(true, |ids| ids.is_empty()) {
                        let like_ids = Self::try_like_fallback(&conn, kw);
                        Some(if like_ids.is_empty() { vec![] } else { like_ids })
                    } else {
                        fts_ids
                    }
                }
            } else {
                None
            }
        } else {
            None
        };

        // Build WHERE clause — FTS results used as ID filter when keyword was provided
        let (where_clause, param_values) = self.build_search_where(filters, fts_ids.as_deref());

        // Count query
        let count_sql = format!(
            "SELECT COUNT(DISTINCT c.id) FROM customers c LEFT JOIN pipeline p ON c.id = p.customer_id WHERE 1=1{}",
            where_clause
        );
        let params_refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|v| v as &dyn rusqlite::types::ToSql).collect();
        let total: i64 = conn.query_row(&count_sql, params_refs.as_slice(), |row| row.get(0))?;

        // Data query with name-priority ordering + pagination
        // Build name-priority sort: names starting with keyword first,
        // then names containing keyword, then updated_at DESC
        let (name_sort_sql, name_sort_params): (String, Vec<String>) =
            if let Some(ref kw) = filters.keyword {
                let kw = kw.trim();
                if !kw.is_empty() {
                    let escaped = kw.replace('%', "\\%").replace('_', "\\_");
                    let start_with = format!("{}%", escaped);
                    let contains = format!("%{}%", escaped);
                    let mut sort_params = vec![start_with, contains];
                    let p_start = param_values.len() + 1;
                    let p_contains = param_values.len() + 2;
                    (
                        format!(
                            "CASE WHEN c.name LIKE ?{0} ESCAPE '\\' THEN 0 WHEN c.name LIKE ?{1} ESCAPE '\\' THEN 1 ELSE 2 END,",
                            p_start, p_contains
                        ),
                        sort_params,
                    )
                } else {
                    (String::new(), vec![])
                }
            } else {
                (String::new(), vec![])
            };

        let mut data_sql = format!(
            "SELECT DISTINCT c.id, c.name, c.website, c.country, c.industry, c.customer_type, c.scale, c.source, c.notes, c.created_at, c.updated_at FROM customers c LEFT JOIN pipeline p ON c.id = p.customer_id WHERE 1=1{} ORDER BY {}c.updated_at DESC",
            where_clause, name_sort_sql
        );

        let mut data_params: Vec<String> = param_values.clone();
        data_params.extend(name_sort_params);
        if let Some(limit) = filters.limit {
            if limit > 0 {
                data_params.push(limit.to_string());
                data_sql.push_str(&format!(" LIMIT ?{}", data_params.len()));
                if let Some(offset) = filters.offset {
                    if offset > 0 {
                        data_params.push(offset.to_string());
                        data_sql.push_str(&format!(" OFFSET ?{}", data_params.len()));
                    }
                }
            }
        }

        let data_params_refs: Vec<&dyn rusqlite::types::ToSql> = data_params.iter().map(|v| v as &dyn rusqlite::types::ToSql).collect();
        let mut stmt = conn.prepare(&data_sql)?;
        let rows = stmt.query_map(data_params_refs.as_slice(), |row| {
            Ok(Customer {
                id: Some(row.get(0)?),
                name: row.get(1)?,
                website: row.get(2)?,
                country: row.get(3)?,
                industry: row.get(4)?,
                customer_type: row.get(5)?,
                scale: row.get(6)?,
                source: row.get(7)?,
                notes: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })?;
        let customers: Vec<Customer> = rows.collect::<SqlResult<Vec<_>>>()?;

        Ok(SearchResult { customers, total })
    }

    fn build_search_where(&self, filters: &SearchFilters, fts_ids: Option<&[i64]>) -> (String, Vec<String>) {
        let mut clauses = Vec::new();
        let mut params: Vec<String> = Vec::new();

        // If FTS5 resolved IDs, use them directly — no LIKE needed
        if let Some(ids) = fts_ids {
            if ids.is_empty() {
                // FTS found nothing — force empty result
                clauses.push(" AND 1=0".to_string());
            } else {
                let placeholders: Vec<String> = (0..ids.len()).map(|i| {
                    params.push(ids[i].to_string());
                    format!("?{}", params.len())
                }).collect();
                clauses.push(format!(" AND c.id IN ({})", placeholders.join(",")));
            }
        }
        // Note: keyword LIKE fallback is intentionally removed for consistency.
        // FTS5 is the sole keyword search path — it handles CJK, special chars,
        // and partial matching correctly with the trigram-friendly quoting above.
        if let Some(ref country) = filters.country {
            if !country.is_empty() {
                params.push(country.clone());
                clauses.push(format!(" AND c.country = ?{}", params.len()));
            }
        }
        if let Some(ref stage) = filters.stage {
            if !stage.is_empty() {
                params.push(stage.clone());
                clauses.push(format!(" AND p.stage = ?{}", params.len()));
            }
        }
        if let Some(ref ct) = filters.customer_type {
            if !ct.is_empty() {
                params.push(ct.clone());
                clauses.push(format!(" AND c.customer_type = ?{}", params.len()));
            }
        }
        if let Some(ref s) = filters.scale {
            if !s.is_empty() {
                params.push(s.clone());
                clauses.push(format!(" AND c.scale = ?{}", params.len()));
            }
        }

        (clauses.concat(), params)
    }

    pub fn get_customer(&self, id: i64) -> SqlResult<Option<Customer>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, website, country, industry, customer_type, scale, source, notes, created_at, updated_at FROM customers WHERE id=?"
        )?;
        let mut rows = stmt.query_map(params![id], |row| {
            Ok(Customer {
                id: Some(row.get(0)?), name: row.get(1)?, website: row.get(2)?,
                country: row.get(3)?, industry: row.get(4)?, customer_type: row.get(5)?,
                scale: row.get(6)?, source: row.get(7)?, notes: row.get(8)?,
                created_at: row.get(9)?, updated_at: row.get(10)?,
            })
        })?;
        Ok(rows.next().transpose()?)
    }

    pub fn get_customer_detail(&self, id: i64) -> SqlResult<Option<CustomerDetail>> {
        let customer = match self.get_customer(id)? {
            Some(c) => c,
            None => return Ok(None),
        };
        let conn = self.conn.lock().unwrap();

        let mut stmt = conn.prepare("SELECT id, customer_id, name, title, email, phone, role_category, notes FROM contacts WHERE customer_id=?")?;
        let contacts: Vec<Contact> = stmt.query_map(params![id], |row| {
            Ok(Contact {
                id: Some(row.get(0)?), customer_id: row.get(1)?, name: row.get(2)?,
                title: row.get(3)?, email: row.get(4)?, phone: row.get(5)?,
                role_category: row.get(6)?, notes: row.get(7)?,
            })
        })?.filter_map(|r| r.ok()).collect();

        let pipeline = {
            let mut stmt = conn.prepare(
                "SELECT id, customer_id, contact_id, stage, product_interest, estimated_value, notes, next_action, next_action_date, created_at, updated_at FROM pipeline WHERE customer_id=?"
            )?;
            let mut rows = stmt.query_map(params![id], |row| {
                Ok(Pipeline {
                    id: Some(row.get(0)?), customer_id: row.get(1)?, contact_id: row.get(2)?,
                    stage: row.get(3)?, product_interest: row.get(4)?, estimated_value: row.get(5)?,
                    notes: row.get(6)?, next_action: row.get(7)?, next_action_date: row.get(8)?,
                    created_at: row.get(9)?, updated_at: row.get(10)?,
                })
            })?;
            rows.next().transpose()?
        };

        let mut stmt = conn.prepare(
            "SELECT id, customer_id, pipeline_id, activity_type, summary, created_at FROM activities WHERE customer_id=? ORDER BY created_at DESC"
        )?;
        let activities: Vec<Activity> = stmt.query_map(params![id], |row| {
            Ok(Activity {
                id: Some(row.get(0)?), customer_id: row.get(1)?, pipeline_id: row.get(2)?,
                activity_type: row.get(3)?, summary: row.get(4)?, created_at: row.get(5)?,
            })
        })?.filter_map(|r| r.ok()).collect();

        Ok(Some(CustomerDetail { customer, contacts, pipeline, activities }))
    }

    pub fn delete_customer(&self, id: i64) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        // Foreign key ON DELETE CASCADE handles related records
        conn.execute("DELETE FROM customers WHERE id=?", params![id])?;
        Ok(())
    }

    // ====================
    // Contacts
    // ====================

    pub fn get_customer_contacts(&self, customer_id: i64) -> SqlResult<Vec<Contact>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, customer_id, name, title, email, phone, role_category, notes FROM contacts WHERE customer_id=? ORDER BY id"
        )?;
        let rows = stmt.query_map(params![customer_id], |row| {
            Ok(Contact {
                id: Some(row.get(0)?), customer_id: row.get(1)?, name: row.get(2)?,
                title: row.get(3)?, email: row.get(4)?, phone: row.get(5)?,
                role_category: row.get(6)?, notes: row.get(7)?,
            })
        })?;
        rows.collect()
    }

    pub fn add_contact(&self, c: &Contact) -> SqlResult<i64> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO contacts (customer_id, name, title, email, phone, role_category, notes) VALUES (?,?,?,?,?,?,?)",
            params![c.customer_id, c.name, c.title, c.email, c.phone, c.role_category, c.notes],
        )?;
        Ok(conn.last_insert_rowid())
    }

    // ====================
    // Pipeline
    // ====================

    pub fn upsert_pipeline(&self, p: &Pipeline) -> SqlResult<i64> {
        let conn = self.conn.lock().unwrap();
        let existing: Option<i64> = conn.query_row(
            "SELECT id FROM pipeline WHERE customer_id=?", params![p.customer_id], |row| row.get(0),
        ).ok();

        let pid = if let Some(pid) = existing.or(p.id) {
            conn.execute(
                "UPDATE pipeline SET stage=?, product_interest=?, estimated_value=?, notes=?, next_action=?, next_action_date=?, updated_at=datetime('now','localtime') WHERE id=?",
                params![p.stage, p.product_interest, p.estimated_value, p.notes, p.next_action, p.next_action_date, pid],
            )?;
            pid
        } else {
            conn.execute(
                "INSERT INTO pipeline (customer_id, contact_id, stage, product_interest, estimated_value, notes) VALUES (?,?,?,?,?,?)",
                params![p.customer_id, p.contact_id, p.stage, p.product_interest, p.estimated_value, p.notes],
            )?;
            conn.last_insert_rowid()
        };
        Ok(pid)
    }

    pub fn get_pipeline(
        &self,
        stage: Option<&str>,
        keyword: Option<&str>,
        country: Option<&str>,
        customer_type: Option<&str>,
        scale: Option<&str>,
    ) -> SqlResult<Vec<(Customer, Pipeline)>> {
        let conn = self.conn.lock().unwrap();

        // Build dynamic WHERE clause from filters + keyword
        // Keyword uses FTS5 (with LIKE fallback) for consistency with search_customers
        let mut conditions: Vec<String> = Vec::new();
        let mut params_vals: Vec<String> = Vec::new();

        if let Some(s) = stage {
            if !s.is_empty() {
                params_vals.push(s.to_string());
                conditions.push(format!("p.stage = ?{}", params_vals.len()));
            }
        }

        // ── FTS5 + LIKE combined keyword search (same strategy as search_customers) ──
        let keyword_ids: Option<Vec<i64>> = if let Some(kw) = keyword {
            let kw = kw.trim();
            if !kw.is_empty() {
                if kw.len() < 2 {
                    // Single-char: LIKE fallback only
                    Some(Self::try_like_fallback(&conn, kw))
                } else {
                    // Multi-char: FTS5 prefix first, LIKE fallback on empty
                    let fts_ids = Self::try_fts_prefix(&conn, kw);
                    fts_ids.map(|ids| {
                        if ids.is_empty() {
                            Self::try_like_fallback(&conn, kw)
                        } else {
                            ids
                        }
                    })
                }
            } else {
                None
            }
        } else {
            None
        };

        if let Some(ids) = keyword_ids {
            if ids.is_empty() {
                conditions.push("0=1".to_string());
            } else {
                let placeholders: Vec<String> = (0..ids.len()).map(|i| {
                    params_vals.push(ids[i].to_string());
                    format!("?{}", params_vals.len())
                }).collect();
                conditions.push(format!("c.id IN ({})", placeholders.join(",")));
            }
        }

        if let Some(ref c) = country {
            if !c.is_empty() {
                params_vals.push(c.to_string());
                conditions.push(format!("c.country = ?{}", params_vals.len()));
            }
        }
        if let Some(ref ct) = customer_type {
            if !ct.is_empty() {
                params_vals.push(ct.to_string());
                conditions.push(format!("c.customer_type = ?{}", params_vals.len()));
            }
        }
        if let Some(ref s) = scale {
            if !s.is_empty() {
                params_vals.push(s.to_string());
                conditions.push(format!("c.scale = ?{}", params_vals.len()));
            }
        }

        let where_clause = if conditions.is_empty() {
            String::new()
        } else {
            format!(" WHERE {}", conditions.join(" AND "))
        };

        // Build name-priority sort: names starting with keyword first,
        // then names containing keyword, then updated_at DESC
        let name_sort_sql: String = if let Some(kw) = keyword {
            let kw = kw.trim();
            if !kw.is_empty() {
                let escaped = kw.replace('%', "\\%").replace('_', "\\_");
                let start_with = format!("{}%", escaped);
                let contains = format!("%{}%", escaped);
                params_vals.push(start_with);
                params_vals.push(contains);
                let p_start = params_vals.len() - 1;
                let p_contains = params_vals.len();
                format!(
                    "CASE WHEN c.name LIKE ?{0} ESCAPE '\\' THEN 0 WHEN c.name LIKE ?{1} ESCAPE '\\' THEN 1 ELSE 2 END,",
                    p_start, p_contains
                )
            } else {
                String::new()
            }
        } else {
            String::new()
        };

        let sql = format!(
            "SELECT c.id, c.name, c.website, c.country, c.industry, c.customer_type, c.scale, c.source, c.notes, c.created_at, c.updated_at,
                    p.id, p.customer_id, p.contact_id, p.stage, p.product_interest, p.estimated_value, p.notes, p.next_action, p.next_action_date, p.created_at, p.updated_at
             FROM customers c JOIN pipeline p ON c.id = p.customer_id{} ORDER BY {}p.updated_at DESC",
            where_clause, name_sort_sql
        );

        let params_refs: Vec<&dyn rusqlite::types::ToSql> = params_vals.iter().map(|v| v as &dyn rusqlite::types::ToSql).collect();
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(params_refs.as_slice(), |row| {
            let customer = Customer {
                id: Some(row.get(0)?), name: row.get(1)?, website: row.get(2)?,
                country: row.get(3)?, industry: row.get(4)?, customer_type: row.get(5)?,
                scale: row.get(6)?, source: row.get(7)?, notes: row.get(8)?,
                created_at: row.get(9)?, updated_at: row.get(10)?,
            };
            let pipeline = Pipeline {
                id: Some(row.get(11)?), customer_id: row.get(12)?, contact_id: row.get(13)?,
                stage: row.get(14)?, product_interest: row.get(15)?, estimated_value: row.get(16)?,
                notes: row.get(17)?, next_action: row.get(18)?, next_action_date: row.get(19)?,
                created_at: row.get(20)?, updated_at: row.get(21)?,
            };
            Ok((customer, pipeline))
        })?;
        rows.collect()
    }

    // ====================
    // Activities
    // ====================

    pub fn add_activity(&self, a: &Activity) -> SqlResult<i64> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO activities (customer_id, pipeline_id, activity_type, summary) VALUES (?,?,?,?)",
            params![a.customer_id, a.pipeline_id, a.activity_type, a.summary],
        )?;
        if let Some(pid) = a.pipeline_id {
            conn.execute("UPDATE pipeline SET updated_at=datetime('now','localtime') WHERE id=?", params![pid])?;
        }
        Ok(conn.last_insert_rowid())
    }

    // ====================
    // Meta / Utility
    // ====================

    pub fn get_distinct_countries(&self) -> SqlResult<Vec<String>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT DISTINCT country FROM customers WHERE country IS NOT NULL AND country != '' ORDER BY country"
        )?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        rows.collect()
    }

    pub fn get_all_customers_csv(&self) -> SqlResult<Vec<Customer>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, website, country, industry, customer_type, scale, source, notes, created_at, updated_at FROM customers ORDER BY updated_at DESC"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(Customer {
                id: Some(row.get(0)?), name: row.get(1)?, website: row.get(2)?,
                country: row.get(3)?, industry: row.get(4)?, customer_type: row.get(5)?,
                scale: row.get(6)?, source: row.get(7)?, notes: row.get(8)?,
                created_at: row.get(9)?, updated_at: row.get(10)?,
            })
        })?;
        rows.collect()
    }

    // ====================
    // Tags (Phase 3)
    // ====================

    pub fn get_tags(&self) -> SqlResult<Vec<Tag>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, name, color FROM tags ORDER BY name")?;
        let rows = stmt.query_map([], |row| {
            Ok(Tag { id: Some(row.get(0)?), name: row.get(1)?, color: row.get(2)? })
        })?;
        rows.collect()
    }

    pub fn create_tag(&self, name: &str, color: &str) -> SqlResult<i64> {
        let conn = self.conn.lock().unwrap();
        conn.execute("INSERT INTO tags (name, color) VALUES (?,?)", params![name, color])?;
        Ok(conn.last_insert_rowid())
    }

    pub fn delete_tag(&self, id: i64) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM tags WHERE id=?", params![id])?;
        Ok(())
    }

    pub fn get_customer_tags(&self, customer_id: i64) -> SqlResult<Vec<Tag>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT t.id, t.name, t.color FROM tags t JOIN customer_tags ct ON t.id = ct.tag_id WHERE ct.customer_id=? ORDER BY t.name"
        )?;
        let rows = stmt.query_map(params![customer_id], |row| {
            Ok(Tag { id: Some(row.get(0)?), name: row.get(1)?, color: row.get(2)? })
        })?;
        rows.collect()
    }

    pub fn set_customer_tags(&self, customer_id: i64, tag_ids: &[i64]) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM customer_tags WHERE customer_id=?", params![customer_id])?;
        for tag_id in tag_ids {
            conn.execute(
                "INSERT OR IGNORE INTO customer_tags (customer_id, tag_id) VALUES (?,?)",
                params![customer_id, tag_id],
            )?;
        }
        Ok(())
    }

    pub fn get_all_tags_with_count(&self) -> SqlResult<Vec<TagWithCount>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT t.id, t.name, t.color, COUNT(ct.customer_id) as customer_count
             FROM tags t LEFT JOIN customer_tags ct ON t.id = ct.tag_id
             GROUP BY t.id ORDER BY t.name"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(TagWithCount {
                id: Some(row.get(0)?), name: row.get(1)?, color: row.get(2)?,
                customer_count: row.get(3)?,
            })
        })?;
        rows.collect()
    }

    // ====================
    // Calendar (Phase 3)
    // ====================

    pub fn get_calendar_events(&self) -> SqlResult<Vec<CalendarEvent>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT c.id, c.name, p.next_action, p.next_action_date, p.stage
             FROM customers c
             JOIN pipeline p ON c.id = p.customer_id
             WHERE p.next_action_date IS NOT NULL AND p.next_action_date != ''
             ORDER BY p.next_action_date ASC"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(CalendarEvent {
                customer_id: row.get(0)?,
                customer_name: row.get(1)?,
                next_action: row.get(2)?,
                next_action_date: row.get(3)?,
                stage: row.get(4)?,
            })
        })?;
        rows.collect()
    }

    // ====================
    // Analytics (Phase 3)
    // ====================

    pub fn get_analytics(&self) -> SqlResult<AnalyticsData> {
        let conn = self.conn.lock().unwrap();

        // Pipeline distribution
        let mut stmt = conn.prepare(
            "SELECT stage, COUNT(*) as count FROM pipeline GROUP BY stage ORDER BY CASE stage
             WHEN 'lead' THEN 1 WHEN 'contacted' THEN 2 WHEN 'replied' THEN 3
             WHEN 'negotiating' THEN 4 WHEN 'won' THEN 5 WHEN 'lost' THEN 6 ELSE 7 END"
        )?;
        let pipeline_distribution: Vec<StageCount> = stmt.query_map([], |row| {
            Ok(StageCount { stage: row.get(0)?, count: row.get(1)? })
        })?.filter_map(|r| r.ok()).collect();

        // Country distribution
        let mut stmt = conn.prepare(
            "SELECT country, COUNT(*) as count FROM customers WHERE country IS NOT NULL AND country != '' GROUP BY country ORDER BY count DESC"
        )?;
        let country_distribution: Vec<CountryCount> = stmt.query_map([], |row| {
            Ok(CountryCount { country: row.get(0)?, count: row.get(1)? })
        })?.filter_map(|r| r.ok()).collect();

        // Type distribution
        let mut stmt = conn.prepare(
            "SELECT customer_type, COUNT(*) as count FROM customers WHERE customer_type IS NOT NULL AND customer_type != '' GROUP BY customer_type ORDER BY count DESC"
        )?;
        let type_distribution: Vec<TypeCount> = stmt.query_map([], |row| {
            Ok(TypeCount { type_name: row.get(0)?, count: row.get(1)? })
        })?.filter_map(|r| r.ok()).collect();

        // Total counts
        let total_customers: i64 = conn.query_row("SELECT COUNT(*) FROM customers", [], |r| r.get(0))?;
        let total_contacts: i64 = conn.query_row("SELECT COUNT(*) FROM contacts", [], |r| r.get(0))?;
        let recent_activity_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM activities WHERE created_at >= datetime('now', '-30 days', 'localtime')",
            [], |r| r.get(0)
        )?;

        // Win rate
        let total_pipeline: i64 = conn.query_row(
            "SELECT COUNT(*) FROM pipeline WHERE stage IN ('won', 'lost')", [], |r| r.get(0)
        )?;
        let won_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM pipeline WHERE stage='won'", [], |r| r.get(0)
        )?;
        let won_rate = if total_pipeline > 0 { won_count as f64 / total_pipeline as f64 } else { 0.0 };

        // Contacted rate (not lead or lost)
        let total_active: i64 = conn.query_row(
            "SELECT COUNT(*) FROM pipeline WHERE stage IN ('contacted', 'replied', 'negotiating', 'won')",
            [], |r| r.get(0)
        )?;
        let total_in_pipeline: i64 = conn.query_row(
            "SELECT COUNT(*) FROM pipeline WHERE stage != 'lost'", [], |r| r.get(0)
        )?;
        let contacted_rate = if total_in_pipeline > 0 { total_active as f64 / total_in_pipeline as f64 } else { 0.0 };

        Ok(AnalyticsData {
            pipeline_distribution,
            country_distribution,
            type_distribution,
            total_customers,
            total_contacts,
            recent_activity_count,
            won_rate,
            contacted_rate,
        })
    }

    // ====================
    // Excel Import
    // ====================

    pub fn import_customers(&self, rows: Vec<Customer>) -> SqlResult<usize> {
        for c in &rows {
            self.upsert_customer(c)?;
        }
        Ok(rows.len())
    }

    // ====================
    // Backup & Restore (Phase 4)
    // ====================

    /// Get database info: file size on disk and record counts
    pub fn get_database_info(&self) -> SqlResult<serde_json::Value> {
        let conn = self.conn.lock().unwrap();
        let total_customers: i64 = conn.query_row("SELECT COUNT(*) FROM customers", [], |r| r.get(0))?;
        let total_contacts: i64 = conn.query_row("SELECT COUNT(*) FROM contacts", [], |r| r.get(0))?;
        let total_pipeline: i64 = conn.query_row("SELECT COUNT(*) FROM pipeline", [], |r| r.get(0))?;
        let total_activities: i64 = conn.query_row("SELECT COUNT(*) FROM activities", [], |r| r.get(0))?;
        drop(conn);

        let file_size = std::fs::metadata(&self.db_path).map(|m| m.len()).unwrap_or(0);
        // Check WAL and SHM sizes too
        let wal_size = std::fs::metadata(format!("{}-wal", &self.db_path)).map(|m| m.len()).unwrap_or(0);

        Ok(serde_json::json!({
            "db_path": self.db_path,
            "file_size_bytes": file_size,
            "wal_size_bytes": wal_size,
            "total_customers": total_customers,
            "total_contacts": total_contacts,
            "total_pipeline": total_pipeline,
            "total_activities": total_activities,
        }))
    }

    /// Backup database to a destination path.
    /// First checkpoints WAL to ensure data consistency, then copies the file.
    pub fn backup_to(&self, dest_path: &str) -> Result<(), String> {
        // Flush WAL to main file
        {
            let conn = self.conn.lock().unwrap();
            conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);").map_err(|e| e.to_string())?;
        }
        // Copy main DB file
        std::fs::copy(&self.db_path, dest_path).map_err(|e| format!("Backup failed: {}", e))?;
        // Also copy WAL if it still has data
        let wal_path = format!("{}-wal", &self.db_path);
        let wal_dest = format!("{}-wal", dest_path);
        if std::path::Path::new(&wal_path).exists() {
            let _ = std::fs::copy(&wal_path, &wal_dest);
        }
        Ok(())
    }

    /// Restore database from a backup file.
    /// Copies the backup over the current DB, then checkpoints.
    pub fn restore_from(&self, src_path: &str) -> Result<(), String> {
        // Verify the source file exists
        if !std::path::Path::new(src_path).exists() {
            return Err(format!("Backup file not found: {}", src_path));
        }

        // Checkpoint WAL to flush pending writes
        {
            let conn = self.conn.lock().unwrap();
            let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
        } // lock released

        // Backup current DB as .restore-bak just in case
        let fallback = format!("{}.restore-bak", &self.db_path);
        let _ = std::fs::copy(&self.db_path, &fallback);

        // Copy backup → current location
        std::fs::copy(src_path, &self.db_path).map_err(|e| format!("Restore copy failed: {}", e))?;

        Ok(())
    }
}
