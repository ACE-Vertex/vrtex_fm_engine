# Security Policy

## Secrets

Do not store API keys, passwords, tokens, private keys, signing certificates, production credentials, or license-issuer secrets in this repository. Use protected environment configuration or an approved repository-external private storage location.

The desktop application resolves OpenAI credentials from Windows protected storage or `OPENAI_API_KEY`. Credentials must not be persisted in SQLite, local storage, logs, screenshots, test fixtures, or documentation.

## Build and signing material

Installers, executables, signing keys, certificates, and release archives are maintained outside the Source Repository. A release must not be published until its provenance, signature, and intended version have been verified.

## Reporting

Do not disclose a suspected vulnerability, leaked credential, or exploitable sample in a public issue. Contact the repository owner through a private GitHub channel and include only the minimum information needed to reproduce the problem safely.

## Supported status

The current `0.1.x` line is under development and is not yet declared production-ready.
