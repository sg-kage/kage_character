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
    // 属性ごとのカラーコード定義 (style.css の --attr-* と同期)
    attributes: {
        "赤": "#e06158",
        "緑": "#46b878",
        "黄": "#d6af4a",
        "青": "#4a8ad4"
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

// 2体比較用にピン留めしたキャラ（null = 比較モードOFF）
let compareChar = null;

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
    compareBtn: document.getElementById('compare-btn'),
    sortBtn: document.getElementById('sort-btn'),
    imgBtn: document.getElementById("toggle-img-btn"),
    toggleRow: document.getElementById('filter-toggle-row'),
    
    // 数値表示・パネル
    affinityVal: document.getElementById('affinity-val'),
    magicVal: document.getElementById('magic-val'),
    listHeightSelect: document.getElementById('list-height-select'),
    fontSizeSelect: document.getElementById('font-size-select'),
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


/**
 * かな正規化ヘルパー
 * 検索時にひらがな・カタカナを同一視するための変換
 */
function hiraToKata(str) {
    return str.replace(/[ぁ-ゖ]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60));
}
function kataToHira(str) {
    return str.replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

/**
 * 検索用テキスト正規化（NFKC + 小文字化 + ひらがな→カタカナ）
 * インデックス側・クエリ側の両方に適用して表記ゆれを吸収する
 */
function normalizeSearchText(str) {
    if (!str) return '';
    return hiraToKata(String(str).normalize('NFKC').toLowerCase());
}


/* =========================================
   2. 初期化処理 (Entry Point)
   ========================================= */
document.addEventListener('DOMContentLoaded', async () => {
    // 0. i18n 辞書の読み込み完了を待つ（t() を安全に使えるようにする）
    await I18N.ready;

    // 1. ローディング表示
    ELS.list.innerHTML = `<li class="loading-state"><div class="loading-spinner"></div>${I18N.t('msg.loading')}</li>`;
    ELS.detail.innerHTML = `<div class="empty-state"><div class="empty-state-icon">&#128270;</div>${I18N.t('msg.selectChar')}</div>`;

    // 2. ローカルストレージからの設定読み込み
    loadSavedSettings();

    // 3. Wi-Fi判定と画像表示設定
    checkConnectionSettings();
    setupImageFallback();

    // 4. UIコンポーネントの初期化
    initLevelUI();
    setupStaticButtons();
    setupOptionPanel();
    setupCaptureButton();
    setupCompareButton();
    setupFavoriteTransfer();
    setupFontSizeControl();
    setupListHeightControl();
    setupKeyboardNavigation();

    // 5. データロード開始
    loadCharacters();
    loadUpdateDate();
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
        ELS.imgBtn.textContent = showImages ? I18N.t('btn.imgOn') : I18N.t('btn.imgOff');
        ELS.imgBtn.classList.toggle("active", showImages);
    }
}

/**
 * キャラ画像の読み込み失敗時に、シルエットのプレースホルダへ差し替える。
 * 一覧(list-img / list-img-ex)・詳細(char-image)を1か所のキャプチャ
 * リスナーで一元処理する（error はバブルしないため capture=true で捕捉）。
 */
const IMG_PLACEHOLDER = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">' +
    '<rect width="96" height="96" rx="8" fill="#15151e"/>' +
    '<circle cx="48" cy="38" r="16" fill="#4a5268"/>' +
    '<path d="M20 84c0-15 12-24 28-24s28 9 28 24z" fill="#4a5268"/></svg>'
);

