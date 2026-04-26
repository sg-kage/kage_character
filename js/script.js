/**
 * ==============================================================================
 * Kage-Masu Database Script
 * ------------------------------------------------------------------------------
 * キャラクターデータベースの検索、表示、レベル計算、画像処理、
 * スクリーンショット生成などのメインロジックを管理するスクリプトです。
 * ==============================================================================
 */

/* =========================================
   1. グローバル設定・変数定義
   ========================================= */

/**
 * アプリケーション全体の設定定数
 */
const CONFIG = {
    // 属性ごとのカラーコード定義
    attributes: {
        "赤": "#d4605a",
        "緑": "#4aad72",
        "黄": "#c9a84a",
        "青": "#3d7cba"
    },
    // キャラクターの役割定義
    roles: ["アタッカー", "タンク", "サポーター"],
    // 正規表現パターン（再利用のため定数化）
    REGEX: {
        splitSpace: /[ 　]+/,             // 半角/全角スペースでの分割
        splitColon: /[:：]/,               // 半角/全角コロン
        splitName: /[&＆]/,                // キャラ名連結文字
        cleanName: /\[.*$/,                // [フェス限]などの表記削除用
        dynamicVal: /\{([\d.]+),\s*([\d.]+)\}/g, // 変動値プレースホルダ {min, max}
        effects: /『([^』]+)』/g,           // 『効果名』の抽出
        sanitize: /[\/\\?%*:|"<>]/g,       // ファイル名に使えない文字のサニタイズ
        unsafeChars: /[.*+?^${}()|[\]\\]/g // 正規表現エスケープ用
    }
};

/**
 * 状態管理変数 (State)
 */
let characters = [];          // 全キャラクターデータ
let lastFiltered = [];        // フィルタリング後のリスト
let selectedIdx = 0;          // 現在選択中のキャラのインデックス
let positionSorted = false;   // ポジション順ソートフラグ

// フィルタリング条件
let selectedGroups = new Set();
let selectedNames = new Set();
let selectedEffects = new Set();
let selectedAttrs = new Set();
let selectedRoles = new Set();
let selectedGachas = new Set();
let selectedRarities = new Set();

// 計算・表示設定
let currentAffinity = 3;      // 現在の好感度Lv
let currentMagicLv = 5;        // 現在の魔力覚醒Lv（初期ボタンのactiveと一致）
let effectMode = 'and';       // 効果検索モード ('and' | 'or')
let tabMode = 0;              // 詳細タブモード (0:比較, 1:覚醒前, 2:覚醒後)
let showImages = false;       // 画像表示フラグ

// お気に入り
let favorites = new Set();
let showFavoritesOnly = false;

// データロード排他制御
let isLoadingCharacters = false;

/**
 * DOM要素のキャッシュ
 * 頻繁にアクセスする要素を事前に取得しておくことで高速化を図る
 */
const ELS = {
    list: document.getElementById('list'),
    detail: document.getElementById('detail'),
    filter: document.getElementById('filter'),
    hitCount: document.getElementById('hit-count'),
    
    // ボタンエリア
    attrBtns: document.getElementById('attribute-btns'),
    roleBtns: document.getElementById('role-btns'),
    gachaBtns: document.getElementById('gacha-btns'),
    rarityBtns: document.getElementById('rarity-btns'),
    groupBtns: document.getElementById('group-btns'),
    nameBtns: document.getElementById('name-btns'),
    effectBtns: document.getElementById('effect-btns'),
    
    // コントロール
    captureBtn: document.getElementById('capture-btn'),
    sortBtn: document.getElementById('sort-btn'),
    imgBtn: document.getElementById("toggle-img-btn"),
    toggleRow: document.getElementById('filter-toggle-row'),
    
    // 数値表示・パネル
    affinityVal: document.getElementById('affinity-val'),
    magicVal: document.getElementById('magic-val'),
    listHeightSelect: document.getElementById('list-height-select'),
    panelBtn: document.getElementById('toggle-panel-btn'),
    controlPanel: document.getElementById('level-control-panel'),
    
    // フィルターピル
    activeFilters: document.getElementById('active-filters'),

    // Lvボタンキャッシュ（initLevelUI後に確定）
    _affinityBtns: null,
    _magicBtns: null,
    getAffinityBtns() {
        if (!this._affinityBtns) this._affinityBtns = document.querySelectorAll('.magic-btn[data-kind="affinity"]');
        return this._affinityBtns;
    },
    getMagicBtns() {
        if (!this._magicBtns) this._magicBtns = document.querySelectorAll('.magic-btn[data-kind="magic"]');
        return this._magicBtns;
    }
};

// ボタン参照保持用マップ
const roleBtnMap = {};
const attrBtnMap = {};

/**
 * HTMLエスケープ（XSS対策）
 * JSON由来テキストをinnerHTMLに挿入する際に使用
 */
function escapeHtml(str) {
    if (!str || typeof str !== 'string') return str || '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}


/* =========================================
   2. 初期化処理 (Entry Point)
   ========================================= */
document.addEventListener('DOMContentLoaded', () => {
    // 1. 動的スタイルの注入（区切り線用）
    const style = document.createElement('style');
    style.textContent = `.skill-sep { border: 0; border-bottom: 1px dashed #666; margin: 8px 0; opacity: 0.5; }`;
    document.head.appendChild(style);

    // 2. ローディング表示
    ELS.list.innerHTML = '<li class="loading-state"><div class="loading-spinner"></div>データを読み込み中...</li>';
    ELS.detail.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#128270;</div>キャラクターを選択してください</div>';

    // 3. ローカルストレージからの設定読み込み
    loadSavedSettings();

    // 4. Wi-Fi判定と画像表示設定
    checkConnectionSettings();

    // 5. UIコンポーネントの初期化
    initLevelUI();
    setupStaticButtons();
    setupOptionPanel();
    setupCaptureButton();
    setupListHeightControl();
    setupKeyboardNavigation();

    // 6. データロード開始
    loadCharacters();
});

/**
 * ローカルストレージからレベル設定を復元
 */
/**
 * レベル値を安全にパースする（'inf' / 数値 / 不正値に対応）
 */
function parseLevelValue(raw, fallback) {
    if (raw === 'inf') return 'inf';
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : fallback;
}

function loadSavedSettings() {
    const savedAff = localStorage.getItem('kage_affinity');
    const savedMag = localStorage.getItem('kage_magicLv');

    if (savedAff) currentAffinity = parseLevelValue(savedAff, 3);
    if (savedMag) currentMagicLv = parseLevelValue(savedMag, 5);

    // お気に入り読み込み
    try {
        const savedFav = localStorage.getItem('kage_favorites');
        if (savedFav) favorites = new Set(JSON.parse(savedFav));
    } catch (e) { /* ignore */ }
}

/**
 * ネットワーク状況に応じた画像表示の自動切替
 */
function checkConnectionSettings() {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const isWifi = conn && conn.type === 'wifi';

    if (isWifi) {
        showImages = true; // Wi-Fi環境下なら自動ON（保存はしない）
    } else {
        // モバイル回線等では保存された設定を使用（デフォルトOFF）
        showImages = localStorage.getItem('kage_show_img') === 'true';
    }

    if (ELS.imgBtn) {
        ELS.imgBtn.textContent = showImages ? "画像: ON" : "画像: OFF";
        ELS.imgBtn.classList.toggle("active", showImages);
    }
}


/* =========================================
   3. レベル操作・計算ロジック
   ========================================= */

/**
 * レベル表示UIの初期描画
 */
function initLevelUI() {
    updateLevelDisplay('affinity', currentAffinity);
    updateLevelDisplay('magic', currentMagicLv);

    // Lvボタンのクリックをイベント委譲で処理
    const panel = document.getElementById('level-control-panel');
    if (panel) {
        panel.addEventListener('click', (e) => {
            const btn = e.target.closest('.magic-btn');
            if (!btn) return;
            const kind = btn.dataset.kind;
            const lv = btn.dataset.lv === 'inf' ? 'inf' : parseInt(btn.dataset.lv);
            if (kind === 'affinity') setAffinity(lv);
            else if (kind === 'magic') setMagicLv(lv);
        });
    }
}

function safeSetItem(key, value) {
    try { localStorage.setItem(key, value); }
    catch (e) { console.warn('localStorage quota exceeded:', key); }
}

function setAffinity(lv) {
    currentAffinity = lv;
    safeSetItem('kage_affinity', lv);
    updateLevelDisplay('affinity', lv);
    refreshDetail();
}

function setMagicLv(lv) {
    currentMagicLv = lv;
    safeSetItem('kage_magicLv', lv);
    updateLevelDisplay('magic', lv);
    refreshDetail();
}

/**
 * レベル表示（数値テキストとボタンのアクティブ化）の更新
 */
function updateLevelDisplay(type, lv) {
    const el = type === 'affinity' ? ELS.affinityVal : ELS.magicVal;
    const btns = type === 'affinity' ? ELS.getAffinityBtns() : ELS.getMagicBtns();
    
    if(el) el.textContent = (lv === 'inf') ? '∞' : lv;
    
    btns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lv == lv);
    });
}

