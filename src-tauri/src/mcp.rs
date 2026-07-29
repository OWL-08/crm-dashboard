use crate::db::{Activity, Contact, Customer, Database, Pipeline, SearchFilters};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
use tiny_http::{Header, Response, Server};

#[derive(Deserialize)]
struct McpRequest {
    #[serde(default)]
    id: Option<Value>,
    method: String,
    params: Option<Value>,
}

#[derive(Serialize)]
struct McpResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    id: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<Value>,
}

pub fn start_mcp_server(db: Arc<Database>, port: u16) {
    std::thread::spawn(move || {
        let addr = format!("0.0.0.0:{}", port);
        let server = match Server::http(&addr) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("MCP server failed to start on {}: {}", addr, e);
                return;
            }
        };
        println!("MCP server listening on http://{}", addr);

        for mut request in server.incoming_requests() {
            let body = {
                let mut buf = String::new();
                if request.as_reader().read_to_string(&mut buf).is_err() {
                    continue;
                }
                buf
            };

            let response_json = handle_mcp_request(&body, &db);

            let header = Header::from_bytes("Content-Type", "application/json; charset=utf-8").unwrap();
            let resp = Response::from_string(response_json).with_header(header);
            let _ = request.respond(resp);
        }
    });
}

fn handle_mcp_request(body: &str, db: &Database) -> String {
    let req: McpRequest = match serde_json::from_str(body) {
        Ok(r) => r,
        Err(e) => {
            return serde_json::to_string(&McpResponse {
                id: None, result: None,
                error: Some(json!({"code": -32700, "message": format!("Parse error: {}", e)})),
            }).unwrap();
        }
    };

    let result = match req.method.as_str() {
        "initialize" => Ok(json!({
            "protocolVersion": "2024-11-05",
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "crm-dashboard", "version": "0.1.0"}
        })),
        "tools/list" => Ok(json!({"tools": get_tool_definitions()})),
        "tools/call" => {
            if let Some(params) = req.params {
                let name = params.get("name").and_then(|v| v.as_str()).unwrap_or("");
                let args = params.get("arguments").cloned().unwrap_or(json!({}));
                call_tool(name, &args, db)
            } else {
                Err(json!({"code": -32602, "message": "Missing params"}))
            }
        }
        "notifications/initialized" => Ok(json!({})),
        _ => Err(json!({"code": -32601, "message": format!("Method not found: {}", req.method)})),
    };

    let resp = match result {
        Ok(r) => McpResponse { id: req.id, result: Some(r), error: None },
        Err(e) => McpResponse { id: req.id, result: None, error: Some(e) },
    };

    serde_json::to_string(&resp).unwrap()
}

