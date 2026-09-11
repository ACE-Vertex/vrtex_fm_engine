# ADR-002: Separate product, service, and build boundaries

- Status: Accepted
- Date: 2026-08-26

## Context

The desktop product, Community API, installers, and signing material have different deployment, access, and security requirements.

## Decision

- Keep the desktop product in `ACE-FRDS/vrtex_fm_engine`.
- Keep the independently deployed Community API in `ACE-FRDS/vrtex_fm_engine_community_api`.
- Store development builds and formal releases outside both Source Repositories.
- Store credentials, private keys, and signing material outside all Source Repositories.

## Consequences

Each repository can be built, reviewed, secured, and released independently. Cross-repository changes must identify both repositories explicitly.
