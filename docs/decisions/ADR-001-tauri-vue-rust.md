# ADR-001: Use Tauri, Vue, and Rust

- Status: Accepted
- Date: 2026-08-26

## Context

The product needs a rich XML editing interface and direct access to Windows FileMaker Clipboard formats, SQLite, protected credentials, and filesystem operations.

## Decision

Use Vue 3 and TypeScript for the user interface, and Tauri 2 with Rust for native and security-sensitive operations.

## Consequences

- Browser development mode can verify UI behavior but cannot replace native integration tests.
- OS-native behavior must remain behind Tauri command and service boundaries.
- Windows is the primary supported platform until macOS integration is implemented and tested.
