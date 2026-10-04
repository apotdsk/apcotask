use rusqlite::types::{Value, ValueRef};
use rusqlite::{params_from_iter, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Number, Value as JsonValue};
use std::fmt;
use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex};
use tauri::State;

const DATABASE_FILE_NAME: &str = "apcotask.sqlite3";

struct Migration {
    version: u32,
    sql: &'static str,
}

const MIGRATIONS: &[Migration] = &[Migration {
    version: 1,
    sql: include_str!("../migrations/0001_initial.sql"),
}];

#[derive(Clone)]
pub struct DatabaseState {
    connection: Arc<Mutex<Connection>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseError {
    code: &'static str,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    statement_index: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    expected_rows_affected: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    actual_rows_affected: Option<usize>,
}

impl DatabaseError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            statement_index: None,
            expected_rows_affected: None,
            actual_rows_affected: None,
        }
    }

    fn database(error: impl fmt::Display) -> Self {
        Self::new("DATABASE", error.to_string())
    }

    fn stale_read(index: usize, expected: usize, actual: usize) -> Self {
        Self {
            code: "STALE_READ",
            message: format!("Batch statement {index} affected {actual} rows; expected {expected}"),
            statement_index: Some(index),
            expected_rows_affected: Some(expected),
            actual_rows_affected: Some(actual),
        }
    }
}

impl fmt::Display for DatabaseError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}", self.message)
    }
}

