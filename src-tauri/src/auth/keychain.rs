use keyring::Entry;

use crate::error::{AppError, AppResult};

const SERVICE: &str = "com.weavr.app";
const ACCOUNT: &str = "github-token";

fn entry() -> AppResult<Entry> {
    Ok(Entry::new(SERVICE, ACCOUNT)?)
}

pub fn store_token(token: &str) -> AppResult<()> {
    entry()?.set_password(token)?;
    Ok(())
}

pub fn load_token() -> AppResult<Option<String>> {
    match entry()?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(AppError::Keychain(err)),
    }
}

pub fn delete_token() -> AppResult<()> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(err) => Err(AppError::Keychain(err)),
    }
}
