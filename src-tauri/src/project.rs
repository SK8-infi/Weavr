use std::path::Path;

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct ValidationResult {
    pub is_valid: bool,
    pub missing: Vec<String>,
}

/// Confirms a cloned repo actually follows the IATMSI template contract
/// Weavr depends on (pageRegistry.js + sectionResolver.jsx + a Vite/React
/// package.json) before we try to install/preview/edit it.
pub fn validate(root: &Path) -> ValidationResult {
    let mut missing = Vec::new();

    let required_files = [
        "src/data/pageRegistry.js",
        "src/utils/sectionResolver.jsx",
        "package.json",
    ];
    for rel_path in required_files {
        if !root.join(rel_path).is_file() {
            missing.push(rel_path.to_string());
        }
    }

    if missing.iter().all(|m| m != "package.json") {
        match has_expected_dependencies(&root.join("package.json")) {
            Ok(true) => {}
            Ok(false) => missing.push("package.json (missing react/vite dependencies)".into()),
            Err(_) => missing.push("package.json (unreadable)".into()),
        }
    }

    ValidationResult {
        is_valid: missing.is_empty(),
        missing,
    }
}

fn has_expected_dependencies(package_json_path: &Path) -> std::io::Result<bool> {
    let contents = std::fs::read_to_string(package_json_path)?;
    let parsed: serde_json::Value = serde_json::from_str(&contents)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;

    let has_dep = |section: &str, name: &str| -> bool {
        parsed
            .get(section)
            .and_then(|deps| deps.get(name))
            .is_some()
    };

    let has_react = has_dep("dependencies", "react");
    let has_vite =
        has_dep("dependencies", "vite") || has_dep("devDependencies", "vite");

    Ok(has_react && has_vite)
}
