use diesel::prelude::*;
use diesel_migrations::{EmbeddedMigrations, MigrationHarness, embed_migrations};
use diesel::connection::SimpleConnection;
use std::path::Path;

pub const MIGRATIONS:EmbeddedMigrations = embed_migrations!("migrations");

pub fn establish_connection(database_path: &Path) -> Result<SqliteConnection ,Box<dyn std::error::Error + Send +Sync>> {

        let database_url = database_path.to_str().ok_or("Database url not found")?;

        let mut connection = SqliteConnection::establish(database_url)?;

        configure_connection(&mut connection)?;

        connection.run_pending_migrations(MIGRATIONS)?;

        Ok(connection)
        
}

pub fn configure_connection(connection : &mut SqliteConnection)->QueryResult<()>{

    connection.batch_execute(
        "
        PRAGMA foreign_keys = ON;
        PRAGMA busy_timeout = 5000;
        ",
    )
}

pub fn establish_connection_test()->Result<SqliteConnection, Box<dyn std::error::Error + Send + Sync>> {

    let mut connection = SqliteConnection::establish(":memory:")?;
    configure_connection(&mut connection)?;
    connection.run_pending_migrations(MIGRATIONS)?;
    Ok(connection)

}
