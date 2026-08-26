# Development Guide

## Setup

```powershell
pnpm install --frozen-lockfile
```

## Run

UI-only development:

```powershell
pnpm run dev
```

Desktop development with native integration:

```powershell
pnpm run tauri dev
```

## Verify

```powershell
pnpm run verify
```

This performs the Vue/TypeScript production build and Rust unit tests. Live FileMaker Clipboard tests remain ignored by default because they read or overwrite the Windows Clipboard.

## Release readiness

Before a formal release, also verify FileMaker Clipboard read/write behavior, SQLite migrations, workspace backup and restore, Free/Pro feature gates, CSP restrictions, code signing, installer signing, and versioned release storage.