/**
 * 詳細画面の再描画（レベル変更時などに呼び出し）
 */
function refreshDetail() {
    if(lastFiltered.length > 0 && lastFiltered[selectedIdx]) {
        // 検索キーワードハイライトを維持しつつ再描画
        showDetail(lastFiltered[selectedIdx], getCurrentFilterKeywords());
    }
}

/**
 * テキスト内の変動値を現在のレベルに基づいて置換・計算する
 * @param {string} text - 対象テキスト（例: "威力{100, 200}%"）
 * @param {string} type - 計算タイプ ('affinity' | 'magic')
 * @returns {string} 計算後のHTML文字列
 */
function replaceDynamicValues(text, type) {
    if (!text) return text;
    
    return text.replace(CONFIG.REGEX.dynamicVal, (match, minStr, maxStr) => {
        const min = parseFloat(minStr);
        const max = parseFloat(maxStr);
        let val;
        let isInf = false;

        if (type === 'affinity') {
            // 好感度ボーナス計算（線形補間）
            if (currentAffinity === 'inf') {
                isInf = true;
            } else {
                // Lv1=min, Lv10=max -> 9ステップ
                const step = (max - min) / 9;
                val = min + (step * (currentAffinity - 1));
            }
        } else {
            // 魔力覚醒ボーナス計算（段階的）
            if (currentMagicLv === 'inf') {
                isInf = true;
            } else {
                const diff = (max - min) / 2;
                if (currentMagicLv <= 2) val = min;
                else if (currentMagicLv <= 4) val = min + diff;
                else val = max;
            }
        }
        
        // ハイライト付きで数値を返す
        if (isInf) {
            return `<span class="lv-highlight">${min.toFixed(2)}～${max.toFixed(2)}</span>`;
        }
        return `<span class="lv-highlight">${val.toFixed(2)}</span>`; 
    });
}


/* =========================================
   4. UIセットアップ (ボタン・フィルタ)
   ========================================= */

function setupStaticButtons() {
    // --- ロール (Role) ボタン ---
    const roleFrag = document.createDocumentFragment();
    CONFIG.roles.forEach(role => {
        const btn = document.createElement('button');
        btn.textContent = role;
        btn.className = "attr-btn role-btn";
        
        btn.setAttribute('aria-pressed', 'false');
        btn.onclick = () => {
            if (selectedRoles.has(role)) selectedRoles.delete(role);
            else selectedRoles.add(role);
            btn.setAttribute('aria-pressed', selectedRoles.has(role) ? 'true' : 'false');
            updateRoleBtnColors();
            updateList(true);
        };
        roleFrag.appendChild(btn);
        roleBtnMap[role] = btn;
    });
    ELS.roleBtns.appendChild(roleFrag);

    // --- 属性 (Attribute) ボタン ---
    const attrFrag = document.createDocumentFragment();
    ["赤","緑","黄","青"].forEach(attr => {
        const btn = document.createElement('button');
        btn.textContent = attr;
        btn.className = "attr-btn";
        
        btn.setAttribute('aria-pressed', 'false');
        btn.onclick = () => {
            if (selectedAttrs.has(attr)) selectedAttrs.delete(attr);
            else selectedAttrs.add(attr);
            btn.setAttribute('aria-pressed', selectedAttrs.has(attr) ? 'true' : 'false');
            updateAttrBtnColors();
            updateList(true);
        };
        attrFrag.appendChild(btn);
        attrBtnMap[attr] = btn;
    });
    ELS.attrBtns.appendChild(attrFrag);
    updateAttrBtnColors();

    // --- 各種トグル開閉ボタン ---
    createToggleBtn("name-toggle-btn", "キャラ名▼", "name-btns");
    createToggleBtn("group-toggle-btn", "グループ▼", "group-btns");
    createToggleBtn("effect-toggle-btn", "効果▼", "effect-btns");
    createToggleBtn("gacha-toggle-btn", "ガチャ▼", "gacha-btns");
    createToggleBtn("rarity-toggle-btn", "レア度▼", "rarity-btns");

    // --- 画像ON/OFFボタン ---
    if (ELS.imgBtn) {
        ELS.imgBtn.onclick = () => {
            showImages = !showImages;
            ELS.imgBtn.textContent = showImages ? "画像: ON" : "画像: OFF";
            ELS.imgBtn.classList.toggle("active", showImages);
            
            // Wi-Fiでない場合のみ設定を保存（意図しないギガ消費を防ぐ配慮）
            const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
            const isWifi = conn && conn.type === 'wifi';
            if (!isWifi) {
                safeSetItem('kage_show_img', showImages);
            }

            updateList(false); // リスト再描画（画像枠の生成/削除）
        };
    }

    // --- お気に入りフィルタボタン ---
    const favBtn = document.createElement('button');
    favBtn.id = 'fav-filter-btn';
    favBtn.textContent = '★';
    favBtn.title = 'お気に入りのみ表示';
    favBtn.onclick = () => {
        showFavoritesOnly = !showFavoritesOnly;
        favBtn.classList.toggle('active', showFavoritesOnly);
        updateList(true);
    };
    const buttonGroup = document.querySelector('.button-group');
    if (buttonGroup) buttonGroup.prepend(favBtn);

    // --- ソートボタン ---
    ELS.sortBtn.onclick = () => {
        positionSorted = !positionSorted;
        ELS.sortBtn.setAttribute("aria-pressed", positionSorted ? "true" : "false");
        updateList(true);
    };

    // --- 検索ボックス (Debounce処理付き) ---
    let searchTimeout;
    ELS.filter.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        ELS.list.classList.add('is-searching');
        searchTimeout = setTimeout(() => {
            ELS.list.classList.remove('is-searching');
            updateList(true);
        }, 300);
    });
}

/**
 * 開閉トグルボタンを作成するヘルパー
 */
function createToggleBtn(id, text, targetId) {
    const btn = document.createElement('button');
    btn.id = id;
    btn.textContent = text;
    btn.className = "attr-btn toggle-btn";
    
    const panel = document.getElementById(targetId);
    btn.onclick = () => {
        panel.classList.toggle('is-open');
        btn.textContent = panel.classList.contains('is-open') ? text.replace('▼', '▲') : text;
    };
    ELS.toggleRow.appendChild(btn);
}

/**
 * ボタン群の選択状態に応じてスタイルを更新する汎用関数
 */
function updateBtnColors(btnMap, selectedSet, colorFn) {
    for (const [key, btn] of Object.entries(btnMap)) {
        if (!btn) continue;
        const isSelected = selectedSet.has(key);
        btn.classList.toggle('is-selected', isSelected);
        // 属性ボタンは動的な色が必要なためインラインスタイルを維持
        if (colorFn && isSelected) {
            btn.style.background = colorFn(key);
        } else if (colorFn) {
            btn.style.background = '';
        }
    }
}

function updateRoleBtnColors() {
    updateBtnColors(roleBtnMap, selectedRoles, null);
}

function updateAttrBtnColors() {
    updateBtnColors(attrBtnMap, selectedAttrs, (attr) => CONFIG.attributes[attr]);
}



/* =========================================
   5. 検索・リスト表示ロジック
   ========================================= */

/**
 * 検索窓の入力を正規化して配列で返す
 */
function getCurrentFilterKeywords() {
    return ELS.filter.value
        .normalize('NFKC')
        .toLowerCase()
        .replace(/　/g, ' ')
        .trim()
        .split(/[ ]+/)
        .filter(k => k);
}

/**
 * DOMツリー内のテキストノードを走査してキーワードをハイライト（<span>タグ化）する
 */