impl std::error::Error for DatabaseError {}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchStatement {
    sql: String,
    #[serde(default)]
    parameters: Vec<JsonValue>,
    expected_rows_affected: Option<usize>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteResult {
    rows_affected: usize,
}

pub fn initialize(app_data_dir: &Path) -> Result<DatabaseState, DatabaseError> {
    fs::create_dir_all(app_data_dir).map_err(DatabaseError::database)?;
    let connection = open_database(&app_data_dir.join(DATABASE_FILE_NAME))?;
    Ok(DatabaseState {
        connection: Arc::new(Mutex::new(connection)),
    })
}

fn open_database(path: &Path) -> Result<Connection, DatabaseError> {
    let mut connection = Connection::open(path).map_err(DatabaseError::database)?;
    configure_connection(&connection)?;
    apply_migrations(&mut connection)?;
    Ok(connection)
}

fn configure_connection(connection: &Connection) -> Result<(), DatabaseError> {
    connection
        .pragma_update(None, "foreign_keys", true)
        .map_err(DatabaseError::database)?;
    let foreign_keys: i64 = connection
        .pragma_query_value(None, "foreign_keys", |row| row.get(0))
        .map_err(DatabaseError::database)?;
    if foreign_keys != 1 {
        return Err(DatabaseError::new(
            "DATABASE",
            "Failed to enable SQLite foreign-key enforcement",
        ));
    }

    let journal_mode: String = connection
        .query_row("PRAGMA journal_mode = WAL", [], |row| row.get(0))
        .map_err(DatabaseError::database)?;
    if !journal_mode.eq_ignore_ascii_case("wal") {
        return Err(DatabaseError::new(
            "DATABASE",
            format!("Failed to enable SQLite WAL mode: SQLite returned {journal_mode}"),
        ));
    }
    Ok(())
}

fn apply_migrations(connection: &mut Connection) -> Result<(), DatabaseError> {
    let current_version: u32 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(DatabaseError::database)?;
    let supported_version = MIGRATIONS.last().map_or(0, |migration| migration.version);
    if current_version > supported_version {
        return Err(DatabaseError::new(
      "DATABASE",
      format!(
        "Database schema version {current_version} is newer than supported version {supported_version}"
      ),
    ));
    }

    for migration in MIGRATIONS
        .iter()
        .filter(|migration| migration.version > current_version)
    {
        let transaction = connection.transaction().map_err(DatabaseError::database)?;
        transaction
            .execute_batch(migration.sql)
            .map_err(DatabaseError::database)?;
        transaction
            .pragma_update(None, "user_version", migration.version)
            .map_err(DatabaseError::database)?;
        transaction.commit().map_err(DatabaseError::database)?;
    }
    Ok(())
}

fn sqlite_parameters(parameters: Vec<JsonValue>) -> Result<Vec<Value>, DatabaseError> {
    parameters
        .into_iter()
        .map(|parameter| match parameter {
            JsonValue::Null => Ok(Value::Null),
            JsonValue::String(value) => Ok(Value::Text(value)),
            JsonValue::Number(value) => {
                if let Some(integer) = value.as_i64() {
                    Ok(Value::Integer(integer))
                } else if value.is_u64() {
                    Err(DatabaseError::new(
                        "INVALID_PARAMETER",
                        "SQL integer parameter is outside SQLite's signed 64-bit range",
                    ))
                } else if let Some(real) = value.as_f64().filter(|real| real.is_finite()) {
                    Ok(Value::Real(real))
                } else {
                    Err(DatabaseError::new(
                        "INVALID_PARAMETER",
                        "SQL numeric parameter must be finite",
                    ))
                }
            }
            _ => Err(DatabaseError::new(
                "INVALID_PARAMETER",
                "SQL parameters support only strings, numbers, and null",
            )),
        })
        .collect()
}

fn json_value(value: ValueRef<'_>) -> Result<JsonValue, DatabaseError> {
    match value {
        ValueRef::Null => Ok(JsonValue::Null),
        ValueRef::Integer(value) => Ok(JsonValue::Number(Number::from(value))),
        ValueRef::Real(value) => Number::from_f64(value)
            .map(JsonValue::Number)
            .ok_or_else(|| {
                DatabaseError::new("INVALID_ROW_VALUE", "SQLite returned a non-finite real")
            }),
        ValueRef::Text(value) => std::str::from_utf8(value)
            .map(|value| JsonValue::String(value.to_owned()))
            .map_err(|error| DatabaseError::new("INVALID_ROW_VALUE", error.to_string())),
        ValueRef::Blob(_) => Err(DatabaseError::new(
            "INVALID_ROW_VALUE",
            "SQLite blob values are not supported by the IPC boundary",
        )),
    }
}

fn select_impl(
    connection: &Connection,
    sql: &str,
    parameters: Vec<JsonValue>,
) -> Result<Vec<JsonValue>, DatabaseError> {
    let parameters = sqlite_parameters(parameters)?;
    let mut statement = connection.prepare(sql).map_err(DatabaseError::database)?;
    let column_names: Vec<String> = statement
        .column_names()
        .iter()
        .map(|name| (*name).to_owned())
        .collect();
    let mut rows = statement
        .query(params_from_iter(parameters.iter()))
        .map_err(DatabaseError::database)?;
    let mut result = Vec::new();
    while let Some(row) = rows.next().map_err(DatabaseError::database)? {
        let mut object = Map::new();
        for (index, name) in column_names.iter().enumerate() {
            let value = row.get_ref(index).map_err(DatabaseError::database)?;
            object.insert(name.clone(), json_value(value)?);
        }
        result.push(JsonValue::Object(object));
    }
    Ok(result)
}

fn execute_impl(
    connection: &Connection,
    sql: &str,
    parameters: Vec<JsonValue>,
) -> Result<ExecuteResult, DatabaseError> {
    let parameters = sqlite_parameters(parameters)?;
    let rows_affected = connection
        .execute(sql, params_from_iter(parameters.iter()))
        .map_err(DatabaseError::database)?;
    Ok(ExecuteResult { rows_affected })
}

fn batch_impl(
    connection: &mut Connection,
    statements: Vec<BatchStatement>,
) -> Result<Vec<ExecuteResult>, DatabaseError> {
    let transaction = connection.transaction().map_err(DatabaseError::database)?;
    let mut results = Vec::with_capacity(statements.len());
    for (index, statement) in statements.into_iter().enumerate() {
        let parameters = sqlite_parameters(statement.parameters)?;
        let rows_affected = transaction
            .execute(&statement.sql, params_from_iter(parameters.iter()))
            .map_err(DatabaseError::database)?;
        if let Some(expected) = statement.expected_rows_affected {
            if rows_affected != expected {
                return Err(DatabaseError::stale_read(index, expected, rows_affected));
            }
        }
        results.push(ExecuteResult { rows_affected });
    }
    transaction.commit().map_err(DatabaseError::database)?;
    Ok(results)
}

#[tauri::command]
pub async fn select(
    state: State<'_, DatabaseState>,
    sql: String,
    parameters: Vec<JsonValue>,
) -> Result<Vec<JsonValue>, DatabaseError> {
    let connection = state.connection.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let connection = connection.lock().map_err(|_| {
            DatabaseError::new("LOCK_POISONED", "Database connection lock is poisoned")
        })?;
        select_impl(&connection, &sql, parameters)
    })
    .await
    .map_err(|error| DatabaseError::new("TASK_JOIN_FAILED", error.to_string()))?
}

