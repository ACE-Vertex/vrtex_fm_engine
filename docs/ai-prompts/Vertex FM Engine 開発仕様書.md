# Vertex FM Engine 開発仕様書
Version 0.1 Draft

## 1. プロジェクト概要

### 1.1 製品名

**Vertex FM Engine**

### 1.2 コンセプト

Vertex FM Engineは、Claris FileMaker Proの開発作業を高速化するためのデスクトップ開発支援アプリケーションである。

単なるClipboard Managerではなく、以下を統合した「FileMaker Developer IDE / Development Engine」を目標とする。

- FileMaker Clipboardの取得・保存・再利用
- FileMaker XML Clipboard Formatの解析
- FileMaker XMLの編集
- FileMaker Clipboardへの直接送信
- XML検証
- オブジェクト種別自動判定
- Clipboard履歴管理
- コレクション管理
- XML Diff
- FileMaker構造表示
- 将来的なXML自動修復
- 将来的なAI連携
- 将来的なDDR解析

---

# 2. 基本方針

## 2.1 対象OS

初期リリース：

- Windows 10/11 64bit

将来対応：

- macOS

Linuxは現時点では対象外。

設計段階からOS依存処理を分離し、macOS実装を追加可能な構造とする。

---

# 3. 技術スタック

## Frontend

- TypeScript
- Vue 3
- Quasar Framework
- Monaco Editor

## Desktop Framework

- Tauri 2

## Backend / Native Core

- Rust

## Local Database

- SQLite

RustからSQLiteを利用する。

候補：

- rusqlite
- sqlx

初期実装では構造が単純で扱いやすい方式を選択する。

---

# 4. アーキテクチャ

基本構造：

```text
Vue 3 / Quasar / TypeScript
            │
            │ Tauri IPC
            ▼
          Rust
            │
    ┌───────┼────────┐
    ▼       ▼        ▼
Clipboard  SQLite   XML Core
    │
    ▼
FileMaker Pro
```

OS依存部分はRust側で分離する。

例：

```text
src-tauri/src/
├─ clipboard/
│  ├─ mod.rs
│  ├─ windows.rs
│  └─ macos.rs
├─ xml/
├─ database/
├─ commands/
└─ main.rs
```

外部からはOSを意識させず、

```text
get_filemaker_clipboard()
set_filemaker_clipboard()
```

のような共通インターフェースを提供する。

---

# 5. FileMaker Clipboard仕様

## 5.1 Windows Clipboard

FileMaker Clipboardは単純なプレーンテキストXMLではない。

基本構造：

```text
Windows Clipboard Format
        │
        └─ MemoryStream
             ├─ byte 0-3
             │    XML UTF-8 byte length
             │
             └─ byte 4-
                  XML UTF-8 data
```

先頭4byte：

- little endian
- XMLのUTF-8 byte length

その後：

- UTF-8 XML

---

# 6. FileMaker Clipboard Format

現在確認できている形式：

| Object | Internal Format | Windows Clipboard Format |
|---|---|---|
| Script | XMSC | Mac-XMSC |
| Script Steps | XMSS | Mac-XMSS |
| Table | XMTB | Mac-XMTB |
| Field | XMFD | Mac-XMFD |
| Layout Object | XML2 | Mac-XML2 |
| Custom Function | XMFN | Mac-XMFN |
| Theme | XMTH | Mac-XMTH |

未知のClipboard Formatが存在する可能性がある。

そのためFormatをenumだけで固定せず、未知Formatもstringとして保存可能にする。

---

# 7. Clipboard取得

Windows版では可能であればPowerShellを介さず、RustからWindows Clipboard APIを直接利用する。

FileMaker Clipboardから取得するもの：

```text
format
raw bytes
xml
timestamp
```

取得時に、

```text
Mac-XMSC
```

などのWindows Clipboard Formatを、

```text
XMSC
```

というInternal Formatとして扱う。

ただしオリジナルFormatも保持する。

---

# 8. Clipboard送信

XMLをFileMaker Clipboardへ送信するとき：

1. XMLをUTF-8 byte列へ変換
2. byte長を計算
3. little endian 4byte length header生成
4. header + XML bytesをMemoryStream相当のデータへする
5. Windows Clipboard Formatを登録
6. Clipboardへ送信