function applyHighlightDOM(root, keywords) {
    if (!root || !keywords || !keywords.length) return;
    
    // 安全なキーワードリスト作成（エスケープ処理）
    const safeWords = keywords
        .filter(k => k && k.trim())
        .slice(0, 10)
        .map(k => k.replace(CONFIG.REGEX.unsafeChars, '\\$&'));

    if (!safeWords.length) return;

    const splitRegex = new RegExp(`(${safeWords.join('|')})`, 'gi');
    const testRegex = new RegExp(`^(${safeWords.join('|')})$`, 'i');

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            // 親が既にハイライト済み要素の場合はスキップ
            if (!node.parentElement || node.parentElement.closest('.hit') || !node.nodeValue.trim()) {
                return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
        }
    });

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    nodes.forEach(node => {
        const parts = node.nodeValue.split(splitRegex);
        if (parts.length > 1) {
            const frag = document.createDocumentFragment();
            parts.forEach(part => {
                if (testRegex.test(part)) {
                    const span = document.createElement('span');
                    span.className = 'hit';
                    span.textContent = part;
                    frag.appendChild(span);
                } else {
                    frag.appendChild(document.createTextNode(part));
                }
            });
            node.parentNode.replaceChild(frag, node);
        }
    });
}

/**
 * キャラクターリストの更新（フィルタリング実行）
 * @param {boolean} resetSelect - 選択状態をリセットして先頭を表示するか
 */
function updateList(resetSelect=false) {
    const filterKeywords = getCurrentFilterKeywords();

    // 項目指定検索用のマッピング (例: "特技:攻撃" で skill1/2 を検索)
    const fieldMap = {
        "特殊": ["traits"], 
        "特技": ["skill1", "skill2"], 
        "奥義": ["ultimate","ex_ultimate"],
        "魔道具": ["magic_item1", "magic_item2"], 
        "コンボ": ["combo"], 
        "通常": ["normal_attack"]
    };

    // --- フィルタリング実行 ---
    let filtered = characters.filter(char => {
        if (!char._search) return false;

        // 0. お気に入りフィルタ
        if (showFavoritesOnly && !favorites.has(String(char.CharacterID))) return false;

        // 1. テキスト検索（キーワードごとのAND検索）
        const matchKeywords = filterKeywords.every(token => {
            // コロンを含む場合は特定フィールド検索
            if (token.includes(':') || token.includes('：')) {
                let [key, val] = token.split(CONFIG.REGEX.splitColon);
                const targetProps = fieldMap[key];
                if (targetProps && val) {
                    return targetProps.some(prop => {
                        const data = char[prop];
                        return data && JSON.stringify(data).toLowerCase().includes(val);
                    });
                }
            }
            // 通常検索：事前生成した _search 文字列に対して検索
            return char._search.includes(token);
        });
        if (!matchKeywords) return false;

        // 2. ボタンフィルタ判定
        if (selectedAttrs.size > 0 && !selectedAttrs.has(char.attribute)) return false;
        if (selectedRoles.size > 0 && !selectedRoles.has(char.role)) return false;
        if (selectedGachas.size > 0 && !selectedGachas.has(char.gacha)) return false;
        if (selectedRarities.size > 0 && !selectedRarities.has(char.rarity)) return false;
        if (selectedGroups.size > 0 && !(char.group || []).some(g => selectedGroups.has(g))) return false;
        
        // 名前フィルタ（バリエーション違いを同一視）
        if (selectedNames.size > 0) {
            const cleanName = char.name.split('[')[0].trim();
            const names = cleanName.split(CONFIG.REGEX.splitName).map(n => n.trim());
            if (!names.some(n => selectedNames.has(n))) return false;
        }

        // 効果フィルタ（AND/OR モード対応）
        if (selectedEffects.size > 0) {
            const charEffects = new Set(char._effects || []);
            if (effectMode === 'and') {
                for (const e of selectedEffects) if (!charEffects.has(e)) return false;
            } else {
                let hit = false;
                for (const e of selectedEffects) if (charEffects.has(e)) { hit = true; break; }
                if (!hit) return false;
            }
        }
        return true;
    });

    // --- ソート ---
    if (positionSorted) {
        filtered.sort((a,b) => (parseInt(a.position)||999) - (parseInt(b.position)||999));
    }

    // --- 結果反映 ---
    lastFiltered = filtered;
    ELS.hitCount.textContent = `ヒット件数: ${filtered.length}件`;

    // 詳細画面でハイライトするためのキーワード抽出（コロン除去）
    const highlightKeywords = filterKeywords.map(k => {
        if (k.includes(':') || k.includes('：')) return k.split(CONFIG.REGEX.splitColon)[1];
        return k;
    }).filter(k => k);

    // --- DOM生成 ---
    const scrollTop = ELS.list.scrollTop;
    ELS.list.innerHTML = "";
    const fragment = document.createDocumentFragment();

    filtered.forEach((char, idx) => {
        const li = document.createElement('li');

        // 0. 属性カラードット
        const attrDot = document.createElement('span');
        attrDot.className = 'attr-dot';
        const dotColor = CONFIG.attributes[char.attribute] || '#888';
        attrDot.style.color = dotColor;
        attrDot.style.background = dotColor;
        li.appendChild(attrDot);

        // 1. お気に入りスター
        const charId = String(char.CharacterID);
        const favStar = document.createElement('span');
        favStar.className = 'fav-star' + (favorites.has(charId) ? ' is-fav' : '');
        favStar.textContent = favorites.has(charId) ? '★' : '☆';
        favStar.onclick = (e) => {
            e.stopPropagation();
            toggleFavorite(charId);
        };
        li.appendChild(favStar);

        // 2. 名前の前：通常画像 (name.webp)
        if (showImages) {
            const imgArea1 = document.createElement('div');
            imgArea1.className = 'list-img-area';

            const img1 = document.createElement('img');
            img1.src = `image/characters/${char.name}.webp`;
            img1.className = 'list-img';
            img1.loading = 'lazy';
            img1.onerror = () => img1.style.visibility = 'hidden';
            imgArea1.appendChild(img1);
            li.appendChild(imgArea1);
        }

        // 3. キャラ名
        const nameSpan = document.createElement('span');
        nameSpan.textContent = char.name;
        nameSpan.className = 'list-name';
        applyHighlightDOM(nameSpan, highlightKeywords);
        li.appendChild(nameSpan);

        // 4. 文字の右：Ex画像 (name_Ex.webp)
        // Ex画像は全キャラ分は存在しない (現状2キャラのみ)。
        // JSON の has_ex フラグで出し分け、無駄な 404 を防止
        if (showImages && char.has_ex) {
            const img2 = document.createElement('img');
            img2.src = `image/characters/${char.name}_Ex.webp`;
            img2.className = 'list-img-ex';
            img2.loading = 'lazy';
            img2.onerror = () => img2.style.visibility = 'hidden';
            li.appendChild(img2);
        }

        li.onclick = () => { 
            tabMode = 0; 
            showDetail(char, highlightKeywords); 
            selectedIdx = idx; 
            highlightSelected(); 
        };
        fragment.appendChild(li);
    });

    ELS.list.appendChild(fragment);

    // フィルタ更新時のスクロール位置保持
    if (!resetSelect) {
        ELS.list.scrollTop = scrollTop;
    }

    // フィルタ結果の先頭（または選択中）を表示
    if(filtered.length) {
        if(resetSelect) selectedIdx = 0;
        selectedIdx = Math.min(Math.max(selectedIdx, 0), filtered.length - 1);
        showDetail(filtered[selectedIdx], highlightKeywords);
        highlightSelected();
    } else {
        // 空状態メッセージ
        if (characters.length > 0) {
            ELS.list.innerHTML = '<li class="loading-state" style="flex-direction:column; gap:4px;">該当するキャラクターが見つかりません<span style="font-size:0.8em; opacity:0.6;">フィルタ条件を変えてみてください</span></li>';
            ELS.detail.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#128270;</div>該当するキャラクターが見つかりません</div>';
        }
        if (ELS.captureBtn) ELS.captureBtn.classList.add('is-hidden');
    }

    // フィルタピル更新
    updateActiveFilterPills();
}

/**
 * 選択中のリストアイテムをCSSクラスで強調
 */
function highlightSelected() {
    const items = ELS.list.children;
    for (let i = 0; i < items.length; i++) {
        if (i === selectedIdx) items[i].classList.add('selected');
        else items[i].classList.remove('selected');
    }
}


/* =========================================
   6. 詳細表示ロジック (HTML構築)
   ========================================= */

/**
 * コンボ情報のHTMLブロック生成
 */
function comboBlock(combo, filter=[]) {
    let res = "";
    if (Array.isArray(combo)) {
        res = combo
            .map(row => (typeof row === 'object') ? (row.effect ?? '') : row)
            .filter(text => text && text !== "-")
            .map(text => `<div class="combo-row" style="border:none !important;"><div class="combo-effect">${text}</div></div>`)
            .join('<hr class="skill-sep">');
    } 
    else if (typeof combo === 'object' && combo !== null) {
        const effect = combo.effect ?? '';
        if (effect && effect !== "-") res = `<div class="combo-row" style="border:none !important;"><div class="combo-effect">${effect}</div></div>`;
    } 
    else {
        const text = combo || '';
        if (text && text !== "-") res = `<div class="combo-row" style="border:none !important;"><div class="combo-effect">${text}</div></div>`;
    }
    return replaceDynamicValues(res, 'affinity');
}