#[tauri::command]
pub async fn execute(
    state: State<'_, DatabaseState>,
    sql: String,
    parameters: Vec<JsonValue>,
) -> Result<ExecuteResult, DatabaseError> {
    let connection = state.connection.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let connection = connection.lock().map_err(|_| {
            DatabaseError::new("LOCK_POISONED", "Database connection lock is poisoned")
        })?;
        execute_impl(&connection, &sql, parameters)
    })
    .await
    .map_err(|error| DatabaseError::new("TASK_JOIN_FAILED", error.to_string()))?
}

#[tauri::command]
pub async fn batch(
    state: State<'_, DatabaseState>,
    statements: Vec<BatchStatement>,
) -> Result<Vec<ExecuteResult>, DatabaseError> {
    let connection = state.connection.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut connection = connection.lock().map_err(|_| {
            DatabaseError::new("LOCK_POISONED", "Database connection lock is poisoned")
        })?;
        batch_impl(&mut connection, statements)
    })
    .await
    .map_err(|error| DatabaseError::new("TASK_JOIN_FAILED", error.to_string()))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static NEXT_PATH_ID: AtomicU64 = AtomicU64::new(0);

    struct TemporaryDatabasePath(PathBuf);

    impl TemporaryDatabasePath {
        fn new() -> Self {
            let unique = NEXT_PATH_ID.fetch_add(1, Ordering::Relaxed);
            let timestamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock should be after the Unix epoch")
                .as_nanos();
            Self(std::env::temp_dir().join(format!(
                "apcotask-database-test-{}-{timestamp}-{unique}.sqlite3",
                std::process::id()
            )))
        }
    }

    impl Drop for TemporaryDatabasePath {
        fn drop(&mut self) {
            for path in [
                self.0.clone(),
                PathBuf::from(format!("{}-wal", self.0.display())),
                PathBuf::from(format!("{}-shm", self.0.display())),
            ] {
                let _ = fs::remove_file(path);
            }
        }
    }

    fn migrated_memory_database() -> Connection {
        let mut connection = Connection::open_in_memory().expect("in-memory database should open");
        apply_migrations(&mut connection).expect("migrations should apply");
        connection
    }

    #[test]
    fn fresh_database_applies_migration_and_sets_version() {
        let connection = migrated_memory_database();
        let version: u32 = connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .expect("version should be readable");
        assert_eq!(version, 1);
        let table_count: i64 = connection
      .query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('categories', 'tasks', 'settings')",
        [],
        |row| row.get(0),
      )
      .expect("schema should be readable");
        assert_eq!(table_count, 3);
    }

    #[test]
    fn reopening_current_database_is_idempotent() {
        let mut connection = migrated_memory_database();
        apply_migrations(&mut connection).expect("current database should reopen");
        let table_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'categories'",
                [],
                |row| row.get(0),
            )
            .expect("schema should remain readable");
        assert_eq!(table_count, 1);
    }

    #[test]
    fn newer_database_version_is_rejected() {
        let mut connection = Connection::open_in_memory().expect("in-memory database should open");
        connection
            .pragma_update(None, "user_version", 2)
            .expect("version should be writable");
        let error = apply_migrations(&mut connection).expect_err("newer version should fail");
        assert!(error.message.contains("newer than supported"));
    }

    #[test]
    fn file_database_enables_foreign_keys() {
        let path = TemporaryDatabasePath::new();
        let connection = open_database(&path.0).expect("file database should open");
        let enabled: i64 = connection
            .pragma_query_value(None, "foreign_keys", |row| row.get(0))
            .expect("foreign_keys should be readable");
        assert_eq!(enabled, 1);
    }

    #[test]
    fn file_database_enables_wal() {
        let path = TemporaryDatabasePath::new();
        let connection = open_database(&path.0).expect("file database should open");
        let mode: String = connection
            .pragma_query_value(None, "journal_mode", |row| row.get(0))
            .expect("journal_mode should be readable");
        assert!(mode.eq_ignore_ascii_case("wal"));
    }

    #[test]
    fn parameter_conversion_supports_ipc_scalar_values() {
        let values = sqlite_parameters(vec![json!("text"), json!(7), json!(1.5), JsonValue::Null])
            .expect("supported parameters should convert");
        assert_eq!(
            values,
            vec![
                Value::Text("text".into()),
                Value::Integer(7),
                Value::Real(1.5),
                Value::Null
            ]
        );
    }

    #[test]
    fn parameter_conversion_rejects_objects() {
        let error = sqlite_parameters(vec![json!({ "unsupported": true })])
            .expect_err("object parameter should fail");
        assert_eq!(error.code, "INVALID_PARAMETER");
    }

    #[test]
    fn parameter_conversion_rejects_integers_outside_sqlite_range() {
        let error =
            sqlite_parameters(vec![json!(u64::MAX)]).expect_err("out-of-range integer should fail");
        assert_eq!(error.code, "INVALID_PARAMETER");
    }

    #[test]
    fn row_conversion_supports_sqlite_scalar_values() {
        assert_eq!(json_value(ValueRef::Null).unwrap(), JsonValue::Null);
        assert_eq!(json_value(ValueRef::Integer(3)).unwrap(), json!(3));
        assert_eq!(json_value(ValueRef::Real(2.5)).unwrap(), json!(2.5));
        assert_eq!(json_value(ValueRef::Text(b"text")).unwrap(), json!("text"));
    }

    #[test]
    fn row_conversion_rejects_blobs() {
        let error = json_value(ValueRef::Blob(b"blob")).expect_err("blob should fail");
        assert_eq!(error.code, "INVALID_ROW_VALUE");
    }

    #[test]
    fn select_returns_objects_keyed_by_column_name() {
        let connection = Connection::open_in_memory().expect("database should open");
        let rows = select_impl(
            &connection,
            "SELECT ? AS name, ? AS position",
            vec![json!("A"), json!(0)],
        )
        .expect("select should succeed");
        assert_eq!(rows, vec![json!({ "name": "A", "position": 0 })]);
    }

    #[test]
    fn execute_reports_affected_rows() {
        let connection = migrated_memory_database();
        let result = execute_impl(
            &connection,
            "INSERT INTO categories (id, name, position) VALUES (?, ?, ?)",
            vec![json!("category"), json!("Category"), json!(0)],
        )
        .expect("insert should succeed");
        assert_eq!(result, ExecuteResult { rows_affected: 1 });
    }

    #[test]
    fn successful_batch_commits_every_statement() {
        let mut connection = migrated_memory_database();
        batch_impl(
            &mut connection,
            vec![
                BatchStatement {
                    sql: "INSERT INTO categories (id, name, position) VALUES ('a', 'A', 0)".into(),
                    parameters: vec![],
                    expected_rows_affected: Some(1),
                },
                BatchStatement {
                    sql: "INSERT INTO categories (id, name, position) VALUES ('b', 'B', 1)".into(),
                    parameters: vec![],
                    expected_rows_affected: Some(1),
                },
            ],
        )
        .expect("batch should commit");
        let count: i64 = connection
            .query_row("SELECT COUNT(*) FROM categories", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 2);
    }

    #[test]
    fn sql_failure_rolls_back_complete_batch() {
        let mut connection = migrated_memory_database();
        let result = batch_impl(
            &mut connection,
            vec![
                BatchStatement {
                    sql: "INSERT INTO categories (id, name, position) VALUES ('a', 'A', 0)".into(),
                    parameters: vec![],
                    expected_rows_affected: Some(1),
                },
                BatchStatement {
                    sql: "INSERT INTO missing_table VALUES (1)".into(),
                    parameters: vec![],
                    expected_rows_affected: None,
                },
            ],
        );
        assert!(result.is_err());
        let count: i64 = connection
            .query_row("SELECT COUNT(*) FROM categories", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn affected_row_mismatch_returns_stale_read_metadata() {
        let mut connection = migrated_memory_database();
        let error = batch_impl(
            &mut connection,
            vec![BatchStatement {
                sql: "UPDATE categories SET name = name".into(),
                parameters: vec![],
                expected_rows_affected: Some(1),
            }],
        )
        .expect_err("mismatch should fail");
        assert_eq!(error.code, "STALE_READ");
        assert_eq!(error.statement_index, Some(0));
        assert_eq!(error.expected_rows_affected, Some(1));
        assert_eq!(error.actual_rows_affected, Some(0));
    }

    #[test]
    fn affected_row_mismatch_rolls_back_prior_statements() {
        let mut connection = migrated_memory_database();
        let result = batch_impl(
            &mut connection,
            vec![
                BatchStatement {
                    sql: "INSERT INTO categories (id, name, position) VALUES ('a', 'A', 0)".into(),
                    parameters: vec![],
                    expected_rows_affected: Some(1),
                },
                BatchStatement {
                    sql: "UPDATE categories SET name = name WHERE id = 'missing'".into(),
                    parameters: vec![],
                    expected_rows_affected: Some(1),
                },
            ],
        );
        assert!(result.is_err());
        let count: i64 = connection
            .query_row("SELECT COUNT(*) FROM categories", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }
}
