# TODO: 3改修 ③比較URL共有 / ①英語対応仕上げ / ②PWA化（2026-07-19）

計画詳細: `C:\Users\MY\.claude\plans\virtual-seeking-volcano.md`

## ③ 2体比較のURL共有（?cmp=）
- [x] showDetail の ?pos= 反映ブロックに cmp 書込/削除を追加
- [x] handleUrlParameter の pos 解決成功時に cmp 復元（characters から position 逆引き→compareChar 代入→showDetail）
- [x] 検証: 付与/復元/解除/cmp==pos無視/不明cmp無視/フィルタ操作後の保持

## ① 英語対応の仕上げ
- [x] en.json 全訳（modal セクションは空のまま温存）、search.cmd* は英語プレフィックス表記
- [x] ja/en に data セクション新設（attribute/role/gacha/rarity の表示変換マップ、ja は恒等）
- [x] script.js: tData() ヘルパー + ボタン生成/詳細表示/ピルの表示のみ差し替え（内部値は日本語のまま）
- [x] textContent を値として参照している箇所の洗い出し→dataset.value 化（applyFilterStateToButtons の setActive / ピル除去の2箇所）
- [x] fieldMap に英語エイリアス追加（trait/traits/skill/ult/ultimate/magic/item/combo/normal、両ロケール常時有効）
- [x] index.html: header-controls に lang-select 追加、script.js: setupLangControl()
- [x] 追加発見: list-height-select の「10件」等が静的HTMLで i18n 未対応 → setupListHeightControl で level.heightUnit を適用
- [x] 検証: ?lang=en 全域英語化・フィルタ動作・日英プレフィックス・切替往復・ja 既定表示不変

## ② PWA化
- [x] kage.webp から PNG アイコン生成（512/192/180、preview の canvas 経由。icon-512=546KB/icon-192=93KB/apple-touch=81KB）
- [x] manifest.webmanifest 作成（相対パス、standalone、#0a0a0f、any+maskable）
- [x] sw.js 作成（GET のみ・同一オリジンのみ・キャラ画像 cache-first・他 network-first・プリキャッシュ・旧版削除・navigate は './' に集約）
- [x] index.html: manifest リンク・apple-touch-icon PNG 化・SW 登録
- [x] 検証: SW 登録→オフライン再読込→復帰後のデータ更新フロー・manifest 妥当性

## レビュー

### 実装サマリ（2026-07-19 完了）
**変更**: js/script.js / js/i18n.js / index.html / i18n/ja.json / i18n/en.json / README.md
**新規**: manifest.webmanifest / sw.js / image/icon-512.png / image/icon-192.png / image/apple-touch-icon.png / .claude/launch.json

**検証結果（preview / localhost:8765）**
- ③: ピン→`?pos=220&cmp=386` 付与→新規状態で開き比較復元（左=シャドウ/右=シド）。cmp==pos・cmp=999999 は無視されURLからも除去。解除で cmp 消滅。復元は characters から position 逆引きなのでオブジェクト古参照問題も回避
- ①: `?lang=en` で全UI英語化（タイトル/ボタン/enum=Red・Attacker・Fes等/ピル "Attribute: Red"/ヘルプ/placeholder）。内部値は日本語のまま（URL は attr=赤/gacha=フェス）。trait:シールド と 特殊:シールド がともに20件で一致。切替UIで en↔ja 往復・localStorage 保存・ja 表示は改修前と同一
- ②: SW 登録・activated・controller 取得・precache（kage-v1-app）確認。サーバ停止状態で 195件リスト+キャラ詳細を完全表示（オフラインOK）。サーバ再開後のデータ取得も従来どおり
- 共通: node --check（script.js/sw.js）OK、manifest JSON 妥当、ja/en 144キー完全一致（空は modal の17キーのみ=温存方針どおり）、コンソールエラー0、375px でヘッダー(右端351)・Lv設定パネル(59〜359)とも viewport 内・横スクロールなし

### 補足
- スクショ証跡は Browser pane の screenshot がタイムアウトし取得不可（ページ自体は正常動作、検証は DOM 読み取りで実施）
- キャラデータ英語版（all_characters_en.json）は別途パイプライン作業（未着手・ja フォールバックで動作）
- sw.js の CACHE_VERSION は 'kage-v1'。プリキャッシュ対象を変えるときに上げる（通常のファイル更新は network-first なので version 上げ不要）