function setupImageFallback() {
    document.addEventListener('error', (e) => {
        const t = e.target;
        if (!t || t.tagName !== 'IMG') return;
        if (!t.classList.contains('list-img') &&
            !t.classList.contains('list-img-ex') &&
            !t.classList.contains('char-image')) return;
        if (t.dataset.ph) return; // 二重差し替え防止（プレースホルダ自体の失敗を含む）
        t.dataset.ph = '1';
        t.classList.add('img-placeholder');
        t.src = IMG_PLACEHOLDER;
    }, true);
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
        btn.dataset.attr = attr;

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
    createToggleBtn("name-toggle-btn", I18N.t('toggle.name') + "▼", "name-btns");
    createToggleBtn("group-toggle-btn", I18N.t('toggle.group') + "▼", "group-btns");
    createToggleBtn("effect-toggle-btn", I18N.t('toggle.effect') + "▼", "effect-btns");
    createToggleBtn("gacha-toggle-btn", I18N.t('toggle.gacha') + "▼", "gacha-btns");
    createToggleBtn("rarity-toggle-btn", I18N.t('toggle.rarity') + "▼", "rarity-btns");

    // --- 画像ON/OFFボタン ---
    if (ELS.imgBtn) {
        ELS.imgBtn.onclick = () => {
            showImages = !showImages;
            ELS.imgBtn.textContent = showImages ? I18N.t('btn.imgOn') : I18N.t('btn.imgOff');
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
    favBtn.title = I18N.t('btn.favTitle');
    favBtn.setAttribute('aria-label', I18N.t('btn.favTitle'));
    favBtn.setAttribute('aria-pressed', 'false');
    favBtn.onclick = () => {
        showFavoritesOnly = !showFavoritesOnly;
        favBtn.classList.toggle('active', showFavoritesOnly);
        favBtn.setAttribute('aria-pressed', showFavoritesOnly ? 'true' : 'false');
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
        updateSearchClearVisibility();
        clearTimeout(searchTimeout);
        ELS.list.classList.add('is-searching');
        searchTimeout = setTimeout(() => {
            ELS.list.classList.remove('is-searching');
            updateList(true);
        }, 300);
    });

    // --- 検索クリア (×) ボタン ---
    const searchClearBtn = document.getElementById('search-clear-btn');
    if (searchClearBtn) {
        searchClearBtn.onclick = () => {
            ELS.filter.value = '';
            updateSearchClearVisibility();
            ELS.filter.focus();
            updateList(true);
        };
    }
}

/**
 * 検索クリアボタンの表示/非表示を入力内容に応じて切り替え
 */
function updateSearchClearVisibility() {
    const btn = document.getElementById('search-clear-btn');
    if (btn) btn.classList.toggle('is-hidden', !ELS.filter.value);
}

/**
 * すべてのフィルタ条件・検索キーワードを一括解除
 */
function clearAllFilters() {
    [selectedAttrs, selectedRoles, selectedGachas, selectedRarities,
     selectedGroups, selectedNames, selectedEffects].forEach(s => s.clear());

    showFavoritesOnly = false;
    const favBtn = document.getElementById('fav-filter-btn');
    if (favBtn) {
        favBtn.classList.remove('active');
        favBtn.setAttribute('aria-pressed', 'false');
    }

    ELS.filter.value = '';
    updateSearchClearVisibility();

    // ボタンの見た目をリセット
    updateAttrBtnColors();
    updateRoleBtnColors();
    Object.values(attrBtnMap).concat(Object.values(roleBtnMap))
        .forEach(btn => btn.setAttribute('aria-pressed', 'false'));
    document.querySelectorAll(
        '#gacha-btns .group-btn.active, #rarity-btns .group-btn.active, ' +
        '#group-btns .group-btn.active, #name-btns .group-btn.active, #effect-btns .group-btn.active'
    ).forEach(btn => btn.classList.remove('active'));

    updateList(true);
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
        // 矢印(▼/▲)と選択件数の表示を一元管理している関数に任せる
        updateToggleBtnCounts();
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
    return normalizeSearchText(ELS.filter.value)
        .trim()
        .split(CONFIG.REGEX.splitSpace)
        .filter(k => k);
}

/**
 * 詳細画面のハイライトに使うキーワード配列を返す（項目指定のコロン部分を除去）
 */
function getCurrentHighlightKeywords() {
    return getCurrentFilterKeywords().map(k => {
        if (k.includes(':') || k.includes('：')) return k.split(CONFIG.REGEX.splitColon)[1];
        return k;
    }).filter(k => k);
}

/**
 * DOMツリー内のテキストノードを走査してキーワードをハイライト（<span>タグ化）する
 */
function applyHighlightDOM(root, keywords) {
    if (!root || !keywords || !keywords.length) return;
    
    // 安全なキーワードリスト作成（かな表記ゆれ展開 + エスケープ処理）
    // 検索はカタカナ正規化済みのため、DOM上のひらがな表記にもマッチするよう両変種を生成
    const variantSet = new Set();
    keywords
        .filter(k => k && k.trim())
        .slice(0, 10)
        .forEach(k => {
            variantSet.add(k);
            variantSet.add(hiraToKata(k));
            variantSet.add(kataToHira(k));
        });
    const safeWords = Array.from(variantSet)
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
                    return targetProps.some(prop => (char._fieldSearch?.[prop] || '').includes(val));
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
    ELS.hitCount.textContent = I18N.t('msg.hitCount', { count: filtered.length });

    // 詳細画面でハイライトするためのキーワード抽出（コロン除去）
    const highlightKeywords = getCurrentHighlightKeywords();

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
        const isFav = favorites.has(charId);
        const favStar = document.createElement('span');
        favStar.className = 'fav-star' + (isFav ? ' is-fav' : '');
        favStar.textContent = isFav ? '★' : '☆';
        favStar.setAttribute('role', 'button');
        favStar.setAttribute('aria-label', I18N.t('btn.ariaFavStar'));
        favStar.setAttribute('aria-pressed', isFav ? 'true' : 'false');
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
            ELS.list.innerHTML = `<li class="loading-state" style="flex-direction:column; gap:4px;">${I18N.t('msg.noResults')}<span style="font-size:0.8em; opacity:0.6;">${I18N.t('msg.noResultsSub')}</span></li>`;
            ELS.detail.innerHTML = `<div class="empty-state"><div class="empty-state-icon">&#128270;</div>${I18N.t('msg.noResults')}</div>`;
        }
        if (ELS.captureBtn) ELS.captureBtn.classList.add('is-hidden');
        if (ELS.compareBtn) ELS.compareBtn.classList.add('is-hidden');
    }

    // フィルタピル更新
    updateActiveFilterPills();

    // 現在のフィルタ状態をURLに反映（共有用）
    syncUrlWithFilters();
}

/**
 * フィルタ・検索条件をURLパラメータへ反映する（replaceState なので履歴は汚さない）
 * 生成されたURLをそのまま共有すると、同じ絞り込み結果を再現できる
 */
