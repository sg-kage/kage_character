# Lessons

## 2026-07-03: お気に入りが CharacterID(=配列インデックス) をキーにしていて並び替えに弱かった
- **症状**: ユーザーから「順番が変わったらお気に入りがうまくいかないのでは」と指摘。実際 `char.CharacterID` は JSON 配列の 0,1,2... という並び順そのもの（ゲーム固有の安定IDではない）で、データの並び替えや途中へのキャラ挿入があると全キャラの CharacterID がずれ、既存のお気に入りが別キャラを指してしまう欠陥だった。
- **根本原因**: 識別子として「たまたま存在するID風のフィールド」を検証なしに採用してしまった。CharacterID という名前から安定IDだと思い込んだが、実データを確認すると `ids == list(range(len(d)))` で完全に配列インデックス。
- **修正**: `char.position`（ゲーム内で一意・詳細画面の「ポジション」欄、`?pos=`共有にも使用）をお気に入りのキーに変更。旧データ(CharacterID基準)は `migrateFavoritesToPosition()` で一度だけ position 基準に自動移行（`kage_fav_migrated_v2` フラグで二重移行防止）。
- **教訓**: 永続化するIDは「名前が identifier っぽい」だけで信用せず、必ず実データで一意性・安定性（配列の並びを変えても値が変わらないか）を検証すること。並べ替え耐性が要る保存キーには、Position/UUID等「ゲーム側が意味を持って管理している値」を優先する。[README.md](../README.md) のデータ構造にも CharacterID が単なる配列位置である旨を明記する余地あり。

## 2026-07-03: スキル枠の見出し行だけ左の属性色ラインが二重（段差）に
- **症状**: セクション枠追加後、「奥義」等の見出し行だけ左ラインが6px幅に見え、ユーザーから「若干ずれてる」と指摘。
- **根本原因**: `.char-section`（インラインstyleで属性色3px）と `.char-section-title`（CSSで3px）の両方が border-left を持ち、見出し行だけ二重に描画。テキスト開始位置も本文と3pxずれていた。
- **修正**: 見出し側の border-left を撤去し、属性色ラインはセクション側の1本に集約。
- **教訓**: 装飾ライン（アクセントボーダー）は親子で重複しやすい。枠を追加・変更したら「同じ役割のラインを子要素も持っていないか」を確認し、テキスト開始X座標を getBoundingClientRect で親子比較して揃いを実測すること。目視スクショだけだと数pxの段差を見逃す。

## 2026-07-03: detail-header へのボタン追加で Lv設定パネルがスマホ画面外へ
- **症状**: 「2体比較」ボタンを Lv設定 と スクショ の間に追加したところ、スマホで Lv設定パネルの左半分が画面外にはみ出た。
- **根本原因**: パネルは `position:absolute; right:0; width:300px` で `.level-panel-wrap`（=Lv設定ボタン）の右端基準に左へ300px展開する構造。ボタン追加でLv設定ボタンが左へずれ、375px幅では展開分が viewport 左端を突き抜けた。
- **修正**: `.level-panel-wrap` の `position:relative` を撤去し、パネルの基準を `#detail-header`（relative・ボタン列全体）へ変更。ボタン数に依存しない右揃えになった。
- **教訓**: ボタンに紐づく absolute 配置のポップオーバーは、アンカー要素が移動するとはみ出す。①アンカーは「動く個別ボタン」でなく「安定したコンテナ」に取る。②detail-header 等のレイアウトを変えたら、必ず375px幅でポップオーバー類（Lv設定パネル）の bounding box が viewport 内に収まるか検証すること。PC幅だけの確認では見逃す。

## 2026-07-02: やらないと決まった改修項目（再提案禁止）
- **modal.js（利用規約モーダル）の削除**: index.html から読み込まれていないデッドコードだが、ユーザーが「絶対いらん」と明言。関連CSS（style.css の #terms-modal 系）も削除しない。将来復活させる可能性を考慮し現状維持。
- **モバイルのリストタップ→詳細への自動スクロール**: 同じく不要と明言。提案しないこと。
- **教訓**: デッドコード削除やUX改善は一見正当でも、作者に温存意図がある場合がある。過去に見送られた項目は「見送り＝不要の意思表示」として扱い、再提案は控えめにすること。

## 2026-06-12: html2canvas キャプチャが iOS Safari で暗くなる問題
- **症状**: iPhone Safari でスクショ機能の出力画像が全体的に暗く、文字がほぼ読めない。PC では正常。
- **根本原因**: `.char-detail-wrap` の `animation: detailFadeIn` (`from { opacity: 0 }`) が、html2canvas の内部 iframe 複製時に最初から再生し直され、opacity < 1 の瞬間のスタイルで描画されていた。タイミング依存のレースのため、処理の速い PC では顕在化しにくく iOS で常時発症。
- **修正**: `injectCaptureCSS()` の `.capture-target, .capture-target *` に `animation: none !important; transition: none !important;` を追加。注入した `<style>` は html2canvas の iframe にも複製されるため、iframe 内でもアニメが走らない。
- **教訓**: html2canvas でキャプチャする要素ツリーに CSS アニメーション（特に opacity を含むもの）があると、複製ドキュメントで再生し直されて中間状態が描画される。キャプチャ用 CSS では必ず `animation/transition: none` を強制すること。環境依存で「暗い・薄い」画像になる症状はまず opacity 系アニメを疑う。

## 2026-06-24: 検証時 getComputedStyle が古い値を返す（transition 起因）
- **症状**: 文字サイズ機能の検証で、`documentElement.style.fontSize` を変更直後に `getComputedStyle(...).fontSize` を読むと変更が反映されず古い値のまま。インラインstyle自体は正しく入っていた。
- **根本原因**: このサイトは多くの要素に微小な `transition`（約 `1e-05s` ≒0秒）が掛かっており、font-size もトランジション対象。同一同期タスク内で値変更直後に getComputedStyle するとトランジション開始前の値が返る。
- **対処**: 検証時は値変更後に `requestAnimationFrame` を2回挟んでから測定する（`await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`）。これで 90%/112% が rem 要素に正しく伝播することを確認できた。
- **教訓**: このリポジトリでスタイル変更を eval で即時検証する際は、transition のせいで同期読み取りが信用できない。必ず rAF を挟むか、最終手段としてスクショで実描画を確認すること。機能自体のバグと誤認しないこと。
