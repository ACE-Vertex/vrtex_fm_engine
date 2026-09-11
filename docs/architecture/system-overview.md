# System Overview

Vertex FM Engine is a single desktop product with a Vue/TypeScript user interface and a Rust/Tauri native backend.

```text
Vue UI
  -> Pinia stores
  -> TypeScript service gateways
  -> Tauri commands
  -> Rust domain services
  -> Windows Clipboard / SQLite / protected credentials / network providers
```

## Boundaries

- UI state, editor interaction, themes, and navigation belong to `src/`.
- Native Clipboard, filesystem, credential protection, SQLite, and provider calls belong to `src-tauri/`.
- Public Tauri commands validate input before delegating to domain or persistence code.
- Community API is independently deployed and therefore maintained in a separate repository.
- Installers, release archives, signing certificates, and private keys remain outside the Source Repository.