/**
 * スキルオブジェクトからテキストデータを抽出するヘルパー
 */
function extractSkillText(skill, isMagic, tabType) {
    if (typeof skill === 'string') return { raw: skill, name: '' };
    if (typeof skill !== 'object') return { raw: '', name: '' };

    const name = skill.title || skill.name || '';
    if (isMagic) {
        return { raw: skill.effect || skill.normal || skill.description || '', name };
    }
    if (tabType === undefined) {
        return { raw: skill.normal || '', awakened: skill.awakened || '', name };
    }
    const text = tabType === 1 ? (skill.normal || '') : (skill.awakened || '');
    return { raw: text, name };
}

/**
 * スキル情報のHTMLブロック生成（覚醒前・後を併記）
 */
function skillBlockBothInline(arr, filter=[], isMagic=false) {
    if (!arr) return "";
    if (!Array.isArray(arr)) arr = [arr];
    const type = isMagic ? 'magic' : 'affinity';
    
    return arr.map(skill => {
        if (typeof skill === "object") {
            const skillName = skill.title || skill.name || "";
            if (isMagic) {
                const text = replaceDynamicValues(skill.effect || skill.normal || skill.description || "", type);
                return `<div>${skillName ? `<b>${skillName}</b><br>` : ""}${text}</div>`;
            }
            const normal = replaceDynamicValues(skill.normal || "", type);
            const awakened = replaceDynamicValues(skill.awakened || "", type);
            
            if (awakened) {
                return `<div>${skillName ? `<b>${skillName}</b><br>` : ""}
                  <span class="effect-label normal-label">覚醒前</span>${normal}
                  <div style="border-top:1px dashed #3a3a3a; margin:6px 0; opacity:0.7;"></div>
                  <span class="effect-label awakened-label">覚醒後</span>${awakened}
                </div>`;
            } else {
                return `<div>${skillName ? `<b>${skillName}</b><br>` : ""}${normal}</div>`;
            }
        }
        const text = replaceDynamicValues(skill, type);
        return (text === "-") ? "" : `<div>${text}</div>`;
    }).filter(html => html !== "").join('<hr class="skill-sep">');
}

/**
 * スキル情報のHTMLブロック生成（比較タブ用）
 */
function skillBlockCompare(arr, filter=[], tabType=0, isMagic=false) {
    if (!arr) return "";
    if (!Array.isArray(arr)) arr = [arr];
    const calcType = isMagic ? 'magic' : 'affinity';
    
    return arr.map(skill => {
        let rawText = "";
        if (isMagic) {
            if (typeof skill === "string") rawText = skill;
            else if (typeof skill === "object") rawText = skill.title ? `<b>${skill.title}</b><br>${skill.effect||skill.normal||""}` : (skill.effect||skill.normal||"");
        } else {
            if (typeof skill === "string") rawText = skill;
            else if ("title" in skill) rawText = `<b>${skill.title}</b><br>${tabType===1 ? skill.normal : skill.awakened}`;
            else rawText = tabType===0 ? (skill.normal || "") : (skill.awakened || "");
        }
        if (rawText === "-") return "";
        return replaceDynamicValues(rawText, calcType);
    }).filter(s => s !== "").join('<hr class="skill-sep">'); 
}

/**
 * キャラクターの詳細を表示するメイン関数
 * @param {Object} char - 表示するキャラクターオブジェクト
 * @param {Array} filter - ハイライト用キーワード配列
 */
function showDetail(char, filter = []) {
    if (!char) {
        ELS.detail.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#128270;</div>キャラクターを選択してください</div>';
        if (ELS.captureBtn) ELS.captureBtn.classList.add('is-hidden');
        return;
    }

    // URLパラメータ更新（共有用）
    if (char.position) {
        const url = new URL(window.location);
        url.searchParams.set('pos', char.position);
        window.history.replaceState({}, '', url);
    }

    const attrColor = CONFIG.attributes[char.attribute] || "#E0E0E0";
    const highlightDetail = (val) => escapeHtml(val);

    // --- 画像表示セクション (動き停止 & サイズ最適化) ---
    // Ex画像は has_ex が true のキャラだけ出力して 404 を防ぐ
    let imageHtml = "";
    if (showImages) {
        const base = "image/characters/";
        const imgData = [{ src: `${base}${char.name}.webp`, suffix: "" }];
        if (char.has_ex) {
            imgData.push({ src: `${base}${char.name}_Ex.webp`, suffix: " Ex" });
        }

        imageHtml = `
        <div class="char-image-container">
            ${imgData.map(img => `
                <img
                    src="${img.src}"
                    alt="${char.name}${img.suffix}"
                    class="char-image"
                    crossorigin="anonymous"
                    loading="lazy"
                    decoding="async"
                    onerror="this.style.display='none';"
                >`).join("")}
        </div>`;
    }

    const attributeClass = (attr) => ({"赤": "attr-red", "緑": "attr-green", "黄": "attr-yellow", "青": "attr-blue"}[attr] || "");

    // --- 基本情報（タイトル、属性、ロールなど） ---
    // 上下の隙間(padding/margin)を調整してコンパクトに表示
    let mainContent = `
    <div class="char-detail-wrap">
        <div class="char-title" style="color:${attrColor};">
            ${highlightDetail(char.name)}
        </div>
        ${imageHtml}

        <div class="char-info-grid">
            <div class="char-info-row-top">
                <div class="char-info-item">
                    <span class="char-label">属性</span>
                    <span class="char-value ${attributeClass(char.attribute)}">${highlightDetail(char.attribute)}</span>
                </div>
                <div class="char-info-item">
                    <span class="char-label">ロール</span>
                    <span class="char-value">${highlightDetail(char.role)}</span>
                </div>
                <div class="char-info-item">
                    <span class="char-label">ポジション</span>
                    <span class="char-value">${highlightDetail(char.position)}</span>
                </div>
                <div class="char-info-item">
                    <span class="char-label">レア度</span>
                    <span class="char-value">${highlightDetail(char.rarity)}</span>
                </div>
                <div class="char-info-item">
                    <span class="char-label">ガチャ</span>
                    <span class="char-value">${highlightDetail(char.gacha)}</span>
                </div>
            </div>
            <div class="char-info-row-bottom">
                <div class="char-info-item char-info-wide">
                    <span class="char-label">グループ</span>
                    <span class="char-value char-value-plain">${(char.group || []).map(escapeHtml).join(', ')}</span>
                </div>
                <div class="char-info-item char-info-wide">
                    <span class="char-label">覚醒</span>
                    <span class="char-value char-value-plain">${escapeHtml(char.arousal)}</span>
                </div>
            </div>
        </div>`;

    // --- スキルセクション構築ヘルパー ---
    const sect = (title, data, isMag = false) => {
        if (!data || (Array.isArray(data) && data.length === 0)) return "";
        let content;
        if (tabMode === 0) content = skillBlockBothInline(data, filter, isMag);
        else if (tabMode === 1) content = skillBlockCompare(data, filter, 1, isMag);
        else content = skillBlockCompare(data, filter, 2, isMag);
        
        if (!content) return "";
        return `
        <div class="char-section" style="border-left:3px solid ${attrColor};">
            <div class="char-section-title" style="color:${attrColor}; border-left-color:${attrColor};">${title}</div>
            <div class="char-section-content">${content}</div>
        </div>`;
    };

    // --- 各スキルの結合 ---
    mainContent += `
        ${sect("究極奥義", char.ex_ultimate)}
        ${sect("奥義", char.ultimate)}
        ${sect("特技1", char.skill1)}
        ${sect("特技2", char.skill2)}
        ${sect("特殊", char.traits)}
        <div class="char-section" style="border-left:3px solid ${attrColor};">
            <div class="char-section-title" style="color:${attrColor}; border-left-color:${attrColor};">コンボ</div>
            <div class="char-section-content">${comboBlock(char.combo, filter)}</div>
        </div>
        ${sect("通常攻撃", char.normal_attack)}
        ${sect("魔道具1", char.magic_item1, true)}
        ${sect("魔道具2", char.magic_item2, true)}
    </div>`;

    ELS.detail.innerHTML = mainContent;
    
    // --- タブ生成 ---
    const tabRange = document.createRange().createContextualFragment(`
    <div class="tabs-wrap" id="detail-tabs">
      <div class="tabs-buttons" role="tablist">
        <button class="tabs-btn${tabMode===0?' active':''}" id="tab-both" role="tab" aria-selected="${tabMode===0}">比較</button>
        <button class="tabs-btn${tabMode===1?' active':''}" id="tab-normal" role="tab" aria-selected="${tabMode===1}">覚醒前</button>
        <button class="tabs-btn${tabMode===2?' active':''}" id="tab-awakened" role="tab" aria-selected="${tabMode===2}">覚醒後</button>
      </div>
    </div>`);
    ELS.detail.prepend(tabRange);
    
    document.getElementById('tab-both').onclick = () => { tabMode = 0; showDetail(char, filter); };
    document.getElementById('tab-normal').onclick = () => { tabMode = 1; showDetail(char, filter); };
    document.getElementById('tab-awakened').onclick = () => { tabMode = 2; showDetail(char, filter); };

    // 生成後のDOMに対してハイライト適用
    applyHighlightDOM(ELS.detail, filter);
    
    if (ELS.captureBtn) ELS.captureBtn.classList.remove('is-hidden');
}