例：

```text
XMSC
↓
Mac-XMSC
↓
4 byte XML length
↓
UTF-8 XML
↓
Windows Clipboard
```

---

# 9. Format自動判定

Vertex FM EngineではFM Clipboard Thingより一歩進め、XML単体からClipboard Formatを推定する。

推定ロジックは独立モジュールにする。

例：

```text
Script
→ XMSC

Script Steps
→ XMSS

Table
→ XMTB

Field
→ XMFD

Layout Object
→ XML2

Custom Function
→ XMFN

Theme
→ XMTH
```

XMLのタグ、ルート構造、子要素など複数条件で判定する。

判定できない場合：

```text
UNKNOWN
```

としてユーザーにFormatを選択させる。

自動判定結果はInspectorに表示する。

---

# 10. UI基本設計

基準画面：

- 1920 × 1200
- Desktop first

デザイン：

- Dark theme
- Vertex Blue
- Blue anodized metalをイメージしたアクセント
- IDE / Engineering Tool風
- Visual Studio / JetBrains / VS Code系の情報密度
- 過度な装飾は避ける
- 高級感と視認性を優先

---

# 11. メインレイアウト

```text
┌─────────────────────────────────────────────────────────┐
│ VERTEX FM ENGINE                         FileMaker 26 ● │
├──────────────┬──────────────────────────┬───────────────┤
│              │                          │               │
│ Clipboard    │                          │ Inspector     │
│ History      │      Monaco Editor       │               │
│              │                          │ Format        │
│ Collections  │                          │ Type          │
│              │                          │ Validation    │
│ Favorites    │                          │ Metadata      │
│              │                          │               │
├──────────────┴──────────────────────────┴───────────────┤
│ Clipboard Info │ Preview │ Tags │ Notes                 │
├─────────────────────────────────────────────────────────┤
│ Ready │ Auto Save │ History count │ DB │ Theme          │
└─────────────────────────────────────────────────────────┘
```

---

# 12. Top Navigation

初期候補：

```text
Clipboard
Library
Collections
Tools
Settings
```

---

# 13. Clipboard History

左パネル。

表示例：

```text
Today

地方競馬現役馬JSON取込
XMSC | Script
12:03:24

Insert from URL
XMSS | Step
11:58:11

出走馬テーブル
XMTB | Table
11:45:02
```

表示情報：

- Name
- Format
- Object Type
- timestamp
- favorite
- tags

日単位でグループ化。

---

# 14. Clipboard自動保存

FileMaker Clipboardを取得したデータはSQLiteへ保存可能とする。

保存データ：

```text
id
name
format
windows_format
object_type
xml
created_at
updated_at
last_used_at
favorite
checksum
filemaker_version
notes
```

---

# 15. 重複防止

XMLからchecksumを生成。

例：

```text
SHA-256
```

同一checksumのClipboard Itemが存在する場合：

- 原則新規レコードを作らない
- last_used_atを更新
- 必要であればrevisionとして保存

設定で動作変更可能にする。

---

# 16. Revision

同一アイテムに変更があった場合、将来的に履歴を残せる構造にする。

```text
clipboard_items

clipboard_revisions
```

revisionには、

```text
id
clipboard_item_id
xml
checksum
created_at
```

を保持する。

---

# 17. Collections

ユーザーがClipboard Itemをプロジェクト単位に整理できる。

例：

```text
Vertex Project
├─ JRA-VAN
├─ NAR
├─ Import Scripts
├─ Master Tables
└─ UI Components

MedicalRecord
├─ Analysis Scripts
├─ TEMP Tables
├─ Drug Master
└─ Layout Parts
```

Clipboard Itemは複数Collectionへ所属可能にしてもよい。

---

# 18. Tags

Clipboard Itemへ複数Tagを付与可能。

例：

```text
Vertex
JSON
JRA-VAN
NAR
Import
MedicalRecord
TEMP
```

---

# 19. Favorites

重要なXMLをFavorite登録できる。

Favoritesは左パネルからすぐアクセス可能にする。

---

# 20. XML Editor

Monaco Editorを使用。

必須機能：