function syncUrlWithFilters() {
    const url = new URL(window.location);
    const sp = url.searchParams;
    const setOrDel = (key, val) => { if (val) sp.set(key, val); else sp.delete(key); };

    setOrDel('q', ELS.filter.value.trim());
    setOrDel('attr', [...selectedAttrs].join(','));
    setOrDel('role', [...selectedRoles].join(','));
    setOrDel('gacha', [...selectedGachas].join(','));
    setOrDel('rarity', [...selectedRarities].join(','));
    setOrDel('group', [...selectedGroups].join(','));
    setOrDel('name', [...selectedNames].join(','));
    setOrDel('effect', [...selectedEffects].join(','));
    setOrDel('em', effectMode === 'or' ? 'or' : '');
    setOrDel('fav', showFavoritesOnly ? '1' : '');
    setOrDel('sort', positionSorted ? 'pos' : '');

    window.history.replaceState({}, '', url);
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
            .map(text => `<div class="combo-row" style="border:none !important;"><div class="combo-effect">${escapeHtml(text)}</div></div>`)
            .join('<hr class="skill-sep">');
    }
    else if (typeof combo === 'object' && combo !== null) {
        const effect = combo.effect ?? '';
        if (effect && effect !== "-") res = `<div class="combo-row" style="border:none !important;"><div class="combo-effect">${escapeHtml(effect)}</div></div>`;
    }
    else {
        const text = combo || '';
        if (text && text !== "-") res = `<div class="combo-row" style="border:none !important;"><div class="combo-effect">${escapeHtml(text)}</div></div>`;
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
            const skillName = escapeHtml(skill.title || skill.name || "");
            if (isMagic) {
                const text = replaceDynamicValues(escapeHtml(skill.effect || skill.normal || skill.description || ""), type);
                return `<div>${skillName ? `<b>${skillName}</b><br>` : ""}${text}</div>`;
            }
            const normal = replaceDynamicValues(escapeHtml(skill.normal || ""), type);
            const awakened = replaceDynamicValues(escapeHtml(skill.awakened || ""), type);
            
            if (awakened) {
                return `<div>${skillName ? `<b>${skillName}</b><br>` : ""}
                  <span class="effect-label normal-label">${I18N.t('label.normal')}</span>${normal}
                  <div style="border-top:1px dashed rgba(255,255,255,0.12); margin:8px 0;"></div>
                  <span class="effect-label awakened-label">${I18N.t('label.awakened')}</span>${awakened}
                </div>`;
            } else {
                return `<div>${skillName ? `<b>${skillName}</b><br>` : ""}${normal}</div>`;
            }
        }
        const text = replaceDynamicValues(escapeHtml(skill), type);
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
            if (typeof skill === "string") rawText = escapeHtml(skill);
            else if (typeof skill === "object") rawText = skill.title ? `<b>${escapeHtml(skill.title)}</b><br>${escapeHtml(skill.effect||skill.normal||"")}` : escapeHtml(skill.effect||skill.normal||"");
        } else {
            if (typeof skill === "string") rawText = escapeHtml(skill);
            else if ("title" in skill) rawText = `<b>${escapeHtml(skill.title)}</b><br>${escapeHtml(tabType===1 ? skill.normal : skill.awakened)}`;
            else rawText = escapeHtml(tabType===1 ? (skill.normal || "") : (skill.awakened || ""));
        }
        if (rawText === "-") return "";
        return replaceDynamicValues(rawText, calcType);
    }).filter(s => s !== "").join('<hr class="skill-sep">'); 
}

/**
 * キャラクター1体分の詳細HTML（.char-detail-wrap）を生成する
 * showDetail の単体表示と2体比較表示の両方から利用する
 * @param {Object} char - 対象キャラクターオブジェクト
 * @param {Array} filter - ハイライト用キーワード配列
 * @returns {string} 詳細HTML文字列
 */
function buildCharDetailHtml(char, filter = []) {
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
                    <span class="char-label">${I18N.t('label.attribute')}</span>
                    <span class="char-value ${attributeClass(char.attribute)}">${highlightDetail(char.attribute)}</span>
                </div>
                <div class="char-info-item">
                    <span class="char-label">${I18N.t('label.role')}</span>
                    <span class="char-value">${highlightDetail(char.role)}</span>
                </div>
                <div class="char-info-item">
                    <span class="char-label">${I18N.t('label.position')}</span>
                    <span class="char-value">${highlightDetail(char.position)}</span>
                </div>
                <div class="char-info-item">
                    <span class="char-label">${I18N.t('label.rarity')}</span>
                    <span class="char-value">${highlightDetail(char.rarity)}</span>
                </div>
                <div class="char-info-item">
                    <span class="char-label">${I18N.t('label.gacha')}</span>
                    <span class="char-value">${highlightDetail(char.gacha)}</span>
                </div>
            </div>
            <div class="char-info-row-bottom">
                <div class="char-info-item char-info-wide">
                    <span class="char-label">${I18N.t('label.group')}</span>
                    <span class="char-value char-value-plain">${(char.group || []).map(escapeHtml).join(', ')}</span>
                </div>
                <div class="char-info-item char-info-wide">
                    <span class="char-label">${I18N.t('label.arousal')}</span>
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
    const comboContent = comboBlock(char.combo, filter);
    const comboSection = comboContent ? `
        <div class="char-section" style="border-left:3px solid ${attrColor};">
            <div class="char-section-title" style="color:${attrColor}; border-left-color:${attrColor};">${I18N.t('section.combo')}</div>
            <div class="char-section-content">${comboContent}</div>
        </div>` : "";

    mainContent += `
        ${sect(I18N.t('section.exUltimate'), char.ex_ultimate)}
        ${sect(I18N.t('section.ultimate'), char.ultimate)}
        ${sect(I18N.t('section.skill1'), char.skill1)}
        ${sect(I18N.t('section.skill2'), char.skill2)}
        ${sect(I18N.t('section.traits'), char.traits)}
        ${comboSection}
        ${sect(I18N.t('section.normalAttack'), char.normal_attack)}
        ${sect(I18N.t('section.magicItem1'), char.magic_item1, true)}
        ${sect(I18N.t('section.magicItem2'), char.magic_item2, true)}
    </div>`;

    return mainContent;
}

/**
 * キャラクターの詳細を表示するメイン関数
 * @param {Object} char - 表示するキャラクターオブジェクト
 * @param {Array} filter - ハイライト用キーワード配列
 */