/* =========================================
   7. データ読み込み・動的ボタン生成
   ========================================= */

/**
 * JSONデータの取得とキャッシュ管理
 */
async function loadCharacters() {
    if (isLoadingCharacters) return;
    isLoadingCharacters = true;

    const jsonUrl = 'characters/all_characters.json';
    const cacheKeyData = 'kage_char_data_v3';
    const cacheKeyTime = 'kage_char_time_v3';

    try {
        // 更新確認 (HEADリクエスト)
        const headResp = await fetch(jsonUrl, { method: 'HEAD' });
        if (!headResp.ok) throw new Error("Network response was not ok");
        
        const serverLastModified = headResp.headers.get('Last-Modified');
        const localLastModified = localStorage.getItem(cacheKeyTime);
        const localData = localStorage.getItem(cacheKeyData);

        // キャッシュが有効ならそれを使用
        if (localData && localLastModified && serverLastModified === localLastModified) {
            characters = JSON.parse(localData);
            prepareSearchData(); // ★修正: キャッシュ時も検索用データを構築する
            initButtons();
            handleUrlParameter();
            return; 
        }

        console.log("Downloading new data...");
        const resp = await fetch(jsonUrl);
        if(resp.ok){
            characters = await resp.json();

            // 検索・効果フィルタ用の事前データ処理
            prepareSearchData();

            // キャッシュ保存
            try {
                localStorage.setItem(cacheKeyData, JSON.stringify(characters));
                localStorage.setItem(cacheKeyTime, serverLastModified);
            } catch (e) { console.warn("Cache quota exceeded", e); }

            initButtons();
            handleUrlParameter();
        }
    } catch (err) {
        console.error("Failed to load characters:", err);

        // キャッシュフォールバック: ネットワーク失敗時にlocalStorageのデータを使用
        const cachedData = localStorage.getItem(cacheKeyData);
        if (cachedData) {
            try {
                characters = JSON.parse(cachedData);
                prepareSearchData();
                initButtons();
                handleUrlParameter();
                console.log("Using cached data as fallback");
                return;
            } catch (parseErr) {
                console.error("Cache parse failed:", parseErr);
            }
        }

        if (ELS.list) {
            ELS.list.innerHTML = `<li class="loading-state" style="flex-direction:column; gap:8px; color:#f88;">
                <div>データの読み込みに失敗しました。</div>
                <button id="retry-load-btn" style="padding:8px 20px; background:#2c5d8a; color:#fff; border:none; border-radius:6px; cursor:pointer; font-size:0.9em;">再読み込み</button>
            </li>`;
            const retryBtn = document.getElementById('retry-load-btn');
            if (retryBtn) retryBtn.onclick = () => {
                ELS.list.innerHTML = '<li class="loading-state"><div class="loading-spinner"></div>データを読み込み中...</li>';
                loadCharacters();
            };
        }
    } finally {
        isLoadingCharacters = false;
    }
}

/**
 * 検索やフィルタ高速化のために、各キャラに検索用文字列と効果リストを付与する
 */
function prepareSearchData() {
    const extractEffects = (text, targetSet) => {
        if (!text || typeof text !== 'string') return;
        const matches = text.matchAll(CONFIG.REGEX.effects);
        for (const m of matches) targetSet.add(m[1].trim());
    };
    
    const processSkillData = (data, targetSet) => {
        if (!data) return;
        if (Array.isArray(data)) {
            data.forEach(item => processSkillData(item, targetSet));
        } else if (typeof data === 'object') {
            extractEffects(data.normal, targetSet);
            extractEffects(data.awakened, targetSet);
            extractEffects(data.effect, targetSet);
            extractEffects(data.description, targetSet);
        } else if (typeof data === 'string') {
            extractEffects(data, targetSet);
        }
    };

    // オブジェクト/配列から文字列値のみを再帰的に抽出（JSONキー名を除外）
    const extractText = (val) => {
        if (!val) return '';
        if (typeof val === 'string') return val;
        if (Array.isArray(val)) return val.map(extractText).join(' ');
        if (typeof val === 'object') return Object.values(val).map(extractText).join(' ');
        return '';
    };

    characters.forEach(c => {
        // 全文検索用文字列の生成（必要なフィールドのみ結合し、誤検索・肥大化を防ぐ）
        c._search = [
            c.name,
            c.attribute,
            c.role,
            String(c.position || ''),
            c.arousal || '',
            (c.group || []).join(' '),
            c.aliases ? (Array.isArray(c.aliases) ? c.aliases.join(' ') : c.aliases) : '',
            extractText(c.ultimate),
            extractText(c.ex_ultimate),
            extractText(c.skill1),
            extractText(c.skill2),
            extractText(c.traits),
            extractText(c.combo),
            extractText(c.magic_item1),
            extractText(c.magic_item2),
            extractText(c.normal_attack)
        ].join(' ').toLowerCase();
        
        // 効果（『』で囲まれた文字）の抽出
        const effectSet = new Set();
        [c.ultimate, c.ex_ultimate, c.skill1, c.skill2, c.traits, c.combo, c.magic_item1, c.magic_item2].forEach(t => processSkillData(t, effectSet));
        c._effects = Array.from(effectSet);
    });
}

/**
 * URLパラメータ ?pos=XXX を解析して初期表示を行う
 */
function handleUrlParameter() {
    const params = new URLSearchParams(window.location.search);
    const targetPos = params.get('pos');

    if (targetPos) {
        const targetChar = characters.find(c => String(c.position) === targetPos);
        if (targetChar) {
            updateList(true); // 一度全リスト生成

            // 生成リスト内での位置を特定
            const idx = lastFiltered.findIndex(c => String(c.position) === targetPos);
            if (idx !== -1) {
                selectedIdx = idx;
                showDetail(targetChar, []);
                highlightSelected();
                
                // 該当要素までスクロール
                const targetLi = ELS.list.children[idx];
                if (targetLi) {
                    targetLi.scrollIntoView({ block: 'nearest' });
                }
                return;
            }
        }
    }
    // パラメータなし or 該当なしの場合は通常表示
    updateList(true);
}

function initButtons() {
    setupGroupButtons();
    setupNameButtons();
    setupEffectButtons();
    setupGachaButtons();
    setupRarityButtons();
}

/**
 * ソート優先度判定 (漢字 > カタカナ > ひらがな 等)
 */
function customSort(a, b, type) {
    const getSortPriority = (text, type) => {
        if (!text) return 99;
        const charCode = text.charCodeAt(0);
        const isKanji = (charCode >= 0x4e00 && charCode <= 0x9fff);
        const isKatakana = (charCode >= 0x30a0 && charCode <= 0x30ff);
        const isHiragana = (charCode >= 0x3040 && charCode <= 0x309f);

        if (type === 'group') {
            if (isKanji) return 1;
            if (isKatakana) return 2;
            if (isHiragana) return 3;
            return 4;
        } else if (type === 'name') {
            if (isKatakana) return 1;
            if (isKanji) return 2;
            return 3;
        }
        return 99;
    };
    const priorityA = getSortPriority(a, type);
    const priorityB = getSortPriority(b, type);
    if (priorityA !== priorityB) return priorityA - priorityB;
    return a.localeCompare(b, 'ja');
}

