from __future__ import annotations

import pathlib
import subprocess
import sys

ROOT = pathlib.Path.cwd()
path = ROOT / "src-tauri/src/database/migrations.rs"
text = path.read_text(encoding="utf-8")

required = [
    "connection.unchecked_transaction()?",
    "transaction.execute_batch(sql)?",
    "transaction.commit()",
    "failed_migration_rolls_back_schema_and_version_marker",
    "applies_all_migrations_once_and_is_idempotent",
]
for token in required:
    if token not in text:
        print(f"VERIFY_STATIC_FAIL missing={token}")
        sys.exit(21)

# Reject the old dangerous ordering pattern where migration SQL is applied
# outside a transaction and only afterwards recorded in schema_migrations.
old_pattern = 'connection.execute_batch(sql)?;'
if old_pattern in text:
    print("VERIFY_STATIC_FAIL old_non_transactional_apply_present")
    sys.exit(22)

print("VERIFY_STATIC_PASS atomic migration contract")

cmd = [
    "cargo", "test",
    "--manifest-path", "src-tauri/Cargo.toml",
    "database::migrations::tests",
    "--", "--nocapture",
]
print("VERIFY_RUN", " ".join(cmd))
result = subprocess.run(cmd, cwd=ROOT)
if result.returncode != 0:
    print("VERIFY_RUST_MIGRATION_FAIL")
    sys.exit(31)

print("VERIFY_PASS vertex-fm-engine-production-db-migration-safety-000002")
