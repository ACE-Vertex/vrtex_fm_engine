# Tests

Rust unit tests are colocated with native modules under `src-tauri/src`. The standard verification command is `pnpm run verify`.

Place future cross-layer integration and end-to-end tests in this directory. Tests that access or overwrite a live FileMaker Clipboard must remain opt-in and clearly identify their side effects.
