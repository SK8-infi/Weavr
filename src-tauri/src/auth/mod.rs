pub mod device_flow;
pub mod keychain;

/// Public app identity, not a secret — safe to embed in the distributed binary.
/// Device Flow needs no client secret; each user authorizes their own GitHub
/// account against this shared Client ID, the same way any "Login with GitHub"
/// button works across many different end users.
pub const GITHUB_CLIENT_ID: &str = "Ov23liSsy84i0el3ZXOq";
pub const GITHUB_SCOPE: &str = "repo";
