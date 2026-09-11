# Vertex FM Engine

FileMaker ProのXML Clipboardを取得・解析・編集・検証・再送信する、Windows向けデスクトップ開発支援IDEです。

## Status

バージョン`0.1.0`の開発段階です。主要機能は実装済みですが、正式ReleaseにはFileMaker実機試験、CSP制限、コード署名、ライセンス基盤、バックアップ・復元試験が必要です。

## Technology

- Vue 3 / TypeScript / Quasar / Pinia
- Monaco Editor
- Tauri 2 / Rust
- SQLite
- OpenAI Responses API

## Requirements

- Windows 10/11（64-bit）
- Node.js 20以降
- pnpm
- Rust stable（MSVC toolchain）
- Microsoft Edge WebView2 Runtime
- FileMaker Pro（Clipboard実機試験時）

## Development

```powershell
pnpm install --frozen-lockfile
pnpm run dev
```

FileMaker ClipboardとSQLiteを含むデスクトップアプリ：

```powershell
pnpm run tauri dev
```

Windowsデスクトップの `VRTEX FM Engine - 開発版` ショートカットからも同じ開発モードを起動できます。ショートカットは `scripts/start-dev.ps1` を呼び出し、初回のみ依存関係を自動準備します。

## Build and Test

```powershell
pnpm run verify
```

個別に実行する場合：

```powershell
pnpm run build
pnpm run test:native
```

生成されたInstaller、実行ファイル、配布用ZIPは、このSource Repositoryへ保存しません。開発BuildはRepository外の`Builds/VRTEX_FM_ENGINE/<version>/`、正式配布物は`Releases/VRTEX_FM_ENGINE/<version>/`で管理します。

## Directory Structure

```text
src/                 Vue / TypeScriptフロントエンド
src-tauri/           Rust / Tauriネイティブバックエンド
tests/               リポジトリ横断テストの方針と将来のE2E試験
docs/
  architecture/      システム構造
  specifications/    現行仕様
  decisions/         Architecture Decision Records
  ai-prompts/         重要な初期要件・実装Prompt
  development/        開発・検証手順
scripts/             開発補助スクリプト
```

## Documentation

- [Documentation index](docs/README.md)
- [Technical specification](docs/specifications/Vertex%20FM%20ENGINE%20技術仕様書.md)
- [Development guide](docs/development/development-guide.md)
- [Security policy](SECURITY.md)

## Repository

- Product repository: [ACE-FRDS/vrtex_fm_engine](https://github.com/ACE-FRDS/vrtex_fm_engine)
- Related service: [ACE-FRDS/vrtex_fm_engine_community_api](https://github.com/ACE-FRDS/vrtex_fm_engine_community_api)

Community APIは別プロセス・別配備単位のため、独立Repositoryで管理します。

## Security Notes

- API Key、秘密鍵、署名証明書、Production CredentialはRepository外で管理します。
- OpenAI API KeyはWindows保護ストレージまたは実行環境の`OPENAI_API_KEY`から解決します。
- `.env`、証明書、Installer、Build成果物をCommitしないでください。
