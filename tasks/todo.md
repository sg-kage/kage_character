# TODO: バグ修正＋機能追加 6件（2026-07-02）

対象リポジトリ: `C:\Github\sg-kage\kage_character`

## 作業計画
- [x] ①バグ: トグル開閉時に選択カウント消失 — `createToggleBtn` の onclick を `updateToggleBtnCounts()` に一本化
- [x] ②ドキュメント: README の共有URL説明 `?id=` → `?pos=` に修正
- [x] ③堅牢化: スキル文のHTMLエスケープ — `comboBlock` / `skillBlockBothInline` / `skillBlockCompare` で `escapeHtml` を通す(データに `<` 無しを確認済み)
- [x] ④機能: フィルタ・検索状態のURL共有 — `updateList` 末尾で `?q=/attr=/role=/gacha=/rarity=/group=/name=/effect=/em=/fav=/sort=` を replaceState 同期、`handleUrlParameter` で復元＋`applyFilterStateToButtons()` でボタン見た目反映
- [x] ⑤機能: お気に入りエクスポート/インポート — Lv設定パネルに行追加、クリップボード経由(失敗時 prompt フォールバック)、インポートはマージ方式
- [x] ⑥機能: キャラ2体比較 — `#detail-header` に「2体比較」ボタン、現在キャラをピン→別キャラ選択で左右並列表示(700px以下は縦積み)。`showDetail` の本文生成を `buildCharDetailHtml()` に切り出して再利用
- [x] i18n: ja.json に新キー追加(btn.compare系 / fav.*)、en.json に同キーを空で追加(構造一致を検証済み)
- [x] 検証: `node --check` OK / preview で全機能動作確認・コンソールエラー0

## レビュー

### 実装サマリ（2026-07-02 完了）
**変更ファイル**: js/script.js / index.html / style/style.css / i18n/ja.json / i18n/en.json / README.md

**検証結果（preview / localhost:8765）**
- ①: ガチャ選択→「ガチャ▲ (1)」→開閉後も「ガチャ▼ (1)」でカウント保持
- ③: エスケープ後も変動値ハイライト(lv-highlight 20個)・スキル名太字・本文とも表示劣化なし
- ④: 属性/ガチャ選択でURLに `?attr=赤&gacha=フェス` 反映。`?attr=赤,青&role=タンク&q=シールド&sort=pos&em=or` 直開きで全状態復元（ボタンactive/ピル/検索欄/ソート/ORモード）
- ⑤: ★2件→エクスポートでJSONがクリップボードへ、インポートは `["9990001","9990002","abc"]` から有効2件のみマージ、alert文言も正常
- ⑥: ピン→「比較解除」表示、別キャラ選択で左右2カラム表示、解除で単体復帰。モバイル(375px)は縦積み。比較中のスクショ撮影も成功(2200x3600)
- 追加調整: 比較の半分幅で基本情報行が重なったため `.compare-wrap .char-info-row-top { flex-wrap: wrap }` を追加
- `node --check` OK / ja・en キー構造一致 / コンソールエラー・警告0

### 補足
- お気に入り移行UIは「Lv設定」パネル内に配置（全体設定の集約先として）。別の場所が良ければ移動可
- 比較のピン留めはセッション内のみ（リロードで解除）。URLには含めていない

---

# TODO: 文字サイズ切替機能（UI全体を比例拡縮）

対象リポジトリ: `C:\Github\sg-kage\kage_character`
方針: フォントサイズが全て `rem` トークン基準（style.css:62-66）なので、**ルート `html` の font-size を1点変更**してUI全体を比例拡縮する。設定は `localStorage('kage_font_scale')` に永続化。UIは既存 `list-height-select` と同じ `<select>` を `#hit-row` に並べる（小=90% / 中=100%（既定）/ 大=112%）。

## 作業計画
- [ ] index.html: `#hit-row` の button-group に `<select id="font-size-select">`（小/中/大）を追加。`data-i18n` 付与
- [ ] i18n/ja.json: `level.fontSize`（aria）/ `fontSmall` / `fontMedium` / `fontLarge` を追加
- [ ] i18n/en.json: 同キーを空で追加（ja フォールバック）
- [ ] js/script.js: `ELS.fontSizeSelect` 追加 / `setupFontSizeControl()` 実装（保存値復元→`documentElement.style.fontSize` 適用、change で保存＋`resize` 発火してリスト高さ再計算）/ DOMContentLoaded で `setupListHeightControl()` の前に呼ぶ
- [ ] capture（スクショ）CSS は px 固定のため拡縮の影響を受けない＝スクショは一定サイズ維持（仕様として許容）

## 検証
- [ ] ローカル配信で 小/中/大 を切替→UI全体が拡縮、リスト高さ(固定件数)も追従、コンソールエラー0
- [ ] リロード後も選択が保持される
- [ ] `node --check js/script.js` 構文OK / ja・en JSON の構造一致

## レビュー

### 実装サマリ（2026-06-24 完了）
文字サイズ切替（小90% / 中100%（既定）/ 大112%）を追加。ルート `html` の font-size を変更し、rem ベースのUI全体を比例拡縮。

