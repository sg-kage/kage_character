# Lessons

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
