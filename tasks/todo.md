# TODO: 多言語対応の土台づくり（切り替えUIは未実装）

対象リポジトリ: `C:\Github\sg-kage\kage_character`
方針: **後から言語を足せる構成にする**。今回は土台＋既存日本語の ja リソース化まで。en は空の雛形のみ（中身は作らない）。表示・挙動は現状と一切変えない（既定ロケール = ja）。

## 設計の要点

日本語文字列は3種類あり、扱いを分ける:
1. **純粋UIラベル**（「ポジ順」「画像: OFF」「データ更新日」等）→ 翻訳リソース `i18n/<locale>.json` に外出し
2. **データ結合ラベル**（属性 赤/緑/黄/青、ロール、セクション名 特殊/奥義 等。データのキー兼表示兼CSSクラス兼検索コマンド）
   → **内部キーは日本語のまま正規IDとして温存**（データスキーマ・CSSクラス・検索は無変更）。表示名だけ翻訳レイヤー `tLabel(category, id)` で解決
3. **コメント**（約192行）→ 翻訳不要、そのまま

## 作業計画

### 1. i18n ローダー（新規 `js/i18n.js`）
- [ ] ロケール解決: `?lang=` → `localStorage('kage_lang')` → 既定 `ja`（**可視の切替UIは作らない**が、プラグインは用意）
- [ ] `window.I18N` を公開: `locale` / `dataLocale` / `t(key, vars)` / `tLabel(category, id)` / `applyStaticDom()`
- [ ] `i18n/<locale>.json` を fetch。欠落キーは **ja へフォールバック**
- [ ] `<html lang>` を解決ロケールで設定（既定 ja）

### 2. UIリソースファイル（新規 `i18n/`）
- [ ] `i18n/ja.json`: 現行の日本語UI文字列を全集約（chrome / messages / labels{attribute,role,section,gacha,rarity} / meta）
- [ ] `i18n/en.json`: 同一キー構造の **空（または null）雛形のみ**。中身は ja フォールバックで動く

### 3. index.html
- [ ] 可視静的文字列に `data-i18n="key"` を付与（現行JPはインラインfallbackとして残す → JS前/非JSでもJP表示）
- [ ] `<script src="js/i18n.js">` を `script.js` の前に読み込み

### 4. js/script.js
- [ ] 動的UI文字列（ボタン名・メッセージ・ヒット件数・セクション見出し・char-label）を `I18N.t()` / `I18N.tLabel()` に置換
- [ ] **データキー（赤/アタッカー/特殊…）・CSSクラス対応・検索コマンド接頭辞は無変更**（正規IDとして維持）
- [ ] fetch パスを `characters/${I18N.dataLocale}/all_characters.json` 等に変更（既定 ja）

### 5. js/modal.js
- [ ] 利用規約モーダルの文言を `I18N.t()` 化

### 6. キャラデータのロケール別命名（フォルダは変えない）
- [ ] `characters/all_characters.json` → `characters/all_characters_ja.json`（git mv）
- [ ] `characters/update_date.json` → `characters/update_date_ja.json`（git mv）
- [ ] fetch パスを `characters/all_characters_${I18N.dataLocale}.json` 形式に
- [ ] 生成スクリプト（別リポジトリ: カゲマス側）が `_ja.json` 名で出力するよう **READMEに追記して明示**（このリポジトリ外なので本対応では変更しない）

### 7. ドキュメント
- [ ] README に「言語の追加手順」（`i18n/<locale>.json` と `characters/<locale>/` を足すだけ）を追記
- [ ] 完了後、本ファイルにレビューセクション追加

## 検証
- [ ] ローカルサーバで配信し、**既定(ja)表示が現状と同一**・コンソールエラーなし・データが新パスからロードされることを確認
- [ ] `?lang=en` で「キー未訳は ja にフォールバックして全文JP表示」を確認（崩れない＝構成が機能）

## レビュー

### 実装サマリ（2026-06-19 完了）
多言語対応の土台を構築。切り替えUIは未実装、既定 ja で表示・挙動は現状と同一。

**追加ファイル**
- `js/i18n.js` … ロケール解決(?lang→localStorage→ja) / `I18N.t()` / `applyStaticDom()` / 未訳(空/欠落)は ja フォールバック / `setLocale()` 入口
- `i18n/ja.json` … 既存日本語UI文言を全集約（meta/header/search/toggle/btn/level/effect/tab/label/section/msg/modal/footer）
- `i18n/en.json` … 同一キー構造の空雛形（空値→ja フォールバック）。`_note` 以外のキーは ja と完全一致を確認

**変更ファイル**
- `index.html` … 可視文字列に `data-i18n` / `data-i18n-html` / `data-i18n-attr` 付与（JPはインラインfallbackとして温存）。`js/i18n.js` を `script.js` 前に読み込み
- `js/script.js` … 動的UI文字列を `I18N.t()` 化。`DOMContentLoaded` 冒頭で `await I18N.ready`。データ取得を `characters/all_characters_${dataLocale}.json` に変更＋ja フォールバック＋キャッシュキーをロケール別に
- `characters/all_characters.json` → `_ja.json`、`update_date.json` → `_ja.json`（git mv）
- `README.md` … i18n 構成・言語追加手順を追記

**検証結果（localhost:8765）**
- ja: 192件ロード、全UI日本語、`ヒット件数:192件`/`データ更新日`(補間OK)、詳細のセクション/ラベル/タブ/覚醒前後すべて i18n 経由で正常。コンソールエラー0
- ?lang=en: locale=en/dataLocale=en、UIは ja フォールバック、データは `_en.json` 不在のため `_ja.json` に自動フォールバックして192件ロード。コンソールエラー0
- ja/en の JSON キー構造一致を自動チェックで確認、`node --check` で両JS構文OK

### スコープ外（今回は未対応・READMEに明記）
- 固定enum値（属性 赤/緑、ロール、ガチャ、レア度）の**ボタン表示**の言語化 … データ値でありフィルタ判定キーも兼ねるため、キャラデータファイル側翻訳と同時に対応すべき。正規ID保持＋表示マップ方式を推奨
- `js/modal.js` … 現状 index.html から未読込（dead code）のため変更せず。`i18n/ja.json` に modal.* キーのみ用意済
- 生成スクリプト（別リポジトリ）の出力名 `_ja.json` 化 … リポジトリ外のため未変更、README に明記
- `<head>` 構造化データ(ld+json) … 既定 ja のまま