**変更ファイル**
- `index.html` … `#hit-row` の button-group に `<select id="font-size-select">`（小/中/大）を追加
- `i18n/ja.json` / `i18n/en.json` … `level.fontSize`/`fontSmall`/`fontMedium`/`fontLarge` を追加（en は空＝ja フォールバック）
- `js/script.js` … `ELS.fontSizeSelect` 追加。`FONT_SCALE_MAP` と `setupFontSizeControl()` を実装（保存値復元→`documentElement.style.fontSize`、change で `safeSetItem('kage_font_scale')`＋`resize` 発火でリスト高さ再計算）。DOMContentLoaded で `setupListHeightControl()` の前に呼ぶ
- `.claude/launch.json` … 検証用の静的サーバ設定（プロジェクト固有）

**検証結果（localhost:8765 / preview）**
- 小/中/大 切替で `html` の font-size = 90%/100%/112%、rem 要素が比例拡縮（brand-sub 12px↔19.2px 等で確認）。スクショで一覧の情報量変化も確認
- リロード後も選択保持（select=large / inline=112% / saved=large）
- コンソールエラー 0、`node --check` OK、ja/en の `level` キー構造一致
- リスト高さ(固定件数)は change 時の `resize` 発火で追従

### スコープ外（仕様として許容）
- スクショ（capture）CSS は px 固定のため文字サイズ拡縮の影響を受けず、出力は常に一定サイズ

### 追加対応（2026-06-24）: 配置見直し
- 当初 `#hit-row`（リスト操作列）に置いたが、文字サイズは全体設定で文脈が合わないとの指摘。**`#detail-header` 右上**（画像:OFF / Lv設定 / スクショ の並び）へ移動し「表示設定」を集約
- `style.css` に `#font-size-select` のスタイルを追加し `.header-btn` と見た目を統一（bg=--bg-elevated / padding=sp-2 sp-4 / hover / focus outline）
- 検証: ヘッダー先頭に配置・動作維持(112%/90%/100%)・背景rgb(31,31,44)で header-btn と一致。コンソールエラー0
- 注: 検証中、プレビューのブラウザキャッシュで旧 style.css が配信され「背景だけ白＝未適用」に見える事象。`?bust=` で新CSSを読ませて解消（コード側は終始正常）

### 再々対応（2026-06-24）: モバイルでの配置不備を修正
- 指摘: `#detail-header` は PC では右上ヘッダーだが、**`≤700px` では `#container` が縦積みになり `#main` が下段**＝スマホではフィルタ＋リストを全部スクロールした中段に埋もれる（[style.css:1349](style/style.css:1349)）。全体設定の置き場として不適切
- 対応: 全体表示設定（**文字サイズ＋画像表示ON/OFF**）を**サイト `<header>` 右上**へ移動。`<header>` を `display:flex; justify-content:space-between; flex-wrap:wrap` 化し、`.header-titles`（タイトル群）と `.header-controls`（操作群, `margin-left:auto`）に分割。`<header>` は両レイアウトで常にページ最上部
- `Lv設定` / `スクショ` は詳細依存（スクショは未選択時 is-hidden）のため `#detail-header` に残置
- 検証（preview / CSSは ?bust= で最新化）:
  - PC(1280px): 操作群 top=20 / 右端1241 でヘッダー右上に固定
  - スマホ(375px): 操作群 right=351（375内に収まる）でタイトル下に右寄せ、リストより上部で即アクセス可
  - 動作: 文字サイズ=112%/画像 OFF↔ON 切替OK、id 不変で JS 影響なし、コンソールエラー0

---

# TODO: 追加改善（a11y / 画像プレースホルダ）2026-06-24

ユーザー選択: ②アイコンボタンのa11y ＋ ④画像404プレースホルダ（①タップ→スクロール・③modal.js削除は今回見送り）

## ② アイコンのみボタンの a11y
- `fav-filter-btn`（★ お気に入りフィルタ, script.js）に `aria-label`(=btn.favTitle) と `aria-pressed` を付与。onclick と clearAllFilters で `aria-pressed` を同期
- 各行のお気に入りスター（☆/★, span）に `role="button"` / `aria-label`(=btn.ariaFavStar) / `aria-pressed` を付与。toggleFavorite→updateList 再描画で状態が正しく再生成
- i18n: `btn.ariaFavStar`="お気に入り登録切替" を ja に追加、en は空（フォールバック）。btn キー構造一致を確認
- 補足: 行スターは tabindex を付けず（192個のタブストップ増を避ける）、ラベル/状態のみ改善。属性/ロール/ソートは既に aria-pressed 対応済み

## ④ 画像読み込み失敗時のプレースホルダ
- 個別の inline `onerror`（list-img の visibility:hidden、char-image の display:none）を撤去し、**document の capture フェーズ error リスナー1か所に集約**（error はバブルしないため capture=true）。対象 class（list-img/list-img-ex/char-image）の IMG のみ、`data-ph` で二重差し替え防止
- 失敗時はシルエットの SVG データURI（`IMG_PLACEHOLDER`）へ差し替え＋`.img-placeholder`（object-fit:contain）付与。一覧の空白・詳細の消失（旧 display:none）を解消
- DOMContentLoaded で `setupImageFallback()` を登録

## 検証（preview）
- a11y: favBtn aria-pressed false→true、行スター role=button/label/pressed を確認
- 画像: 一覧4枚＋詳細画像をわざと404→全て data:image/svg+xml に差し替え・`.img-placeholder` 付与・壊れアイコンや空白なし（PC/スマホ幅で目視）
- `node --check` OK、ja/en btn キー一致、コンソールエラー0