function setupGachaButtons() {
    const container = ELS.gachaBtns;
    container.innerHTML = "";
    ["フェス","恒常","季節","コラボ"].forEach(g => {
        const btn = document.createElement('button');
        btn.textContent = g; btn.className = "group-btn";
        btn.onclick = () => {
            btn.classList.toggle('active');
            if (selectedGachas.has(g)) selectedGachas.delete(g); else selectedGachas.add(g);
            updateList(true);
        };
        container.appendChild(btn);
    });
}

function setupRarityButtons() {
    const container = ELS.rarityBtns;
    container.innerHTML = "";
    ["SS","S","A"].forEach(r => {
        const btn = document.createElement('button');
        btn.textContent = r; btn.className = "group-btn";
        btn.onclick = () => {
            btn.classList.toggle('active');
            if (selectedRarities.has(r)) selectedRarities.delete(r); else selectedRarities.add(r);
            updateList(true);
        };
        container.appendChild(btn);
    });
}

function setupGroupButtons() {
    const container = ELS.groupBtns;
    container.innerHTML = "";
    const allGroups = new Set();
    characters.forEach(char => char.group?.forEach(g => allGroups.add(g)));
    
    Array.from(allGroups)
        .sort((a, b) => customSort(a, b, 'group'))
        .forEach(g => {
            const btn = document.createElement('button');
            btn.textContent = g; btn.className = "group-btn";
            btn.onclick = () => {
                btn.classList.toggle('active');
                if (selectedGroups.has(g)) selectedGroups.delete(g); else selectedGroups.add(g);
                updateList(true);
            };
            container.appendChild(btn);
        });
}

function setupNameButtons() {
    const container = ELS.nameBtns;
    container.innerHTML = "";
    const allNames = new Set();
    characters.forEach(c => c.name.split('[')[0].split(CONFIG.REGEX.splitName).forEach(n => allNames.add(n.trim())));
    
    Array.from(allNames)
        .sort((a, b) => customSort(a, b, 'name'))
        .forEach(n => {
            const btn = document.createElement('button');
            btn.textContent = n; btn.className = "group-btn";
            btn.onclick = () => {
                btn.classList.toggle('active');
                if (selectedNames.has(n)) selectedNames.delete(n); else selectedNames.add(n);
                updateList(true);
            };
            container.appendChild(btn);
        });
}

function setupEffectButtons() {
    const container = ELS.effectBtns;
    container.innerHTML = "";
    
    // AND/OR 切り替えボタン
    const modeBtn = document.createElement('button');
    modeBtn.id = "effect-mode-btn";
    modeBtn.textContent = effectMode === 'and' ? "効果検索: AND" : "効果検索: OR";
    modeBtn.className = "group-btn";
    modeBtn.style.background = "#2d6b2d";
    modeBtn.style.border = "1px solid #4b8f4b";
    modeBtn.style.color = "#fff";
    modeBtn.onclick = () => {
        effectMode = (effectMode === 'and') ? 'or' : 'and';
        modeBtn.textContent = effectMode === 'and' ? "効果検索: AND" : "効果検索: OR";
        updateList(true);
    };
    container.appendChild(modeBtn);

    const allEffects = new Set();
    characters.forEach(c => (c._effects||[]).forEach(e => allEffects.add(e)));

    Array.from(allEffects).sort((a,b) => a.localeCompare(b, 'ja')).forEach(e => {
        const btn = document.createElement('button');
        btn.textContent = e; btn.className = "group-btn";
        btn.onclick = () => {
            btn.classList.toggle('active');
            if (selectedEffects.has(e)) selectedEffects.delete(e); else selectedEffects.add(e);
            updateList(true);
        };
        container.appendChild(btn);
    });
}


/* =========================================
   8. 機能系ユーティリティ (キャプチャ・パネル・UI制御)
   ========================================= */

/**
 * html2canvas を用いたスクリーンショット撮影機能のセットアップ
 */