function showDetail(char, filter = []) {
    if (!char) {
        ELS.detail.innerHTML = `<div class="empty-state"><div class="empty-state-icon">&#128270;</div>${I18N.t('msg.selectChar')}</div>`;
        if (ELS.captureBtn) ELS.captureBtn.classList.add('is-hidden');
        if (ELS.compareBtn) ELS.compareBtn.classList.add('is-hidden');
        return;
    }

    // URLパラメータ更新（共有用）
    if (char.position) {
        const url = new URL(window.location);
        url.searchParams.set('pos', char.position);
        window.history.replaceState({}, '', url);
    }

    // 2体比較: ピン留めキャラがあれば 左=ピン留め / 右=現在選択 の並列表示
    if (compareChar && compareChar !== char) {
        ELS.detail.innerHTML = `<div class="compare-wrap">${buildCharDetailHtml(compareChar, filter)}${buildCharDetailHtml(char, filter)}</div>`;
    } else {
        ELS.detail.innerHTML = buildCharDetailHtml(char, filter);
    }

    // --- タブ生成 ---
    const tabRange = document.createRange().createContextualFragment(`
    <div class="tabs-wrap" id="detail-tabs">
      <div class="tabs-buttons" role="tablist">
        <button class="tabs-btn${tabMode===0?' active':''}" id="tab-both" role="tab" aria-selected="${tabMode===0}">${I18N.t('tab.compare')}</button>
        <button class="tabs-btn${tabMode===1?' active':''}" id="tab-normal" role="tab" aria-selected="${tabMode===1}">${I18N.t('tab.normal')}</button>
        <button class="tabs-btn${tabMode===2?' active':''}" id="tab-awakened" role="tab" aria-selected="${tabMode===2}">${I18N.t('tab.awakened')}</button>
      </div>
    </div>`);
    ELS.detail.prepend(tabRange);
    
    document.getElementById('tab-both').onclick = () => { tabMode = 0; showDetail(char, filter); };
    document.getElementById('tab-normal').onclick = () => { tabMode = 1; showDetail(char, filter); };
    document.getElementById('tab-awakened').onclick = () => { tabMode = 2; showDetail(char, filter); };

    // 生成後のDOMに対してハイライト適用
    applyHighlightDOM(ELS.detail, filter);

    if (ELS.captureBtn) ELS.captureBtn.classList.remove('is-hidden');
    updateCompareBtn();
}

/**
 * 2体比較ボタンの表示状態（表示/ラベル/active）を現在のピン留め状態に同期する
 */
function updateCompareBtn() {
    if (!ELS.compareBtn) return;
    ELS.compareBtn.classList.remove('is-hidden');
    const pinned = !!compareChar;
    ELS.compareBtn.classList.toggle('active', pinned);
    ELS.compareBtn.textContent = pinned ? I18N.t('btn.compareStop') : I18N.t('btn.compare');
    ELS.compareBtn.title = pinned ? compareChar.name : I18N.t('btn.compareHint');
}

/**
 * 2体比較ボタンのセットアップ
 * 押すと現在表示中のキャラをピン留めし、以降に選択したキャラと並べて表示する。
 * もう一度押すとピン留めを解除して単体表示に戻る。
 */
function setupCompareButton() {
    if (!ELS.compareBtn) return;
    ELS.compareBtn.onclick = () => {
        const current = lastFiltered[selectedIdx];
        compareChar = compareChar ? null : (current || null);
        if (current) showDetail(current, getCurrentHighlightKeywords());
    };
}


/* =========================================
   7. データ読み込み・動的ボタン生成
   ========================================= */

/**
 * ロケール別データファイルのパスを返す
 * 例: localeDataUrl('all_characters') -> 'characters/all_characters_ja.json'
 */
function localeDataUrl(base, loc) {
    return `characters/${base}_${loc || I18N.dataLocale}.json`;
}

/**
 * JSONデータの取得とキャッシュ管理
 */
