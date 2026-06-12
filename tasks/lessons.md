# Lessons

## 2026-06-12: html2canvas キャプチャが iOS Safari で暗くなる問題
- **症状**: iPhone Safari でスクショ機能の出力画像が全体的に暗く、文字がほぼ読めない。PC では正常。
- **根本原因**: `.char-detail-wrap` の `animation: detailFadeIn` (`from { opacity: 0 }`) が、html2canvas の内部 iframe 複製時に最初から再生し直され、opacity < 1 の瞬間のスタイルで描画されていた。タイミング依存のレースのため、処理の速い PC では顕在化しにくく iOS で常時発症。
- **修正**: `injectCaptureCSS()` の `.capture-target, .capture-target *` に `animation: none !important; transition: none !important;` を追加。注入した `<style>` は html2canvas の iframe にも複製されるため、iframe 内でもアニメが走らない。
- **教訓**: html2canvas でキャプチャする要素ツリーに CSS アニメーション（特に opacity を含むもの）があると、複製ドキュメントで再生し直されて中間状態が描画される。キャプチャ用 CSS では必ず `animation/transition: none` を強制すること。環境依存で「暗い・薄い」画像になる症状はまず opacity 系アニメを疑う。