---

# TODO: お気に入りのURL共有機能（2026-07-03 完了）

ユーザー要望: 「お気に入りにしたキャラをURLで渡して表示させる機能がほしい」

## 実装
- Lv設定パネルに「共有リンクをコピー」ボタンを追加。現在の favorites(position配列) を `?favs=386,220,435` の形でURL化し、クリップボードへコピー（不可時は prompt フォールバック）
- 受け取り側: `?favs=` を検出したら **自分の favorites には触れず** `sharedFavorites`(閲覧専用Set) として保持し、リスト表示を共有された position のみに絞り込む(既存のフィルタ条件にAND追加)
- リスト上部にバナー表示「共有されたお気に入り: N件を表示中」＋「自分のお気に入りに追加」「解除」ボタン
  - 追加: sharedFavorites を自分の favorites にマージして保存、バナーを閉じてURLの `favs` を除去
  - 解除: 何もマージせず sharedFavorites=null にしてURLの `favs` を除去
  - 一部キャラが現在のデータに存在しない場合は「N/M件を表示中（一部は現在のデータに見つかりません）」に自動切替
- i18n: ja.json に fav.share* / fav.shared* キー追加、en.json に空キーを同構造で追加
- CSS: `.magic-btn-full`（共有ボタンの全幅化）、`#shared-favs-banner`（アクセント枠のバナー）を追加

## 検証(preview)
- 3キャラを★登録→共有ボタンでURL生成: `?favs=386,220,435` を確認、alertで件数表示
- 生成URLを別ブラウザ想定(localStorage空)で開く→自分のfavoritesは空のままバナー表示、リストはヒット件数3件に絞り込み
- 「追加」→自分のfavoritesに3件マージされバナー消滅・全193件表示に復帰・URLからfavs除去
- 存在しないID(999999)を混ぜた `?favs=386,220,999999` → 「2/3件を表示中（一部は...見つかりません）」表示を確認
- 「解除」→favoritesに触れず非表示・全件表示に復帰
- モバイル(375px)でバナー・ボタンのレイアウト崩れなし、コンソールエラー0、`node --check` OK

---

# TODO: デザインポリッシュ「今の路線を上品に磨く」（2026-07-03 完了）