fn get_tool_definitions() -> Value {
    json!([
        {
            "name": "search_customers",
            "description": "Search customers with keyword (name/website/notes), country, stage, type, scale. Returns paginated results with total count.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "keyword": {"type": "string", "description": "Fuzzy search across name, website, and notes"},
                    "country": {"type": "string", "description": "Filter by country (fuzzy match)"},
                    "stage": {"type": "string", "description": "Filter by pipeline stage (lead/contacted/replied/negotiating/won/lost)"},
                    "customer_type": {"type": "string", "description": "Filter by customer type (reseller/distributor/SI/MSP etc.)"},
                    "scale": {"type": "string", "description": "Filter by company size (51-200/201-500/11-50/2-10/501-1000)"},
                    "limit": {"type": "number", "description": "Max results per page"},
                    "offset": {"type": "number", "description": "Offset for pagination"}
                }
            }
        },
        {
            "name": "get_customer",
            "description": "Get full customer detail including contacts, pipeline status, tags, and activity history",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "customer_id": {"type": "integer", "description": "Customer ID"}
                },
                "required": ["customer_id"]
            }
        },
        {
            "name": "upsert_customer",
            "description": "Create or update a customer record",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": {"type": "integer", "description": "Customer ID (omit to create new)"},
                    "name": {"type": "string", "description": "Company name"},
                    "website": {"type": "string", "description": "Company website"},
                    "country": {"type": "string", "description": "Country"},
                    "industry": {"type": "string", "description": "Industry"},
                    "customer_type": {"type": "string", "description": "Customer type"},
                    "scale": {"type": "string", "description": "Company scale"},
                    "source": {"type": "string", "description": "Lead source"},
                    "notes": {"type": "string", "description": "Notes"}
                },
                "required": ["name"]
            }
        },
        {
            "name": "add_contact",
            "description": "Add a contact person to a customer",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "customer_id": {"type": "integer", "description": "Customer ID"},
                    "name": {"type": "string", "description": "Contact name"},
                    "title": {"type": "string", "description": "Job title"},
                    "email": {"type": "string", "description": "Email address"},
                    "phone": {"type": "string", "description": "Phone number"},
                    "role_category": {"type": "string", "description": "Role category (技术/商务/管理层)"},
                    "notes": {"type": "string", "description": "Notes"}
                },
                "required": ["customer_id", "name"]
            }
        },
        {
            "name": "update_pipeline",
            "description": "Update pipeline stage for a customer",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "customer_id": {"type": "integer", "description": "Customer ID"},
                    "stage": {"type": "string", "description": "Pipeline stage (lead/contacted/replied/negotiating/won/lost)"},
                    "product_interest": {"type": "string", "description": "Product of interest"},
                    "estimated_value": {"type": "number", "description": "Estimated deal value"},
                    "notes": {"type": "string", "description": "Pipeline notes"},
                    "next_action": {"type": "string", "description": "Next action description"},
                    "next_action_date": {"type": "string", "description": "Next action date (YYYY-MM-DD)"}
                },
                "required": ["customer_id", "stage"]
            }
        },
        {
            "name": "get_pipeline",
            "description": "Get pipeline kanban view, optionally filtered by stage, keyword, country, customer type, or scale",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "stage": {"type": "string", "description": "Filter by stage (lead/contacted/replied/negotiating/won/lost)"},
                    "keyword": {"type": "string", "description": "Search keyword matching customer name, website, or notes"},
                    "country": {"type": "string", "description": "Filter by country"},
                    "customer_type": {"type": "string", "description": "Filter by customer type (reseller/distributor/SI/MSP)"},
                    "scale": {"type": "string", "description": "Filter by company scale (e.g. 2-10, 11-50, 51-200, 201-500, 501-1000)"}
                }
            }
        },
        {
            "name": "log_activity",
            "description": "Log an activity for a customer",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "customer_id": {"type": "integer", "description": "Customer ID"},
                    "activity_type": {"type": "string", "description": "Activity type (email_sent/email_received/call/meeting/note)"},
                    "summary": {"type": "string", "description": "Activity summary"}
                },
                "required": ["customer_id", "activity_type", "summary"]
            }
        },
        {
            "name": "delete_customer",
            "description": "Delete a customer and all associated contacts, pipeline, and activities",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "customer_id": {"type": "integer", "description": "Customer ID"}
                },
                "required": ["customer_id"]
            }
        },
        // --- Tags ---
        {
            "name": "get_tags",
            "description": "Get all tags",
            "inputSchema": {"type": "object", "properties": {}}
        },
        {
            "name": "create_tag",
            "description": "Create a new tag",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Tag name"},
                    "color": {"type": "string", "description": "Hex color (e.g. #3b82f6)"}
                },
                "required": ["name", "color"]
            }
        },
        {
            "name": "delete_tag",
            "description": "Delete a tag and remove from all customers",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "tag_id": {"type": "integer", "description": "Tag ID"}
                },
                "required": ["tag_id"]
            }
        },
        {
            "name": "get_customer_tags",
            "description": "Get all tags for a customer",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "customer_id": {"type": "integer", "description": "Customer ID"}
                },
                "required": ["customer_id"]
            }
        },
        {
            "name": "set_customer_tags",
            "description": "Set tags for a customer (replaces existing)",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "customer_id": {"type": "integer", "description": "Customer ID"},
                    "tag_ids": {"type": "array", "items": {"type": "integer"}, "description": "Array of tag IDs"}
                },
                "required": ["customer_id", "tag_ids"]
            }
        },
        // --- Calendar ---
        {
            "name": "get_calendar_events",
            "description": "Get upcoming follow-up events sorted by due date",
            "inputSchema": {"type": "object", "properties": {}}
        },
        // --- Analytics ---
        {
            "name": "get_analytics",
            "description": "Get pipeline and customer analytics data",
            "inputSchema": {"type": "object", "properties": {}}
        },
        {
            "name": "get_distinct_countries",
            "description": "Get list of all countries in the database",
            "inputSchema": {"type": "object", "properties": {}}
        },
        {
            "name": "export_customers_csv",
            "description": "Export all customers as CSV data",
            "inputSchema": {"type": "object", "properties": {}}
        },
        // --- Batch operations (Phase 4) ---
        {
            "name": "batch_import_customers",
            "description": "Batch import multiple customers at once. Accepts array of customer objects. Creates new or updates existing by ID.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "customers": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": {"type": "integer"},
                                "name": {"type": "string"},
                                "website": {"type": "string"},
                                "country": {"type": "string"},
                                "industry": {"type": "string"},
                                "customer_type": {"type": "string"},
                                "scale": {"type": "string"},
                                "source": {"type": "string"},
                                "notes": {"type": "string"}
                            },
                            "required": ["name"]
                        }
                    }
                },
                "required": ["customers"]
            }
        },
        {
            "name": "batch_update_pipeline",
            "description": "Batch update pipeline stages for multiple customers at once",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "updates": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "customer_id": {"type": "integer"},
                                "stage": {"type": "string", "description": "lead/contacted/replied/negotiating/won/lost"},
                                "estimated_value": {"type": "number"},
                                "next_action": {"type": "string"},
                                "next_action_date": {"type": "string"}
                            },
                            "required": ["customer_id", "stage"]
                        }
                    }
                },
                "required": ["updates"]
            }
        },
        {
            "name": "batch_delete_customers",
            "description": "Delete multiple customers by ID array. Irreversible.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "ids": {
                        "type": "array",
                        "items": {"type": "integer"}
                    }
                },
                "required": ["ids"]
            }
        }
    ])
}

