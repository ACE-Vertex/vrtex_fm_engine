# Repository Instructions

## Scope

This repository contains only the user-distributed Vertex FM Engine desktop product.

- Repository: `ACE-FRDS/vrtex_fm_engine`
- Community API: separate repository `ACE-FRDS/vrtex_fm_engine_community_api`
- Build and release artifacts: outside this repository
- Signing keys, certificates, credentials, and license-issuer secrets: outside this repository

## Before implementation

1. Inspect `git status`, the current branch, and configured remotes.
2. Search existing components, stores, services, domain models, validation, persistence, and error handling before adding code.
3. Preserve the Vue/TypeScript and Rust/Tauri responsibility boundary.
4. Keep Clipboard, filesystem, credential storage, SQLite, and other native operations in Rust where practical.

## Verification

Run `pnpm run verify` for normal source changes. FileMaker live Clipboard tests are intentionally ignored unless a safe real-device test has been arranged.

## Security

Never commit secrets, `.env` values, private keys, signing certificates, production credentials, database passwords, license-issuer keys, installers, executables, or release archives.

## Git

Keep `main` buildable and release-oriented. Use focused commits and feature branches for work that may destabilize the product.