async function loadCharacters() {
    if (isLoadingCharacters) return;
    isLoadingCharacters = true;

    // ロケール別データを優先。キャッシュキーもロケール別に分ける
    let jsonUrl = localeDataUrl('all_characters');
    const cacheKeyData = `kage_char_data_v3_${I18N.dataLocale}`;
    const cacheKeyTime = `kage_char_time_v3_${I18N.dataLocale}`;

    try {
        // 更新確認 (HEADリクエスト)
        let headResp = await fetch(jsonUrl, { method: 'HEAD' });
        // ロケール別ファイルが無ければ ja データにフォールバック
        if (!headResp.ok && I18N.dataLocale !== I18N.DEFAULT_LOCALE) {
            jsonUrl = localeDataUrl('all_characters', I18N.DEFAULT_LOCALE);
            headResp = await fetch(jsonUrl, { method: 'HEAD' });
        }
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
                <div>${I18N.t('msg.loadFail')}</div>
                <button id="retry-load-btn" style="padding:8px 20px; background:#2c5d8a; color:#fff; border:none; border-radius:6px; cursor:pointer; font-size:0.9em;">${I18N.t('msg.retry')}</button>
            </li>`;
            const retryBtn = document.getElementById('retry-load-btn');
            if (retryBtn) retryBtn.onclick = () => {
                ELS.list.innerHTML = `<li class="loading-state"><div class="loading-spinner"></div>${I18N.t('msg.loading')}</li>`;
                loadCharacters();
            };
        }
    } finally {
        isLoadingCharacters = false;
    }
}

/**
 * データ更新日を取得してヘッダーに表示する（取得失敗時は何もしない付加情報）
 */
async function loadUpdateDate() {
    try {
        let r = await fetch(localeDataUrl('update_date'), { cache: 'no-cache' });
        // ロケール別ファイルが無ければ ja にフォールバック
        if (!r.ok && I18N.dataLocale !== I18N.DEFAULT_LOCALE) {
            r = await fetch(`characters/update_date_${I18N.DEFAULT_LOCALE}.json`, { cache: 'no-cache' });
        }
        if (!r.ok) return;
        const { updated } = await r.json();
        const el = document.getElementById('data-update');
        if (el && updated) el.textContent = I18N.t('msg.dataUpdate', { date: updated });
    } catch (_) { /* 表示は任意。失敗してもアプリ動作には影響しない */ }
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

    // 項目指定検索 (特技: 等) の対象フィールド
    const FIELD_KEYS = ['traits', 'skill1', 'skill2', 'ultimate', 'ex_ultimate', 'magic_item1', 'magic_item2', 'combo', 'normal_attack'];

    characters.forEach(c => {
        // 項目指定検索用：フィールド別の正規化済みテキスト（JSONキー名を含まない）
        c._fieldSearch = {};
        FIELD_KEYS.forEach(f => {
            c._fieldSearch[f] = normalizeSearchText(extractText(c[f]));
        });

        // 全文検索用文字列の生成（必要なフィールドのみ結合し、誤検索・肥大化を防ぐ）
        c._search = normalizeSearchText([
            c.name,
            c.attribute,
            c.role,
            String(c.position || ''),
            c.arousal || '',
            (c.group || []).join(' '),
            c.aliases ? (Array.isArray(c.aliases) ? c.aliases.join(' ') : c.aliases) : '',
            FIELD_KEYS.map(f => c._fieldSearch[f]).join(' ')
        ].join(' '));

        // 効果（『』で囲まれた文字）の抽出
        const effectSet = new Set();
        [c.ultimate, c.ex_ultimate, c.skill1, c.skill2, c.traits, c.combo, c.magic_item1, c.magic_item2].forEach(t => processSkillData(t, effectSet));
        c._effects = Array.from(effectSet);
    });
}

/**
 * URLパラメータを解析して初期表示を行う
 * ?pos=XXX でキャラ単体指定、?q= / ?attr= などでフィルタ状態を復元する
 */
function handleUrlParameter() {
    const params = new URLSearchParams(window.location.search);

    // --- フィルタ状態の復元 (syncUrlWithFilters と対) ---
    const readSet = (key, set) => {
        const v = params.get(key);
        if (v) v.split(',').filter(Boolean).forEach(x => set.add(x));
    };
    readSet('attr', selectedAttrs);
    readSet('role', selectedRoles);
    readSet('gacha', selectedGachas);
    readSet('rarity', selectedRarities);
    readSet('group', selectedGroups);
    readSet('name', selectedNames);
    readSet('effect', selectedEffects);
    if (params.get('em') === 'or') effectMode = 'or';
    if (params.get('fav') === '1') showFavoritesOnly = true;
    if (params.get('sort') === 'pos') positionSorted = true;
    const q = params.get('q');
    if (q) {
        ELS.filter.value = q;
        updateSearchClearVisibility();
    }
    applyFilterStateToButtons();

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

/**
 * URLから復元したフィルタ状態を各ボタンの見た目（active / aria-pressed）へ反映する
 * initButtons でボタン生成が終わった後に呼ぶこと
 */
function applyFilterStateToButtons() {
    updateAttrBtnColors();
    updateRoleBtnColors();
    Object.entries(attrBtnMap).forEach(([k, btn]) => btn.setAttribute('aria-pressed', String(selectedAttrs.has(k))));
    Object.entries(roleBtnMap).forEach(([k, btn]) => btn.setAttribute('aria-pressed', String(selectedRoles.has(k))));

    const setActive = (container, set) => {
        if (!container) return;
        container.querySelectorAll('.group-btn').forEach(btn => {
            if (btn.id) return; // effect-mode-btn などの特殊ボタンを除外
            btn.classList.toggle('active', set.has(btn.textContent));
        });
    };
    setActive(ELS.gachaBtns, selectedGachas);
    setActive(ELS.rarityBtns, selectedRarities);
    setActive(ELS.groupBtns, selectedGroups);
    setActive(ELS.nameBtns, selectedNames);
    setActive(ELS.effectBtns, selectedEffects);

    const modeBtn = document.getElementById('effect-mode-btn');
    if (modeBtn) modeBtn.textContent = effectMode === 'and' ? I18N.t('effect.modeAnd') : I18N.t('effect.modeOr');

    const favBtn = document.getElementById('fav-filter-btn');
    if (favBtn) {
        favBtn.classList.toggle('active', showFavoritesOnly);
        favBtn.setAttribute('aria-pressed', String(showFavoritesOnly));
    }

    if (ELS.sortBtn) ELS.sortBtn.setAttribute('aria-pressed', String(positionSorted));
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
    modeBtn.textContent = effectMode === 'and' ? I18N.t('effect.modeAnd') : I18N.t('effect.modeOr');
    modeBtn.className = "group-btn";
    modeBtn.onclick = () => {
        effectMode = (effectMode === 'and') ? 'or' : 'and';
        modeBtn.textContent = effectMode === 'and' ? I18N.t('effect.modeAnd') : I18N.t('effect.modeOr');
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
            img.loading = 'eager';
            img.decoding = 'sync';
            if (img.complete && img.naturalHeight !== 0) {
                if (typeof img.decode === 'function') {
                    return img.decode().catch(() => {});
                }
                return Promise.resolve();
            }

            return new Promise(resolve => {
                const done = () => {
                    img.removeEventListener('load', done);
                    img.removeEventListener('error', done);
                    resolve();
                };
                img.addEventListener('load', done, { once: true });
                img.addEventListener('error', done, { once: true });
                if (!img.src) return done();
                setTimeout(done, 2500);
            });
        }));
    };

    // 画像を fetch して data URL に変換（iOS Safari の遅延 decode / CORS / canvas tainting を根絶）
    const imageToDataURL = async (src) => {
        try {
            const res = await fetch(src, { cache: 'force-cache' });
            if (!res.ok) return null;
            const blob = await res.blob();
            return await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (_) {
            return null;
        }
    };

    // クローン側の <img> をすべて data URL に差し替えてから decode 完了まで待つ
    const inlineCloneImages = async (sourceRoot, cloneRoot) => {
        const sourceImages = Array.from(sourceRoot.querySelectorAll('img'));
        const cloneImages = Array.from(cloneRoot.querySelectorAll('img'));

        await Promise.all(cloneImages.map(async (img, idx) => {
            const sourceImg = sourceImages[idx];
            if (!sourceImg || sourceImg.style.visibility === 'hidden' || sourceImg.style.display === 'none') {
                img.remove();
                return;
            }

            const resolvedSrc = sourceImg.currentSrc || sourceImg.src || img.currentSrc || img.src;
            if (!resolvedSrc) {
                img.remove();
                return;
            }

            img.removeAttribute('loading');
            img.removeAttribute('crossorigin');
            img.loading = 'eager';
            img.decoding = 'sync';
            img.setAttribute('fetchpriority', 'high');

            const dataUrl = await imageToDataURL(resolvedSrc);
            if (!dataUrl) {
                img.remove();
                return;
            }
            img.src = dataUrl;

            if (typeof img.decode === 'function') {
                try { await img.decode(); return; } catch (_) { /* fall through */ }
            }
            if (img.complete && img.naturalHeight !== 0) return;
            await new Promise(resolve => {
                const done = () => {
                    img.removeEventListener('load', done);
                    img.removeEventListener('error', done);
                    resolve();
                };
                img.addEventListener('load', done, { once: true });
                img.addEventListener('error', done, { once: true });
                setTimeout(done, 3000);
            });
        }));
    };

    const canvasToPreviewUrl = async (canvas) => {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (blob && blob.size > 0) {
            return URL.createObjectURL(blob);
        }

        const dataUrl = canvas.toDataURL('image/png');
        if (!dataUrl || dataUrl === 'data:,') {
            throw new Error('Failed to create capture preview.');
        }
        return dataUrl;
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
                /* .char-detail-wrap の detailFadeIn (from{opacity:0}) が html2canvas の
                   内部 iframe 複製で最初から再生し直され、opacity<1 の瞬間を描画して
                   全体が暗い画像になる (特に iOS Safari)。キャプチャ時は全アニメを止める。 */
                animation: none !important;
                transition: none !important;
                /* webfont (Noto Sans JP) のロード差で iframe 内行高が縮み、下に余白が出るのを防ぐため
                   キャプチャ時はシステムフォントスタックに固定する。 */
                font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif !important;
                --bg-primary: #101016 !important;
                --bg-secondary: #16161f !important;
                --bg-card: #1a1a25 !important;
                --bg-card-hover: #222230 !important;
                --bg-input: #15151f !important;
                --bg-elevated: #242433 !important;
                --text-primary: #f0f2f8 !important;
                --text-secondary: #a4adc0 !important;
                --text-muted: #6b7590 !important;
                --accent: #8e7bff !important;
                --accent-glow: rgba(142, 123, 255, 0.12) !important;
                --accent-dim: #5d4fc0 !important;
                --accent-subtle: rgba(142, 123, 255, 0.06) !important;
                --gold: #d4af5e !important;
                --gold-dim: rgba(212, 175, 94, 0.10) !important;
                --orange: #e09558 !important;
                --attr-red: #e06158 !important;
                --attr-green: #46b878 !important;
                --attr-yellow: #d6af4a !important;
                --attr-blue: #4a8ad4 !important;
                --border: rgba(255, 255, 255, 0.04) !important;
                --border-light: rgba(255, 255, 255, 0.08) !important;
                --border-accent: rgba(91, 184, 214, 0.12) !important;
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

            /* html2canvas は rgba 背景を濃く描画する傾向があり、左右 padding と合わさって
               周囲の文字まで巻き込んで見えるため、キャプチャ時は背景を消して文字色のみ残す。 */
            .capture-target .lv-highlight {
                background: transparent !important;
                padding: 0 !important;
            }

            /* デザイン装飾（text-shadow / セクションの光沢グラデ）は html2canvas で
               にじみ・色ずれの原因になり得るため、キャプチャ時は無効化する。 */
            .capture-target .char-title {
                text-shadow: none !important;
            }
            .capture-target .char-section {
                background: var(--bg-secondary) !important;
            }
            /* 見出し帯の半透明白は html2canvas で濃く描画されるため実色に置換する */
            .capture-target .char-section-title {
                background: #1d1d27 !important;
            }

            /* 検索ワードのヒット色付け (.hit) はスクショには不要なため、
               通常テキストと同じ見た目に戻して色・背景・強調を解除する。
               (画面表示には影響せず、capture-target 配下のクローンのみ) */
            .capture-target .hit {
                color: inherit !important;
                font-weight: inherit !important;
                background: transparent !important;
                padding: 0 !important;
                border-radius: 0 !important;
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
        try {
            await waitImagesLoaded(ELS.detail);

            clone = ELS.detail.cloneNode(true);
            clone.classList.add('capture-target');
            // 共通スタイル (配置スタイルは後段でマウント方式に応じて付与)
            Object.assign(clone.style, {
                width: '1100px', minWidth: '1100px', maxWidth: 'none',
                height: 'auto', padding: '20px', margin: '0',
                background: '#101016', color: '#f0f2f8',
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

            // マウント前に画像を data URL 化して decode 完了まで待つ。
            // マウント→src差し替えの順だとレイアウトが途中で揺れて測定値がブレるため、
            // 画像準備を完了させてからマウントしてレイアウトを一発で確定させる。
            await inlineCloneImages(ELS.detail, clone);
            // decode 後に naturalWidth/Height をもとに明示サイズを焼き込み、
            // CSS の max-width:35% / max-height:150px と矛盾しない確定値で固定する。
            // これで画像 ON/OFF どちらでも同じ流れで測定できる。
            clone.querySelectorAll('img').forEach(img => {
                const nw = img.naturalWidth, nh = img.naturalHeight;
                if (!nw || !nh) return;
                const ratio = nw / nh;
                // 1100px幅クローンに対して max-width:35% = 385px、max-height:150px
                const maxW = 385, maxH = 150;
                let w = nw, h = nh;
                if (w > maxW) { w = maxW; h = w / ratio; }
                if (h > maxH) { h = maxH; w = h * ratio; }
                img.style.width = `${Math.round(w)}px`;
                img.style.height = `${Math.round(h)}px`;
            });

            // マウント方式（PC/iOS共通）:
            // 画面外に "横方向" でずらして配置する。
            // - top:-9999px や 1px wrapper(overflow:hidden) は iOS Safari がレイアウト計算を
            //   間引き、scrollHeight が過小報告されてキャプチャ下部が途切れる。
            // - 垂直方向はビューポート内 (top:0) に置き、水平方向 left:-20000px で画面外へ。
            //   絶対配置の負方向はスクロール領域を拡張しないため副作用も無し。
            Object.assign(clone.style, {
                position: 'absolute',
                top: '0',
                left: '-20000px',
                zIndex: '-9999'
            });
            mountNode = clone;
            document.body.appendChild(mountNode);

            // フォント反映 + レイアウト/ペイントを 1 サイクル跨いでから測定する。
            // (画像はマウント前に data URL 化＋明示サイズ付与済みなので追加待機は不要)
            if (document.fonts && document.fonts.ready) {
                try { await document.fonts.ready; } catch (_) { /* 無視 */ }
            }
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

            void clone.offsetHeight;
            const rectH = clone.getBoundingClientRect().height;
            // 画面外配置に変更したため scrollHeight / offsetHeight / rectH のいずれも
            // 同じ値に揃うはず。安全のため最大値を採用して下端の途切れを防ぐ。
            const cloneH = Math.ceil(Math.max(clone.scrollHeight, clone.offsetHeight, rectH, 100));

            const isMobile = window.innerWidth <= 700;
            // iOS Safari の canvas 上限は概ね 4096×4096。1100 * scale および cloneH * scale が
            // それを超えないよう、動的に scale を絞る（基本は 2 倍を狙う）。
            const MAX_DIM = 4000;
            const dynamicScaleCap = Math.min(MAX_DIM / 1100, MAX_DIM / Math.max(cloneH, 1));
            const captureScale = isIOS
                ? Math.max(1, Math.min(2, dynamicScaleCap))
                : (isMobile ? 1.5 : 2);
            // foreignObjectRendering は iOS Safari で深刻なフォント／色／画像崩壊を起こすため
            // 全環境で iframe 方式 (false) に統一する。
            // 高さ切れは clone.style.height + windowHeight: cloneH の組み合わせで対処。
            const canvas = await html2canvas(clone, {
                scale: captureScale,
                useCORS: true,
                allowTaint: false,
                logging: false,
                width: 1100,
                height: cloneH,
                windowWidth: 1100,
                windowHeight: cloneH,
                scrollX: 0,
                scrollY: 0,
                backgroundColor: '#101016',
                foreignObjectRendering: false,
                imageTimeout: 15000
            });

            const previewUrl = await canvasToPreviewUrl(canvas);
            showCaptureOverlay(previewUrl, filename);

        } catch (err) {
            console.error("Capture Failed:", err);
            alert(I18N.t('msg.captureFail') + '\n' + (err.message || err));
        } finally {
            if (mountNode && mountNode.parentNode) mountNode.parentNode.removeChild(mountNode);
            ELS.captureBtn.disabled = false;
            ELS.captureBtn.style.opacity = '';
        }
    });
}


/**
 * キャプチャ結果を表示するオーバーレイの生成
 */
function showCaptureOverlay(previewUrl, filename) {
    const isObjectUrl = typeof previewUrl === 'string' && previewUrl.startsWith('blob:');
    const existing = document.getElementById('capture-overlay');
    if (existing) {
        // 前回の blob URL を解放
        const prevImg = existing.querySelector('img');
        if (prevImg && prevImg.src.startsWith('blob:')) URL.revokeObjectURL(prevImg.src);
        existing.remove();
    }

    const overlay = document.createElement('div');
    overlay.id = 'capture-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    Object.assign(overlay.style, {
        position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
        backgroundColor: 'rgba(0,0,0,0.72)', zIndex: '10000', display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '20px', boxSizing: 'border-box'
    });

    const status = document.createElement('div');
    status.textContent = I18N.t('msg.previewShow');
    Object.assign(status.style, {
        color: '#fff',
        fontSize: '14px',
        marginBottom: '12px',
        letterSpacing: '0.02em'
    });

    const img = document.createElement('img');
    img.alt = filename;
    Object.assign(img.style, {
        maxWidth: '90%', maxHeight: '80%',
        border: '2px solid #fff', marginBottom: '15px',
        boxShadow: '0 0 20px rgba(0,0,0,0.5)',
        imageRendering: 'auto',       // ★ ブラウザ最適な縮小アルゴリズムを使用
        objectFit: 'contain'           // ★ アスペクト比維持
    });

    // ★ blob URL のクリーンアップ関数
    img.onload = () => {
        status.remove();
    };
    img.onerror = () => {
        status.textContent = I18N.t('msg.previewFail');
        status.style.color = '#ffd6d6';
        img.remove();
    };
    img.src = previewUrl;
    img.style.display = 'block';

    const cleanup = () => {
        if (isObjectUrl) URL.revokeObjectURL(previewUrl);
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
        if(isLink) { el.href = previewUrl; el.download = filename; }
        else el.onclick = action;
        return el;
    };

    btnArea.appendChild(createBtn(I18N.t('msg.saveImage'), '#4CAF50', null, true));
    btnArea.appendChild(createBtn(I18N.t('msg.close'), '#f44336', cleanup, false));

    overlay.appendChild(status);
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
 * 文字サイズ切替制御（小/中/大）
 * 全フォントが rem トークン基準なので、ルート html の font-size を変えて
 * UI全体を比例拡縮する。設定は localStorage に永続化。
 */
const FONT_SCALE_MAP = { small: '90%', medium: '100%', large: '112%' };

function setupFontSizeControl() {
    if (!ELS.fontSizeSelect) return;

    const applyScale = (key) => {
        const scale = FONT_SCALE_MAP[key] || FONT_SCALE_MAP.medium;
        document.documentElement.style.fontSize = scale;
    };

    const saved = localStorage.getItem('kage_font_scale');
    const initial = FONT_SCALE_MAP[saved] ? saved : 'medium';
    ELS.fontSizeSelect.value = initial;
    applyScale(initial);

    ELS.fontSizeSelect.addEventListener('change', () => {
        const key = ELS.fontSizeSelect.value;
        safeSetItem('kage_font_scale', key);
        applyScale(key);
        // フォント変更で行高が変わるため、リスト高さ(固定件数)を再計算させる
        window.dispatchEvent(new Event('resize'));
    });
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

/**
 * お気に入りのエクスポート/インポート（機種変更・ブラウザ移行用）
 * エクスポート: ID配列のJSONをクリップボードへコピー（不可の場合は prompt で手動コピー）
 * インポート: 貼り付けたデータを既存のお気に入りへマージ（上書きはしない）
 */
function setupFavoriteTransfer() {
    const exportBtn = document.getElementById('fav-export-btn');
    const importBtn = document.getElementById('fav-import-btn');
    if (!exportBtn || !importBtn) return;

    exportBtn.onclick = async () => {
        const data = JSON.stringify([...favorites]);
        try {
            await navigator.clipboard.writeText(data);
            alert(I18N.t('fav.exportDone', { count: favorites.size }));
        } catch (_) {
            // クリップボードAPI不可（非HTTPS等）の場合は手動コピー用に表示
            window.prompt(I18N.t('fav.exportManual'), data);
        }
    };

    importBtn.onclick = () => {
        const input = window.prompt(I18N.t('fav.importPrompt'), '');
        if (!input) return;

        // JSON配列・カンマ/空白区切りのどちらでも受け付ける
        let ids = null;
        try {
            const parsed = JSON.parse(input);
            if (Array.isArray(parsed)) ids = parsed;
        } catch (_) { /* JSONでなければ区切り文字で分割 */ }
        if (!ids) ids = input.split(/[,\s、]+/);

        ids = ids.map(v => String(v).trim()).filter(v => /^\d+$/.test(v));
        if (!ids.length) {
            alert(I18N.t('fav.importFail'));
            return;
        }

        ids.forEach(id => favorites.add(id));
        saveFavorites();
        updateList(false);
        alert(I18N.t('fav.importDone', { count: ids.length }));
    };
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
                updateSearchClearVisibility();
                updateList(true);
                return;
            }
            return;
        }

        // 入力中は矢印/Enterを無視
        if (isInputFocused) return;
        if (!lastFiltered.length) return;

        const highlightKeywords = getCurrentHighlightKeywords();

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
        { set: selectedAttrs, label: I18N.t('label.attribute'), colorFn: updateAttrBtnColors, container: null },
        { set: selectedRoles, label: I18N.t('label.role'), colorFn: updateRoleBtnColors, container: null },
        { set: selectedGachas, label: I18N.t('label.gacha'), colorFn: null, container: ELS.gachaBtns },
        { set: selectedRarities, label: I18N.t('label.rarity'), colorFn: null, container: ELS.rarityBtns },
        { set: selectedGroups, label: I18N.t('label.group'), colorFn: null, container: ELS.groupBtns },
        { set: selectedNames, label: I18N.t('label.character'), colorFn: null, container: ELS.nameBtns },
        { set: selectedEffects, label: I18N.t('toggle.effect'), colorFn: null, container: ELS.effectBtns },
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
        frag.appendChild(createFilterPill(I18N.t('btn.favPill'), () => {
            showFavoritesOnly = false;
            const favBtn = document.getElementById('fav-filter-btn');
            if (favBtn) favBtn.classList.remove('active');
            updateList(true);
        }));
    }

    // ピルが2件以上あれば一括解除ボタンを表示
    if (frag.childNodes.length >= 2) {
        const clearAll = document.createElement('button');
        clearAll.type = 'button';
        clearAll.className = 'filter-pill filter-pill-clear';
        clearAll.textContent = I18N.t('btn.clearAll');
        clearAll.onclick = clearAllFilters;
        frag.appendChild(clearAll);
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
            ? `${I18N.t('toggle.name')}${arrow} (${selectedNames.size})`
            : `${I18N.t('toggle.name')}${arrow}`;
    }
    if (groupBtn) {
        const isOpen = ELS.groupBtns.classList.contains('is-open');
        const arrow = isOpen ? '▲' : '▼';
        groupBtn.textContent = selectedGroups.size > 0
            ? `${I18N.t('toggle.group')}${arrow} (${selectedGroups.size})`
            : `${I18N.t('toggle.group')}${arrow}`;
    }
    if (effectBtn) {
        const isOpen = ELS.effectBtns.classList.contains('is-open');
        const arrow = isOpen ? '▲' : '▼';
        effectBtn.textContent = selectedEffects.size > 0
            ? `${I18N.t('toggle.effect')}${arrow} (${selectedEffects.size})`
            : `${I18N.t('toggle.effect')}${arrow}`;
    }
    const gachaBtn = document.getElementById('gacha-toggle-btn');
    if (gachaBtn) {
        const isOpen = ELS.gachaBtns.classList.contains('is-open');
        const arrow = isOpen ? '▲' : '▼';
        gachaBtn.textContent = selectedGachas.size > 0
            ? `${I18N.t('toggle.gacha')}${arrow} (${selectedGachas.size})`
            : `${I18N.t('toggle.gacha')}${arrow}`;
    }
    const rarityBtn = document.getElementById('rarity-toggle-btn');
    if (rarityBtn) {
        const isOpen = ELS.rarityBtns.classList.contains('is-open');
        const arrow = isOpen ? '▲' : '▼';
        rarityBtn.textContent = selectedRarities.size > 0
            ? `${I18N.t('toggle.rarity')}${arrow} (${selectedRarities.size})`
            : `${I18N.t('toggle.rarity')}${arrow}`;
    }
}