- XML syntax highlight
- line number
- folding
- search
- replace
- undo / redo
- minimap
- format document
- copy
- select all

将来：

- FileMaker XML専用syntax highlighting
- custom completion
- XML schema support

---

# 21. Editor Tabs

中央エディタ上部：

```text
XML
Preview
Structure
Diff
Notes
```

---

# 22. XML Tab

生XML編集画面。

変更状態を、

```text
Modified
Saved
```

として表示。

---

# 23. Preview

FileMaker XMLを人が読める形へ変換する。

Script例：

```text
Script: 地方競馬現役馬JSON取込

1 Set Variable [ $$url ]
2 Insert from URL [ $$url → $$json ]
3 Set Variable [ $$data ]
4 Loop
   4.1 Set Variable
   4.2 New Record
   4.3 Set Field
5 Commit Records
```

最初はScript系のみ対応でもよい。

---

# 24. Structure

XML DOMをTree View表示する。

例：

```text
fmxmlsnippet
└─ Script
   ├─ Step
   │  └─ SetVariable
   ├─ Step
   │  └─ InsertFromURL
   └─ Step
      └─ Loop
```

---

# 25. Diff

2つのXMLまたはRevision間を比較。

Monaco Diff Editorを利用する。

用途：

- 変更前 / 変更後
- Revision比較
- FileMakerから再取得したXMLとの差分

---

# 26. Inspector

右パネル。

表示：

```text
Format (Windows)
Mac-XMSC

Format (Internal)
XMSC

Type
Script

Objects
1 Script / 37 Steps

FileMaker Version
26.0

Size
18,848 bytes

Encoding
UTF-8

Header
4 bytes
```

---

# 27. Validation

最低限：

- XML parse可能
- root存在
- encoding
- Formatとの矛盾チェック
- Clipboard header生成可能

表示：

```text
✓ XML is valid
✓ Format XMSC
✓ Clipboard data can be generated
```

異常：

```text
⚠ Format mismatch
✕ XML parse error
```

---

# 28. 将来のValidation

将来的にはFileMaker専用Validationを追加。

例：

- Script Step属性不足
- 不正なID
- FormatとXML内容の不一致
- 必須Node不足
- FileMaker Version非互換

---

# 29. Actions

右側に主要Action。

```text
SEND TO FILEMAKER

GET FROM FILEMAKER

Validate

Save

Add to Favorites

Save as File

Copy as Text
```

最重要Action：

**SEND TO FILEMAKER**

Vertex Blueで強調。

---

# 30. Clipboard Info

下部。

```text
Format
Mac-XMSC

Internal Format
XMSC

Type
Script

Data Size
18.42 KB

Encoding
UTF-8

Header
4 bytes
```

---

# 31. Notes

Clipboard Item単位でメモ保存。

例：

```text
地方競馬現役馬JSON取込用。
Vertex Projectの中核インポートスクリプト。
```

---

# 32. SQLite Schema案

最低限：

```text
clipboard_items
collections
collection_items
tags
clipboard_tags
clipboard_revisions
settings
```

---

## clipboard_items

```text
id TEXT PRIMARY KEY
name TEXT
format TEXT
windows_format TEXT
object_type TEXT
xml TEXT
checksum TEXT
filemaker_version TEXT
notes TEXT
favorite INTEGER
created_at TEXT
updated_at TEXT
last_used_at TEXT
```

---

## collections

```text
id TEXT PRIMARY KEY
name TEXT
parent_id TEXT
created_at TEXT
updated_at TEXT
```

Collectionは階層化可能。

---

## collection_items

```text
collection_id TEXT
clipboard_item_id TEXT
```

---

## tags

```text
id TEXT PRIMARY KEY
name TEXT UNIQUE
```

---

## clipboard_tags

```text
clipboard_item_id TEXT
tag_id TEXT
```

---

## clipboard_revisions

```text
id TEXT PRIMARY KEY
clipboard_item_id TEXT
xml TEXT
checksum TEXT
created_at TEXT
```

---

# 33. Settings

最低限：

```text
Theme
Auto Save Clipboard
Clipboard Polling
Duplicate Handling
History Limit
Monaco Font Size
Monaco Minimap
Database Location
Default FileMaker Version
```

---

# 34. FileMaker接続表示