function setupCaptureButton() {
    if (!ELS.captureBtn) return;

    // iOS 判定（iPadOS 13+ の Mac偽装も考慮）
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    // 画像のロード完了を待つヘルパー
    const waitImagesLoaded = (root) => {
        const images = Array.from(root.querySelectorAll('img'));
        if (images.length === 0) return Promise.resolve();

        return Promise.all(images.map(img => {
            if (img.getAttribute('loading') === 'lazy') {
                img.removeAttribute('loading');
            }
            if (img.complete && img.naturalHeight !== 0) return Promise.resolve();

            return new Promise(resolve => {
                img.onload = resolve;
                img.onerror = resolve;
                if (!img.src) resolve();
                setTimeout(resolve, 2500);
            });
        }));
    };

    // キャプチャ用CSSを注入
    // - CSS変数をデスクトップ固定値に強制（html2canvas向けの色崩れ防止）
    // - モバイルメディアクエリ（max-width:700px/480px）を !important で無効化し
    //   スマホ実機でも常にデスクトップ相当のレイアウトでキャプチャされるようにする
    const CAPTURE_STYLE_ID = 'capture-override-style';
    const injectCaptureCSS = () => {
        if (document.getElementById(CAPTURE_STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = CAPTURE_STYLE_ID;
        style.textContent = `
            .capture-target,
            .capture-target * {
                --bg-primary: #101014 !important;
                --bg-secondary: #17171e !important;
                --bg-card: #1c1c24 !important;
                --bg-card-hover: #232330 !important;
                --bg-input: #1a1a22 !important;
                --bg-elevated: #212130 !important;
                --border: rgba(255, 255, 255, 0.04) !important;
                --border-light: rgba(255, 255, 255, 0.08) !important;
                --border-accent: rgba(91, 184, 214, 0.12) !important;
                --accent-glow: rgba(91, 184, 214, 0.10) !important;
                --accent-subtle: rgba(91, 184, 214, 0.05) !important;
                --gold: #c8a44e !important;
                --gold-dim: rgba(200, 164, 78, 0.10) !important;
                --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.2) !important;
                --shadow-md: 0 4px 20px rgba(0, 0, 0, 0.28) !important;
                --shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.4) !important;
                --shadow-card: 0 2px 12px rgba(0, 0, 0, 0.22) !important;
            }

            /* モバイル時のメディアクエリを打ち消してデスクトップ見た目に固定 */
            .capture-target .char-image-container {
                flex-direction: row !important;
                align-items: flex-start !important;
            }
            .capture-target .char-image {
                max-width: 35% !important;
                max-height: 150px !important;
            }
            .capture-target .char-title {
                font-size: 1.5rem !important;
            }
            .capture-target .char-section-content {
                font-size: 0.875rem !important;
                padding: 12px 16px 16px 16px !important;
            }
            .capture-target .char-info-row-top {
                flex-wrap: nowrap !important;
                gap: 12px !important;
            }
            .capture-target .effect-label {
                font-size: 0.75rem !important;
                padding: 2px 8px !important;
            }
            .capture-target .filter-pill {
                font-size: 0.75rem !important;
                padding: 2px 8px 2px 12px !important;
            }
            .capture-target .tabs-btn {
                padding: 8px 12px !important;
                font-size: 0.8125rem !important;
            }
            .capture-target .fav-star {
                font-size: 1rem !important;
                padding: 4px !important;
            }
        `;
        document.head.appendChild(style);
    };

    ELS.captureBtn.addEventListener('click', async () => {
        if (!ELS.detail) return;
        ELS.captureBtn.disabled = true;
        ELS.captureBtn.style.opacity = '0.5';

        // ファイル名生成
        const charNameElement = ELS.detail.querySelector('.char-title');
        const safeName = charNameElement ? charNameElement.textContent.trim().replace(CONFIG.REGEX.sanitize, '_') : 'detail';
        const now = new Date();
        const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
        const filename = `kage_${safeName}_${dateStr}.png`;

        let clone = null;
        let mountNode = null;
        let captureOverlay = null;
        try {
            await waitImagesLoaded(ELS.detail);

            clone = ELS.detail.cloneNode(true);
            clone.classList.add('capture-target');
            // 共通スタイル (配置スタイルは後段でマウント方式に応じて付与)
            Object.assign(clone.style, {
                width: '1100px', minWidth: '1100px', maxWidth: 'none',
                height: 'auto', padding: '20px', margin: '0',
                background: '#0f0f14', color: '#e8e8f0',
                overflow: 'visible',
                borderRadius: '0', transform: 'none',
                pointerEvents: 'none'
            });
            clone.removeAttribute('id');

            // visibility:hidden の画像を除去（レイアウトずれ防止）
            clone.querySelectorAll('img').forEach(img => {
                if (img.style.visibility === 'hidden') img.remove();
            });

            // モバイルのメディアクエリを打ち消す !important CSS を注入
            // (個別のインライン上書きではなく .capture-target 配下で一括で効かせる)
            injectCaptureCSS();

            // マウント方法を環境で分岐:
            // - iOS Safari: off-screen 配置(top:-9999px) や 1px×1px overflow:hidden ラッパーは
            //   子要素のレンダリング/レイアウトを最適化スキップさせ、scrollHeight が過小報告される。
            //   結果としてキャプチャ下部が切れるため、クローンを viewport 内に実寸でマウントし、
            //   不透明オーバーレイで視覚遮蔽する方式を取る。
            // - PC/Android: 従来通り top:-9999px の画面外配置（確実に隠れる）
            if (isIOS) {
                captureOverlay = document.createElement('div');
                Object.assign(captureOverlay.style, {
                    position: 'fixed', top: '0', left: '0',
                    width: '100vw', height: '100vh',
                    background: '#0f0f14',
                    zIndex: '99999',
                    pointerEvents: 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#e8e8f0', fontSize: '1rem', letterSpacing: '0.05em'
                });
                // html2canvas は iframe に文書ツリーをコピーしてレンダリングするため、
                // この属性を付けないとオーバーレイがクローンを覆い隠してしまう
                captureOverlay.setAttribute('data-html2canvas-ignore', 'true');
                captureOverlay.textContent = '撮影中...';
                document.body.appendChild(captureOverlay);

                Object.assign(clone.style, {
                    position: 'fixed', top: '0', left: '0', zIndex: '0'
                });
                mountNode = clone;
            } else {
                Object.assign(clone.style, {
                    position: 'absolute', top: '-9999px', left: '0', zIndex: '-9999'
                });
                mountNode = clone;
            }
            document.body.appendChild(mountNode);

            // レイアウト/フォント/画像が確定してから高さを測る:
            // - webfont 未反映だと行高が変わり測定値が小さくなる
            // - クローン直後の img は decode 待ちで 0px 扱いになりうる
            // - rAF 2 回で layout/paint の 1 サイクルを確実に跨ぐ
            if (document.fonts && document.fonts.ready) {
                try { await document.fonts.ready; } catch (_) { /* 無視 */ }
            }
            await waitImagesLoaded(clone);
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

            void clone.offsetHeight;
            const rectH = clone.getBoundingClientRect().height;
            const cloneH = Math.ceil(Math.max(clone.scrollHeight, clone.offsetHeight, rectH, 100));

            const isMobile = window.innerWidth <= 700;
            // iOS は canvas サイズ上限による淡色化を避けるため scale=1
            const captureScale = isIOS ? 1 : (isMobile ? 1.5 : 2);
            const canvas = await html2canvas(clone, {
                scale: captureScale,
                useCORS: true,
                allowTaint: false,
                logging: false,
                width: 1100,
                height: cloneH,
                windowWidth: 1100,
                windowHeight: cloneH,
                backgroundColor: '#0f0f14',
                foreignObjectRendering: false,
                imageTimeout: 15000
            });

            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            const blobUrl = URL.createObjectURL(blob);
            showCaptureOverlay(blobUrl, filename);

        } catch (err) {
            console.error("Capture Failed:", err);
            alert('キャプチャに失敗しました:\n' + (err.message || err));
        } finally {
            if (mountNode && mountNode.parentNode) mountNode.parentNode.removeChild(mountNode);
            if (captureOverlay && captureOverlay.parentNode) captureOverlay.parentNode.removeChild(captureOverlay);
            ELS.captureBtn.disabled = false;
            ELS.captureBtn.style.opacity = '';
        }
    });
}


/**
 * キャプチャ結果を表示するオーバーレイの生成
 */
function showCaptureOverlay(blobUrl, filename) {
    const existing = document.getElementById('capture-overlay');
    if (existing) {
        // 前回の blob URL を解放
        const prevImg = existing.querySelector('img');
        if (prevImg && prevImg.src.startsWith('blob:')) URL.revokeObjectURL(prevImg.src);
        existing.remove();
    }

    const overlay = document.createElement('div');
    overlay.id = 'capture-overlay';
    Object.assign(overlay.style, {
        position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
        backgroundColor: 'rgba(0,0,0,0.85)', zIndex: '10000', display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
    });

    const img = document.createElement('img');
    img.src = blobUrl;
    Object.assign(img.style, {
        maxWidth: '90%', maxHeight: '80%',
        border: '2px solid #fff', marginBottom: '15px',
        boxShadow: '0 0 20px rgba(0,0,0,0.5)',
        imageRendering: 'auto',       // ★ ブラウザ最適な縮小アルゴリズムを使用
        objectFit: 'contain'           // ★ アスペクト比維持
    });

    // ★ blob URL のクリーンアップ関数
    const cleanup = () => {
        if (blobUrl.startsWith('blob:')) URL.revokeObjectURL(blobUrl);
        overlay.remove();
    };

    const btnArea = document.createElement('div');
    const createBtn = (text, bg, action, isLink) => {
        const el = document.createElement(isLink ? 'a' : 'button');
        el.textContent = text;
        Object.assign(el.style, {
            display: 'inline-block', padding: '10px 20px', background: bg, color: '#fff',
            textDecoration: 'none', borderRadius: '5px', fontSize: '16px',
            cursor: 'pointer', margin: '0 10px', border: 'none'
        });
        if(isLink) { el.href = blobUrl; el.download = filename; }
        else el.onclick = action;
        return el;
    };

    btnArea.appendChild(createBtn('画像を保存', '#4CAF50', null, true));
    btnArea.appendChild(createBtn('閉じる', '#f44336', cleanup, false));

    overlay.appendChild(img);
    overlay.appendChild(btnArea);
    document.body.appendChild(overlay);

    // フォーカストラップ: Tab操作をオーバーレイ内に閉じ込める
    const focusableEls = overlay.querySelectorAll('a, button');
    if (focusableEls.length) focusableEls[0].focus();
    overlay.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab') return;
        const first = focusableEls[0];
        const last = focusableEls[focusableEls.length - 1];
        if (e.shiftKey) {
            if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
            if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
    });
}

/**
 * 設定パネル（レベルスライダー等）の開閉制御
 */
function setupOptionPanel() {
    if (!ELS.panelBtn || !ELS.controlPanel) return;
    
    ELS.panelBtn.onclick = () => {
        const isHidden = ELS.controlPanel.classList.contains('is-hidden');
        ELS.controlPanel.classList.toggle('is-hidden', !isHidden);
        ELS.panelBtn.classList.toggle('active', isHidden);
        ELS.panelBtn.setAttribute('aria-expanded', String(isHidden));
    };

    // パネル外クリックで閉じる処理（名前付き関数で重複登録を防止）
    function handlePanelOutsideClick(e) {
        if (ELS.controlPanel.classList.contains('is-hidden')) return;
        if (!ELS.panelBtn.contains(e.target) && !ELS.controlPanel.contains(e.target)) {
            ELS.controlPanel.classList.add('is-hidden');
            ELS.panelBtn.classList.remove('active');
            ELS.panelBtn.setAttribute('aria-expanded', 'false');
        }
    }
    document.addEventListener('click', handlePanelOutsideClick);
}

/**
 * リストの高さ自動調整制御 (Auto / 固定)
 */
function setupListHeightControl() {
    if (!ELS.listHeightSelect || !ELS.list) return;
    
    const saved = localStorage.getItem('kage_list_height');
    if (saved) ELS.listHeightSelect.value = saved;

    const updateHeight = () => {
        const val = ELS.listHeightSelect.value;
        safeSetItem('kage_list_height', val);
        
        if (val === 'auto') {
            // PC画面では残り高さを計算して埋める
            if (window.innerWidth >= 900) {
                const rect = ELS.list.getBoundingClientRect();
                const available = window.innerHeight - rect.top - 20;
                ELS.list.style.setProperty('height', `${Math.max(available, 100)}px`, 'important');
                ELS.list.style.setProperty('max-height', 'none', 'important');
            } else {
                ELS.list.style.removeProperty('height');
                ELS.list.style.removeProperty('max-height');
            }
        } else {
            // 指定行数 x 1行の高さで固定
            const count = parseInt(val);
            const first = ELS.list.querySelector('li');
            const h = first ? first.getBoundingClientRect().height : 40;
            const style = window.getComputedStyle(ELS.list);
            const extra = (parseFloat(style.paddingTop)||0) + (parseFloat(style.paddingBottom)||0) + (parseFloat(style.borderTopWidth)||0) + (parseFloat(style.borderBottomWidth)||0) + 1;
            
            ELS.list.style.setProperty('height', `${(h * count) + extra}px`, 'important');
            ELS.list.style.setProperty('max-height', 'none', 'important');
        }
    };

    let heightRafId = 0;
    const debouncedUpdateHeight = () => {
        cancelAnimationFrame(heightRafId);
        heightRafId = requestAnimationFrame(updateHeight);
    };

    ELS.listHeightSelect.addEventListener('change', updateHeight);
    window.addEventListener('resize', debouncedUpdateHeight);
    
    // 他のUI展開時に高さを再計算（transitionendで正確なタイミングを取る）
    ['toggle-panel-btn', 'group-toggle-btn', 'name-toggle-btn', 'effect-toggle-btn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener('click', () => {
            // transitionがあればその終了後、なければ即時（最大350msのフォールバック付き）
            const targetId = btn.id.replace('-toggle-btn', '-btns').replace('toggle-panel-btn', 'level-control-panel');
            const panel = document.getElementById(targetId);
            if (panel) {
                let done = false;
                const finish = () => { if (!done) { done = true; updateHeight(); } };
                panel.addEventListener('transitionend', finish, { once: true });
                setTimeout(finish, 350);
            } else {
                setTimeout(updateHeight, 50);
            }
        });
    });
    
    setTimeout(updateHeight, 100);
}


