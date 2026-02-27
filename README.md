# カゲマスキャラ検索DB

**陰の実力者になりたくて！マスターオブガーデン（カゲマス）** のキャラクター性能検索ツールです。

公開URL: https://sg-kage.github.io/kage_character/

## 機能

- キャラクター名・スキル効果・魔道具などのキーワード検索
- 属性・ロール・グループ・効果名によるフィルタリング
- 好感度Lv / 魔道具Lv に応じたスキル数値のリアルタイム計算
- 覚醒前後のスキル比較表示
- キャラクター詳細のスクリーンショット生成（PNG保存）
- URLパラメータによるキャラクター共有（`?id=キャラクターID`）

### 検索コマンド

キーワードの前に項目名をつけると、その項目だけを絞り込めます。

```
特殊:シールド      → 特性にシールドを含むキャラ
魔道具:パリィ      → 魔道具にパリィを含むキャラ
奥義:〇〇          → 奥義に〇〇を含むキャラ
特技:〇〇          → 特技1/特技2に〇〇を含むキャラ
コンボ:〇〇        → コンボに〇〇を含むキャラ
通常:〇〇          → 通常攻撃に〇〇を含むキャラ
```

## ファイル構成

```
kage_character/
├── index.html                    # メインページ
├── characters/
│   └── all_characters.json       # キャラクターデータベース
├── image/
│   └── characters/               # キャラクター画像 (.webp)
├── js/
│   └── script.js                 # メインロジック
└── style/
    └── style.css                 # スタイルシート
```

## キャラクターデータの更新

`characters/all_characters.json` を編集します。

### データ構造

```json
{
  "CharacterID": 1000001,
  "name": "キャラ名[コスチューム名]",
  "attribute": "赤|緑|黄|青",
  "role": "アタッカー|タンク|サポーター",
  "position": 100,
  "arousal": "覚醒順序の説明",
  "group": ["グループ名"],
  "aliases": "別名,検索用キーワード",
  "ultimate": [{"title": "奥義名", "normal": "覚醒前説明", "awakened": "覚醒後説明"}],
  "ex_ultimate": [],
  "skill1": [{"title": "特技名", "normal": "...", "awakened": "..."}],
  "skill2": [{"title": "特技名", "normal": "...", "awakened": "..."}],
  "traits": [{"title": "特性名", "normal": "...", "awakened": "..."}],
  "combo": "コンボ説明",
  "normal_attack": "通常攻撃説明",
  "magic_item1": [{"title": "魔道具名", "normal": "..."}],
  "magic_item2": [{"title": "魔道具名", "normal": "..."}]
}
```

### 変動値の書き方

レベルによって変化する数値は `{最小値, 最大値}` の形式で記述します。

```
「威力{100.00, 200.00}%」
→ Lv1 で 100%、Lv10（または∞）で 200% として表示されます
```

## 免責事項

このサイトは Team CARAVAN および Aiming Inc. とは一切関係がなく、公式な承認を受けたものではありません。
掲載されているすべての画像の著作権は、それぞれの権利者に帰属します。

## 作成者

- kagenotify（[X / 旧Twitter](https://x.com/kagenotify)）
- Discord: [陰マス通知](https://discord.gg/SfMWv5UPad)