fn call_tool(name: &str, args: &Value, db: &Database) -> Result<Value, Value> {
    match name {
        "search_customers" => {
            let filters = SearchFilters {
                keyword: args.get("keyword").and_then(|v| v.as_str()).map(String::from),
                country: args.get("country").and_then(|v| v.as_str()).map(String::from),
                stage: args.get("stage").and_then(|v| v.as_str()).map(String::from),
                customer_type: args.get("customer_type").and_then(|v| v.as_str()).map(String::from),
                scale: args.get("scale").and_then(|v| v.as_str()).map(String::from),
                limit: args.get("limit").and_then(|v| v.as_i64()),
                offset: args.get("offset").and_then(|v| v.as_i64()),
            };
            db.search_customers(&filters)
                .map(|r| json!(r))
                .map_err(|e| json!({"code": -32000, "message": e.to_string()}))
        }
        "get_customer" => {
            let id = args.get("customer_id").and_then(|v| v.as_i64())
                .ok_or_else(|| json!({"code": -32602, "message": "customer_id required"}))?;
            db.get_customer_detail(id)
                .map(|d| json!(d))
                .map_err(|e| json!({"code": -32000, "message": e.to_string()}))
        }
        "upsert_customer" => {
            let c = serde_json::from_value::<Customer>(args.clone())
                .map_err(|e| json!({"code": -32602, "message": e.to_string()}))?;
            db.upsert_customer(&c)
                .map(|id| json!({"id": id}))
                .map_err(|e| json!({"code": -32000, "message": e.to_string()}))
        }
        "add_contact" => {
            let c = serde_json::from_value::<Contact>(args.clone())
                .map_err(|e| json!({"code": -32602, "message": e.to_string()}))?;
            db.add_contact(&c)
                .map(|id| json!({"id": id}))
                .map_err(|e| json!({"code": -32000, "message": e.to_string()}))
        }
        "update_pipeline" => {
            let customer_id = args.get("customer_id").and_then(|v| v.as_i64())
                .ok_or_else(|| json!({"code": -32602, "message": "customer_id required"}))?;
            let stage = args.get("stage").and_then(|v| v.as_str()).unwrap_or("lead");
            let p = Pipeline {
                id: None, customer_id,
                contact_id: args.get("contact_id").and_then(|v| v.as_i64()),
                stage: stage.to_string(),
                product_interest: args.get("product_interest").and_then(|v| v.as_str()).map(String::from),
                estimated_value: args.get("estimated_value").and_then(|v| v.as_f64()),
                notes: args.get("notes").and_then(|v| v.as_str()).map(String::from),
                next_action: args.get("next_action").and_then(|v| v.as_str()).map(String::from),
                next_action_date: args.get("next_action_date").and_then(|v| v.as_str()).map(String::from),
                created_at: None, updated_at: None,
            };
            let pid = db.upsert_pipeline(&p)
                .map_err(|e| json!({"code": -32000, "message": e.to_string()}))?;

            if let Some(note) = args.get("activity_note").and_then(|v| v.as_str()) {
                let _ = db.add_activity(&Activity {
                    id: None, customer_id, pipeline_id: Some(pid),
                    activity_type: "stage_change".to_string(),
                    summary: format!("Stage → {}: {}", stage, note),
                    created_at: None,
                });
            }
            Ok(json!({"id": pid, "stage": stage}))
        }
        "get_pipeline" => {
            let stage = args.get("stage").and_then(|v| v.as_str());
            let keyword = args.get("keyword").and_then(|v| v.as_str());
            let country = args.get("country").and_then(|v| v.as_str());
            let customer_type = args.get("customer_type").and_then(|v| v.as_str());
            let scale = args.get("scale").and_then(|v| v.as_str());
            db.get_pipeline(stage, keyword, country, customer_type, scale)
                .map(|items| {
                    let customers: Vec<Value> = items.into_iter().map(|(c, p)| {
                        let contacts = db.get_customer_contacts(c.id.unwrap_or(0)).unwrap_or_default();
                        json!({"customer": c, "pipeline": p, "contacts": contacts})
                    }).collect();
                    json!({"items": customers})
                })
                .map_err(|e| json!({"code": -32000, "message": e.to_string()}))
        }
        "log_activity" => {
            let customer_id = args.get("customer_id").and_then(|v| v.as_i64())
                .ok_or_else(|| json!({"code": -32602, "message": "customer_id required"}))?;
            let a = Activity {
                id: None, customer_id,
                pipeline_id: args.get("pipeline_id").and_then(|v| v.as_i64()),
                activity_type: args.get("activity_type").and_then(|v| v.as_str()).unwrap_or("note").to_string(),
                summary: args.get("summary").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                created_at: None,
            };
            db.add_activity(&a)
                .map(|id| json!({"id": id}))
                .map_err(|e| json!({"code": -32000, "message": e.to_string()}))
        }
        "delete_customer" => {
            let id = args.get("customer_id").and_then(|v| v.as_i64())
                .ok_or_else(|| json!({"code": -32602, "message": "customer_id required"}))?;
            db.delete_customer(id)
                .map(|_| json!({"deleted": true}))
                .map_err(|e| json!({"code": -32000, "message": e.to_string()}))
        }
        // --- Tags ---
        "get_tags" => {
            db.get_tags()
                .map(|tags| json!({"tags": tags}))
                .map_err(|e| json!({"code": -32000, "message": e.to_string()}))
        }
        "create_tag" => {
            let name = args.get("name").and_then(|v| v.as_str())
                .ok_or_else(|| json!({"code": -32602, "message": "name required"}))?;
            let color = args.get("color").and_then(|v| v.as_str()).unwrap_or("#3b82f6");
            db.create_tag(name, color)
                .map(|id| json!({"id": id}))
                .map_err(|e| json!({"code": -32000, "message": e.to_string()}))
        }
        "delete_tag" => {
            let id = args.get("tag_id").and_then(|v| v.as_i64())
                .ok_or_else(|| json!({"code": -32602, "message": "tag_id required"}))?;
            db.delete_tag(id)
                .map(|_| json!({"deleted": true}))
                .map_err(|e| json!({"code": -32000, "message": e.to_string()}))
        }
        "get_customer_tags" => {
            let id = args.get("customer_id").and_then(|v| v.as_i64())
                .ok_or_else(|| json!({"code": -32602, "message": "customer_id required"}))?;
            db.get_customer_tags(id)
                .map(|tags| json!({"tags": tags}))
                .map_err(|e| json!({"code": -32000, "message": e.to_string()}))
        }
        "set_customer_tags" => {
            let customer_id = args.get("customer_id").and_then(|v| v.as_i64())
                .ok_or_else(|| json!({"code": -32602, "message": "customer_id required"}))?;
            let tag_ids: Vec<i64> = args.get("tag_ids")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter_map(|v| v.as_i64()).collect())
                .unwrap_or_default();
            db.set_customer_tags(customer_id, &tag_ids)
                .map(|_| json!({"success": true}))
                .map_err(|e| json!({"code": -32000, "message": e.to_string()}))
        }
        // --- Calendar ---
        "get_calendar_events" => {
            db.get_calendar_events()
                .map(|events| json!({"events": events}))
                .map_err(|e| json!({"code": -32000, "message": e.to_string()}))
        }
        // --- Analytics ---
        "get_analytics" => {
            db.get_analytics()
                .map(|data| json!(data))
                .map_err(|e| json!({"code": -32000, "message": e.to_string()}))
        }
        "get_distinct_countries" => {
            db.get_distinct_countries()
                .map(|countries| json!({"countries": countries}))
                .map_err(|e| json!({"code": -32000, "message": e.to_string()}))
        }
        "export_customers_csv" => {
            db.get_all_customers_csv()
                .map(|customers| {
                    let mut csv = String::from("id,name,website,country,industry,customer_type,scale,source,notes\n");
                    for c in &customers {
                        csv.push_str(&format!("{},{},{},{},{},{},{},{},{}\n",
                            c.id.unwrap_or(0),
                            escape_csv_mcp(&c.name),
                            escape_csv_mcp(&c.website.as_deref().unwrap_or("")),
                            escape_csv_mcp(&c.country.as_deref().unwrap_or("")),
                            escape_csv_mcp(&c.industry.as_deref().unwrap_or("")),
                            escape_csv_mcp(&c.customer_type.as_deref().unwrap_or("")),
                            escape_csv_mcp(&c.scale.as_deref().unwrap_or("")),
                            escape_csv_mcp(&c.source.as_deref().unwrap_or("")),
                            escape_csv_mcp(&c.notes.as_deref().unwrap_or("")),
                        ));
                    }
                    json!({"csv": csv, "count": customers.len()})
                })
                .map_err(|e| json!({"code": -32000, "message": e.to_string()}))
        }
        // --- Batch operations (Phase 4) ---
        "batch_import_customers" => {
            let customers: Vec<Customer> = serde_json::from_value(
                args.get("customers").cloned().ok_or_else(|| json!({"code": -32602, "message": "customers array required"}))?
            ).map_err(|e| json!({"code": -32602, "message": format!("Invalid customer data: {}", e)}))?;
            if customers.is_empty() {
                return Err(json!({"code": -32602, "message": "Empty customers array"}));
            }
            let mut imported = 0i64;
            let mut errors = Vec::new();
            for (i, c) in customers.iter().enumerate() {
                match db.upsert_customer(c) {
                    Ok(_) => imported += 1,
                    Err(e) => errors.push(json!({"index": i, "name": &c.name, "error": e.to_string()})),
                }
            }
            Ok(json!({"imported": imported, "errors": errors}))
        }
        "batch_update_pipeline" => {
            let updates: Vec<Value> = args.get("updates")
                .and_then(|v| v.as_array().cloned())
                .ok_or_else(|| json!({"code": -32602, "message": "updates array required"}))?;
            if updates.is_empty() {
                return Err(json!({"code": -32602, "message": "Empty updates array"}));
            }
            let mut updated = 0i64;
            let mut errors = Vec::new();
            for (i, u) in updates.iter().enumerate() {
                let customer_id = u.get("customer_id").and_then(|v| v.as_i64());
                let stage = u.get("stage").and_then(|v| v.as_str()).unwrap_or("lead");
                if let Some(cid) = customer_id {
                    let p = Pipeline {
                        id: None, customer_id: cid, contact_id: None,
                        stage: stage.to_string(),
                        product_interest: u.get("product_interest").and_then(|v| v.as_str()).map(String::from),
                        estimated_value: u.get("estimated_value").and_then(|v| v.as_f64()),
                        notes: None,
                        next_action: u.get("next_action").and_then(|v| v.as_str()).map(String::from),
                        next_action_date: u.get("next_action_date").and_then(|v| v.as_str()).map(String::from),
                        created_at: None, updated_at: None,
                    };
                    match db.upsert_pipeline(&p) {
                        Ok(_) => updated += 1,
                        Err(e) => errors.push(json!({"index": i, "customer_id": cid, "error": e.to_string()})),
                    }
                } else {
                    errors.push(json!({"index": i, "error": "customer_id required"}));
                }
            }
            Ok(json!({"updated": updated, "errors": errors}))
        }
        "batch_delete_customers" => {
            let ids: Vec<i64> = args.get("ids")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter_map(|v| v.as_i64()).collect())
                .ok_or_else(|| json!({"code": -32602, "message": "ids array required"}))?;
            if ids.is_empty() {
                return Err(json!({"code": -32602, "message": "Empty ids array"}));
            }
            let mut deleted = 0i64;
            let mut errors = Vec::new();
            for id in &ids {
                match db.delete_customer(*id) {
                    Ok(_) => deleted += 1,
                    Err(e) => errors.push(json!({"id": id, "error": e.to_string()})),
                }
            }
            Ok(json!({"deleted": deleted, "errors": errors}))
        }
        _ => Err(json!({"code": -32601, "message": format!("Tool not found: {}", name)})),
    }
}

fn escape_csv_mcp(s: &str) -> String {
    if s.contains(',') || s.contains('"') || s.contains('\n') {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}