/* =========================================
   9. お気に入り機能
   ========================================= */

function toggleFavorite(charId) {
    if (favorites.has(charId)) {
        favorites.delete(charId);
    } else {
        favorites.add(charId);
    }
    saveFavorites();
    updateList(false);
}

function saveFavorites() {
    try {
        localStorage.setItem('kage_favorites', JSON.stringify([...favorites]));
    } catch (e) { /* ignore */ }
}


/* =========================================
   10. キーボードナビゲーション
   ========================================= */

function setupKeyboardNavigation() {
    function handleKeyboardNav(e) {
        // 入力フィールドにフォーカス中は矢印キーを無視（Escapeは例外）
        const activeTag = document.activeElement?.tagName;
        const isInputFocused = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT';

        if (e.key === 'Escape') {
            e.preventDefault();

            // 1. キャプチャオーバーレイを閉じる
            const overlay = document.getElementById('capture-overlay');
            if (overlay) {
                const img = overlay.querySelector('img');
                if (img && img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
                overlay.remove();
                return;
            }

            // 2. レベルパネルを閉じる
            if (ELS.controlPanel && !ELS.controlPanel.classList.contains('is-hidden')) {
                ELS.controlPanel.classList.add('is-hidden');
                if (ELS.panelBtn) {
                    ELS.panelBtn.classList.remove('active');
                    ELS.panelBtn.setAttribute('aria-expanded', 'false');
                }
                return;
            }

            // 3. ドロップダウンパネルを閉じる
            const openPanels = document.querySelectorAll('#group-btns.is-open, #name-btns.is-open, #effect-btns.is-open, #gacha-btns.is-open, #rarity-btns.is-open');
            if (openPanels.length > 0) {
                openPanels.forEach(p => p.classList.remove('is-open'));
                return;
            }

            // 4. 検索フィールドをクリア or フォーカス解除
            if (isInputFocused) {
                document.activeElement.blur();
                return;
            }
            if (ELS.filter.value) {
                ELS.filter.value = '';
                updateList(true);
                return;
            }
            return;
        }

        // 入力中は矢印/Enterを無視
        if (isInputFocused) return;
        if (!lastFiltered.length) return;

        const highlightKeywords = getCurrentFilterKeywords().map(k => {
            if (k.includes(':') || k.includes('：')) return k.split(CONFIG.REGEX.splitColon)[1];
            return k;
        }).filter(k => k);

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (selectedIdx < lastFiltered.length - 1) {
                selectedIdx++;
                tabMode = 0;
                showDetail(lastFiltered[selectedIdx], highlightKeywords);
                highlightSelected();
                scrollToSelected();
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (selectedIdx > 0) {
                selectedIdx--;
                tabMode = 0;
                showDetail(lastFiltered[selectedIdx], highlightKeywords);
                highlightSelected();
                scrollToSelected();
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (lastFiltered[selectedIdx]) {
                tabMode = 0;
                showDetail(lastFiltered[selectedIdx], highlightKeywords);
                highlightSelected();
            }
        }
    }
    document.addEventListener('keydown', handleKeyboardNav);
}

function scrollToSelected() {
    const targetLi = ELS.list.children[selectedIdx];
    if (targetLi) {
        targetLi.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
}


/* =========================================
   11. アクティブフィルタ ピル表示
   ========================================= */

function updateActiveFilterPills() {
    if (!ELS.activeFilters) return;
    const frag = document.createDocumentFragment();

    // 配列駆動のピル生成
    const pillDefs = [
        { set: selectedAttrs, label: '属性', colorFn: updateAttrBtnColors, container: null },
        { set: selectedRoles, label: 'ロール', colorFn: updateRoleBtnColors, container: null },
        { set: selectedGachas, label: 'ガチャ', colorFn: null, container: ELS.gachaBtns },
        { set: selectedRarities, label: 'レア度', colorFn: null, container: ELS.rarityBtns },
        { set: selectedGroups, label: 'グループ', colorFn: null, container: ELS.groupBtns },
        { set: selectedNames, label: 'キャラ', colorFn: null, container: ELS.nameBtns },
        { set: selectedEffects, label: '効果', colorFn: null, container: ELS.effectBtns },
    ];

    pillDefs.forEach(({ set, label, colorFn, container }) => {
        set.forEach(value => {
            frag.appendChild(createFilterPill(`${label}: ${value}`, () => {
                set.delete(value);
                if (colorFn) colorFn();
                if (container) {
                    container.querySelectorAll('.group-btn').forEach(btn => {
                        if (btn.textContent === value) btn.classList.remove('active');
                    });
                }
                updateList(true);
            }));
        });
    });

    // お気に入りフィルタ
    if (showFavoritesOnly) {
        frag.appendChild(createFilterPill('★ お気に入り', () => {
            showFavoritesOnly = false;
            const favBtn = document.getElementById('fav-filter-btn');
            if (favBtn) favBtn.classList.remove('active');
            updateList(true);
        }));
    }

    ELS.activeFilters.innerHTML = '';
    ELS.activeFilters.appendChild(frag);

    // トグルボタンのカウント表示を更新
    updateToggleBtnCounts();
}

function createFilterPill(text, onRemove) {
    const pill = document.createElement('span');
    pill.className = 'filter-pill';
    pill.textContent = text;

    const x = document.createElement('span');
    x.className = 'filter-pill-remove';
    x.textContent = '×';
    x.onclick = (e) => {
        e.stopPropagation();
        onRemove();
    };
    pill.appendChild(x);
    return pill;
}

function updateToggleBtnCounts() {
    const nameBtn = document.getElementById('name-toggle-btn');
    const groupBtn = document.getElementById('group-toggle-btn');
    const effectBtn = document.getElementById('effect-toggle-btn');

    if (nameBtn) {
        const isOpen = ELS.nameBtns.classList.contains('is-open');
        const arrow = isOpen ? '▲' : '▼';
        nameBtn.textContent = selectedNames.size > 0
            ? `キャラ名${arrow} (${selectedNames.size})`
            : `キャラ名${arrow}`;
    }
    if (groupBtn) {
        const isOpen = ELS.groupBtns.classList.contains('is-open');
        const arrow = isOpen ? '▲' : '▼';
        groupBtn.textContent = selectedGroups.size > 0
            ? `グループ${arrow} (${selectedGroups.size})`
            : `グループ${arrow}`;
    }
    if (effectBtn) {
        const isOpen = ELS.effectBtns.classList.contains('is-open');
        const arrow = isOpen ? '▲' : '▼';
        effectBtn.textContent = selectedEffects.size > 0
            ? `効果${arrow} (${selectedEffects.size})`
            : `効果${arrow}`;
    }
    const gachaBtn = document.getElementById('gacha-toggle-btn');
    if (gachaBtn) {
        const isOpen = ELS.gachaBtns.classList.contains('is-open');
        const arrow = isOpen ? '▲' : '▼';
        gachaBtn.textContent = selectedGachas.size > 0
            ? `ガチャ${arrow} (${selectedGachas.size})`
            : `ガチャ${arrow}`;
    }
    const rarityBtn = document.getElementById('rarity-toggle-btn');
    if (rarityBtn) {
        const isOpen = ELS.rarityBtns.classList.contains('is-open');
        const arrow = isOpen ? '▲' : '▼';
        rarityBtn.textContent = selectedRarities.size > 0
            ? `レア度${arrow} (${selectedRarities.size})`
            : `レア度${arrow}`;
    }
}