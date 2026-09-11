from __future__ import annotations
import pathlib
import subprocess
import sys

ROOT = pathlib.Path.cwd()
path = ROOT / "src-tauri/src/xml/validator.rs"
text = path.read_text(encoding="utf-8")

required = [
    '"FORMAT_MISMATCH"',
    'ValidationLevel::Error',
    'detected_format_mismatch_is_fail_closed',
    'unknown_future_format_remains_round_trip_compatible',
]
for token in required:
    if token not in text:
        print(f"VERIFY_STATIC_FAIL missing={token}")
        sys.exit(21)

print("VERIFY_STATIC_PASS validator fail-closed contract")

cmd = [
    "cargo", "test",
    "--manifest-path", "src-tauri/Cargo.toml",
    "xml::validator::tests",
    "--", "--nocapture",
]
print("VERIFY_RUN", " ".join(cmd))
result = subprocess.run(cmd, cwd=ROOT)
if result.returncode != 0:
    # 31 deliberately identifies the Rust compile/test gate for this isolated H1.
    print("VERIFY_RUST_VALIDATOR_FAIL")
    sys.exit(31)

print("VERIFY_PASS vertex-fm-engine-production-core-safety-000001H1")