実際にはFileMaker Serverへ接続するという意味ではなく、

FileMakerプロセスの存在やClipboard取得状態から、

```text
FileMaker 26
● Connected
```

のように表示する。

取得できない場合：

```text
FileMaker
○ Not detected
```

---

# 35. Rust Commands案

```text
get_filemaker_clipboard

set_filemaker_clipboard

detect_filemaker

detect_xml_format

validate_filemaker_xml

save_clipboard_item

load_clipboard_item

delete_clipboard_item

list_clipboard_history

create_collection

update_collection

delete_collection
```

DB操作についてはRust内部Service経由でもよい。

---

# 36. Rust Module案

```text
src-tauri/src/

main.rs

commands/
├─ clipboard.rs
├─ xml.rs
├─ library.rs
└─ system.rs

clipboard/
├─ mod.rs
├─ windows.rs
└─ macos.rs

xml/
├─ parser.rs
├─ detector.rs
├─ validator.rs
└─ preview.rs

database/
├─ mod.rs
├─ models.rs
├─ migrations.rs
└─ repository.rs
```

---

# 37. Frontend構成案

```text
src/

components/
├─ editor/
│  ├─ XmlEditor.vue
│  ├─ DiffEditor.vue
│  └─ StructureView.vue
│
├─ clipboard/
│  ├─ ClipboardHistory.vue
│  ├─ ClipboardInfo.vue
│  └─ ClipboardActions.vue
│
├─ inspector/
│  ├─ InspectorPanel.vue
│  └─ ValidationPanel.vue
│
└─ library/
   ├─ CollectionTree.vue
   ├─ TagList.vue
   └─ Favorites.vue

pages/
└─ MainPage.vue

stores/
├─ clipboard.ts
├─ editor.ts
├─ library.ts
└─ settings.ts
```

Piniaを利用してよい。

---

# 38. 開発優先順位

## Phase 1

アプリ骨格。

- Tauri 2
- Vue 3
- TypeScript
- Quasar
- Rust
- SQLite
- Main Window

---

## Phase 2

UIモックアップ再現。

まだFileMaker連携しなくてよい。

- Header
- Clipboard History
- Monaco Editor
- Inspector
- Bottom Panel
- Status Bar

---

## Phase 3

Windows FileMaker Clipboard。

- Clipboard Format列挙
- Mac-XMSCなど取得
- 4byte header解析
- XML取得
- FileMaker Clipboard送信

---

## Phase 4

履歴。

- SQLite保存
- History一覧
- 再利用
- Favorite
- Notes

---

## Phase 5

Format Detection。

- XMSC
- XMSS
- XMTB
- XMFD
- XML2
- XMFN
- XMTH

---

## Phase 6

Validation。

---

## Phase 7

Collections / Tags。

---

## Phase 8

Preview / Structure / Diff。

---

# 39. 初期完成条件 v1.0

以下を満たした時点で実用版v1.0とする。

1. FileMaker ClipboardからXML取得可能
2. Clipboard Format取得可能
3. XMLをMonaco Editorで編集可能
4. XMLからFormat自動判定可能
5. FileMaker Clipboardへ再送信可能
6. Clipboard履歴をSQLiteへ保存可能
7. 保存済XMLを再利用可能
8. Collections利用可能
9. Favorites利用可能
10. XML Validation可能
11. Diff可能
12. Dark Vertex UIが完成

---

# 40. 将来機能

v1.x以降：

- XML自動修復
- FileMaker Script専用Editor
- FileMaker Calculation解析
- XML Component Library
- Clipboard revision管理
- Project単位管理
- macOS Clipboard対応
- DDR解析
- FileMaker Schema比較
- FileMaker Version比較
- AIによるXML生成
- AIによるXML修正
- AIによるScript説明
- ChatGPT / OpenAI API連携

最終目標：

```text
AI
 ↓
FileMaker XML生成
 ↓
Vertex FM Engine
 ├─ Analyze
 ├─ Validate
 ├─ Repair
 ├─ Format Detection
 └─ Clipboard Conversion
 ↓
FileMaker Pro
```

Vertex FM Engineを、

**FileMaker Development Accelerator / FileMaker Development Engine**

として完成させる。