- [x] body背景: 漆黒に紫が滲む2層ラジアルグラデーション（fixed）
- [x] #detail / #list: 1px薄枠＋上端インセットハイライトで面の立体感
- [x] リスト: hoverで2px右スライド、選択行は左→右へ溶けるアクセントグラデ、スクロールバーhoverを紫に
- [x] キャラ名: 属性色のtext-shadowグロー＋下にcurrentColorのヘアライン(::after)
- [x] タブactive: アクセントグロー / .char-section: 左上からの微光沢グラデ
- [x] ボタン群(header-btn/attr-btn/group-btn/sort/fav): hoverで1px浮遊＋影、activeで戻る
- [x] ★スター: hoverでゴールド＋scale(1.2)
- [x] キャプチャ安全策: injectCaptureCSS に .char-title text-shadow無効化・.char-section背景単色化を追加
- 検証: preview で描画確認（グロー/ヘアライン/枠すべて適用）、スクショ生成2200x3130成功、node --check OK
- 注: 検証中に characters/*.json が作業ツリーから消失していることを発見（コミット b9c75df には存在）。復元はユーザー判断待ち

---

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

# TODO: 日本語以外でキャラ画像が表示されない 2026-08-12

原因: 画像は日本語名（`image/characters/<日本語名>.webp`）で保存されているが、script.js が
表示名 `char.name` からパスを組み立てていたため、en/tw では訳名でリクエストして 404 になっていた。

## 対応
- 生成側 `CSV/ja/02_all_characters_make.py`: キャラ個別JSONのファイル名（＝日本語名）を `image` フィールドとして付与。`name` と一致する ja では付けないので ja のデータは無変更
- `all_characters_en.json` / `all_characters_tw.json` を再生成してリポジトリへ反映（update_date_*.json は内容変更ではないため元の値を維持）
- `js/script.js`: `charImageBase(char)`（`char.image || char.name`）を追加し、一覧の通常/Ex画像・詳細画像の計4か所で使用

## 検証（preview: localhost:8765）
- en: list-img 198件、data-ph（プレースホルダ差し替え）0件、src が日本語名になっていることを確認
- tw: 198/198 が naturalWidth>0 で読み込み成功、プレースホルダ0件
- ja: 198/198 読み込み成功（回帰なし）、コンソールエラー0件

# TODO: 言語セレクトの見た目がヘッダーと合っていない 2026-08-12

原因: `#lang-select` に CSS が一切当たっておらずブラウザ標準のまま（白背景・グレー枠・角丸なし・高さ19px）。
隣の `#font-size-select` は `#font-size-select` セレクタで個別に暗色スタイルが当たっていた。

## 対応
- `#font-size-select` 専用だったスタイルを `.header-select` クラスに一般化し、`index.html` の言語・文字サイズ両セレクトに付与
- `appearance: none` ＋ CSS グラデーションの自前矢印にして、OS 標準ドロップダウン矢印による見た目のブレを解消（`-webkit-appearance` も併記）
- `option` にも暗色背景を指定。`.header-btn` に `line-height: 1.5` を追加し、セレクトとボタンの高さを一致させた
- 480px 以下のメディアクエリにも `.header-select` の padding 調整を追加（`.header-btn` と同じ縮小率）

## 検証（preview: localhost:8765）
- デスクトップ ja/en: 言語・文字サイズ・画像ボタンの高さが 36px で揃い、背景 `--bg-elevated` / 角丸 8px も一致
- モバイル幅(375px) en: ラベルが長い "English" でも折り返しやはみ出しなし
- `#list-height-select`（一覧の「自動」）は別コンテキストのため今回は変更せず

## 追記: URLの lang パラメータの位置 2026-08-12

`URLSearchParams.set()` は既存キーなら位置を維持・新規キーなら末尾追加のため、`lang` の位置が入り口で
変わっていた（`?lang=en` で来訪→先頭 / セレクトで切替→末尾）。i18n.js の `setLocale()` で
`lang` を先頭に置き直すよう変更（他パラメータの相対順序は維持）。機能への影響はなく、共有URLの見た目の一貫性のみ。

検証: `?q=シド&sort=pos` から en→tw と切り替え、`?lang=xx&q=シド&sort=pos&pos=319` の形で lang が先頭・重複なし・コンソールエラー0件を確認。

# TODO: モーダル削除 & 多言語対応の棚卸し 2026-08-12

## モーダル削除
`js/modal.js` は index.html から読み込まれておらず（script タグは i18n.js と script.js のみ、`#modal-container` も不在）、
既に完全な死にコードだった。以下をまとめて削除。
- `js/modal.js`（利用規約モーダル一式）
- `style/style.css` の Terms Modal セクション（#terms-modal-bg / #terms-modal / #show-original-terms-btn / #agree-btn / #deny-btn / #original-terms-modal 系）と 480px 以下の `#terms-modal` 調整、計151行
- `i18n/ja.json` `i18n/en.json` の `modal.*`（17キー）。tw には元から無し
- 検証: node --check OK、JSON パース OK、`[id*="terms"]` の要素0件、一覧198件表示、コンソールエラー0件

## 多言語対応の現状（棚卸し結果）
- en: UI 146キー中 146 翻訳済み（modal 削除後は欠けなし）＝実質完了
- tw: 20キー分（data.* / header.langLabel / msg.aiNotice / footer 3件）のみで、**126キーが未翻訳＝ja へフォールバック**。
  ボタン・検索・ラベル・セクション見出し・meta（title/description/OGP）が日本語のまま表示される
- 非i18n箇所（両言語共通の残課題）
  - `index.html` の一覧件数セレクト `10件/15件/20件` がハードコード
  - `og:site_name` と JSON-LD (`name` / `description`) が日本語固定（静的タグのため言語切替で変わらない）
- script.js 内の日本語リテラル（"赤"/"アタッカー"/"フェス"、検索コマンドの "特技:" など）は
  キャラデータ側のキーと検索エイリアスであり、表示は `data.*` 経由で翻訳される。仕様どおりで対応不要

# TODO: 繁体字(tw)のUI翻訳を完成させる 2026-08-12

## 対応
- `i18n/tw.json` を 20キー → ja/en と同じ 128キーに拡充（meta / header / search / toggle / btn / fav / level / effect / tab / label / section / msg / footer すべて）
  - 既訳（data.* / langLabel / aiNotice / footer 3件）はそのまま維持
  - 用語は tw のキャラデータ側の表記に合わせた: シールド→護盾、パリィ→格擋、奥義→奧義、コンボ→連擊、通常攻撃→普通攻擊
  - 検索例文は実データでヒットすることを確認して確定（`特殊:護盾 魔道具:格擋` = 1件。当初案の「招架」は0件だったため差し替え）
- `js/script.js` の fieldMap に繁体字の項目名エイリアスを追加（奧義 / 連擊 / 普攻 / 普通攻擊）。
  特殊・特技・魔道具は日本語と同じ字形のため既存キーで動作する
- OGP: `og:site_name` を `meta.siteName` で i18n 化し、3言語に追加。`og:locale` は i18n.js で
  ロケールに応じて ja_JP / en_US / zh_TW を出し分け（BCP-47 とは形式が違うため HTML_LANG とは別表）
- JSON-LD (`application/ld+json`) は構造化データのため今回は日本語固定のまま（言語別に出し分けるなら別途）

## 訂正
前回「一覧件数セレクトが 10件/15件/20件 でハードコード」と報告したが誤り。
`script.js` の `applyListHeight()` が `level.heightUnit` ({n}件 / {n} rows / {n}筆) で上書きしており、既に i18n 済みだった。

## 検証（preview: localhost:8765）
- tw: ヘッダー・フィルタ・検索欄・ヒット件数(符合: 198 筆)・Lv設定パネル(技能Lv / 魔道具Lv / 我的最愛資料)・件数セレクト(10筆…) が繁体字表示。
  画面テキスト中に残る日本語はキャラ名などのデータ由来と Discord サーバー名「陰マス通知」（固有名詞のため意図的に非翻訳）のみ
- tw 検索コマンド: 奧義:攻擊=118件 / 特殊:護盾=20件 / 連擊:攻擊=12件 / 普攻:傷害=198件 / 魔道具:格擋=5件、奧義:zzz=0件（パース正常）
- en: trait:shield=20件 / magic:parry=5件、og:locale=en_US、og:site_name=Kagemasu Character Search DB
- ja: 特殊:シールド=20件 / 魔道具:パリィ=5件 / 奥義:ダメージ=154件、件数セレクト「10件」、画像198件、回帰なし
- コンソールエラー0件

## 修正: tw のサイト名から作品名が抜けていた 2026-08-12
ja「カゲマスキャラ検索」/ en「Kagemasu Character Search」は作品略称＋キャラ検索の構成だが、
tw を「角色檢索」とだけ訳したため作品名が消えていた。繁体字版の公式タイトル
《我想成為影之強者！Master of Garden》に合わせ、略称「影之強者」を補って以下を修正。
- header.brandMain: 角色檢索 → 影之強者角色檢索
- meta.title / ogTitle / twitterTitle: 【影之強者】角色檢索 | 我想成為影之強者！Master of Garden
- meta.ogDescription / twitterDescription: 冒頭に《影之強者》を明記
- meta.siteName: 角色檢索資料庫 → 影之強者角色檢索DB
検証: tw でタイトル・ヘッダー・og:site_name が上記表示。375px 幅でもヘッダー見出しは1行で収まる（133px / 375px）

## 修正: en のサイト名も分かりやすく 2026-08-12
"Kagemasu" は日本語略称のローマ字表記で英語圏では通じないため、ゲームの通称 "Master of Garden" を主にした。
検索流入のため "Kagemasu" はタイトル・description に併記して残す。
- header.brandMain: Kagemasu Character Search → Master of Garden Character Search
- meta.title / ogTitle / twitterTitle: Master of Garden Character Search | The Eminence in Shadow (Kagemasu)
- meta.ogDescription / twitterDescription: every Kagemasu character → every Master of Garden character
- meta.siteName: Master of Garden Character Search DB
- meta.description: 引用符を外して The Eminence in Shadow: Master of Garden (Kagemasu) 表記に統一
検証: en でタイトル・ヘッダー・og:site_name を確認。375px 幅でも見出しは1行（297px / 375px）で横スクロールなし、コンソールエラー0件
