/* =========================================
   グローバル変数・設定
   ========================================= */
// 設定定数
const CONFIG = {
    attributes: {"赤": "#FF6347", "緑": "#32CD32", "黄": "#FFD700", "青": "#1E90FF"},
    roles: ["アタッカー", "タンク", "サポーター"],
    // 頻繁に使う正規表現を事前コンパイル（動作は変わりませんが高速になります）
    REGEX: {
        splitSpace: /[ 　]+/,
        splitColon: /[:：]/,
        splitName: /[&＆]/,
        cleanName: /\[.*$/,
        dynamicVal: /\{([\d.]+),\s*([\d.]+)\}/g,
        effects: /『([^』]+)』/g,
        sanitize: /[\/\\?%*:|"<>]/g,
        unsafeChars: /[.*+?^${}()|[\]\\]/g
    }
};

// 状態管理変数
let characters = [];
let positionSorted = false;
let lastFiltered = [];
let selectedIdx = 0;
let selectedGroups = new Set();
let selectedNames = new Set();
let selectedEffects = new Set();
let currentAffinity = 3;
let currentMagicLv = 5;
let selectedAttrs = new Set();
let selectedRoles = new Set();
let effectMode = 'and';
let tabMode = 0;
let showImages = false;

// DOM要素のキャッシュ（高速化の肝：毎回検索しない）
const ELS = {
    list: document.getElementById('list'),
    detail: document.getElementById('detail'),
    filter: document.getElementById('filter'),
    hitCount: document.getElementById('hit-count'),
    attrBtns: document.getElementById('attribute-btns'),
    roleBtns: document.getElementById('role-btns'),
    groupBtns: document.getElementById('group-btns'),
    nameBtns: document.getElementById('name-btns'),
    effectBtns: document.getElementById('effect-btns'),
    captureBtn: document.getElementById('capture-btn'),
    sortBtn: document.getElementById('sort-btn'),
    imgBtn: document.getElementById("toggle-img-btn"),
    toggleRow: document.getElementById('filter-toggle-row'),
    affinityVal: document.getElementById('affinity-val'),
    magicVal: document.getElementById('magic-val'),
    listHeightSelect: document.getElementById('list-height-select'),
    panelBtn: document.getElementById('toggle-panel-btn'),
    controlPanel: document.getElementById('level-control-panel'),
    // NodeListは動的なのでquerySelector等で取得
    getAffinityBtns: () => document.querySelectorAll('.magic-btn[data-kind="affinity"]'),
    getMagicBtns: () => document.querySelectorAll('.magic-btn[data-kind="magic"]')
};

// ボタン管理用マップ
const roleBtnMap = {};
const attrBtnMap = {};

/* =========================================
   初期化処理
   ========================================= */
document.addEventListener('DOMContentLoaded', () => {
    // スタイル注入
    const style = document.createElement('style');
    style.textContent = `.skill-sep { border: 0; border-bottom: 1px dashed #666; margin: 8px 0; opacity: 0.5; }`;
    document.head.appendChild(style);

    // ローカルストレージ読み込み
    const savedAff = localStorage.getItem('kage_affinity');
    const savedMag = localStorage.getItem('kage_magicLv');
    
    if (savedAff && savedAff !== 'inf') currentAffinity = parseInt(savedAff);
    else if (savedAff === 'inf') currentAffinity = 'inf';

    if (savedMag && savedMag !== 'inf') currentMagicLv = parseInt(savedMag);
    else if (savedMag === 'inf') currentMagicLv = 'inf';

    // UI初期化
    initLevelUI();
    setupStaticButtons();
    setupOptionPanel();
    setupCaptureButton();
    setupListHeightControl();
    
    // データ読み込み
    loadCharacters();
});

/* =========================================
   レベル操作・計算ロジック (元の計算式を完全維持)
   ========================================= */
function initLevelUI() {
    updateLevelDisplay('affinity', currentAffinity);
    updateLevelDisplay('magic', currentMagicLv);
}

// 外部呼び出し用関数（HTMLのonclick対応）
window.setAffinity = function(lv) {
    currentAffinity = lv;
    localStorage.setItem('kage_affinity', lv);
    updateLevelDisplay('affinity', lv);
    refreshDetail();
};

window.setMagicLv = function(lv) {
    currentMagicLv = lv;
    localStorage.setItem('kage_magicLv', lv);
    updateLevelDisplay('magic', lv);
    refreshDetail();
};

function updateLevelDisplay(type, lv) {
    const el = type === 'affinity' ? ELS.affinityVal : ELS.magicVal;
    const btns = type === 'affinity' ? ELS.getAffinityBtns() : ELS.getMagicBtns();
    
    if(el) el.textContent = (lv === 'inf') ? '∞' : lv;
    btns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lv == lv);
    });
}

function refreshDetail() {
    // 現在の入力内容でハイライト用フィルタを作成して詳細再描画
    if(lastFiltered.length > 0 && lastFiltered[selectedIdx]) {
        showDetail(lastFiltered[selectedIdx], getCurrentFilterKeywords());
    }
}

// ★重要：元の計算ロジックを完全に維持
function replaceDynamicValues(text, type) {
    if (!text) return text;
    return text.replace(CONFIG.REGEX.dynamicVal, (match, minStr, maxStr) => {
        const min = parseFloat(minStr);
        const max = parseFloat(maxStr);
        let val;
        let isInf = false;

        if (type === 'affinity') {
            if (currentAffinity === 'inf') isInf = true;
            else {
                const step = (max - min) / 9;
                val = min + (step * (currentAffinity - 1));
            }
        } else {
            if (currentMagicLv === 'inf') isInf = true;
            else {
                const diff = (max - min) / 2;
                if (currentMagicLv <= 2) val = min;
                else if (currentMagicLv <= 4) val = min + diff;
                else val = max;
            }
        }
        
        // 原コードの出力フォーマットを維持
        if (isInf) return `<span class="lv-highlight">${min.toFixed(2)}～${max.toFixed(2)}</span>`;
        return `<span class="lv-highlight">${val.toFixed(2)}</span>`; 
    });
}

/* =========================================
   フィルタボタン生成・制御
   ========================================= */
function setupStaticButtons() {
    // ロールボタン
    const roleFrag = document.createDocumentFragment();
    CONFIG.roles.forEach(role => {
        const btn = document.createElement('button');
        btn.textContent = role;
        btn.className = "attr-btn";
        btn.style.background = "#444444";
        btn.style.color = "#E0E0E0";
        btn.onclick = () => {
            if (selectedRoles.has(role)) selectedRoles.delete(role);
            else selectedRoles.add(role);
            updateRoleBtnColors();
            updateList(true);
        };
        roleFrag.appendChild(btn);
        roleBtnMap[role] = btn;
    });
    ELS.roleBtns.appendChild(roleFrag);

    // 属性ボタン
    const attrFrag = document.createDocumentFragment();
    for (const attr of ["赤","緑","黄","青"]) {
        const btn = document.createElement('button');
        btn.textContent = attr;
        btn.className = "attr-btn";
        btn.onclick = () => {
            if (selectedAttrs.has(attr)) selectedAttrs.delete(attr);
            else selectedAttrs.add(attr);
            updateAttrBtnColors();
            updateList(true);
        };
        attrFrag.appendChild(btn);
        attrBtnMap[attr] = btn;
    }
    ELS.attrBtns.appendChild(attrFrag);
    updateAttrBtnColors();

    // トグルボタン群
    createToggleBtn("name-toggle-btn", "キャラ名 ▼", "name-btns");
    createToggleBtn("group-toggle-btn", "グループ ▼", "group-btns");
    createToggleBtn("effect-toggle-btn", "効果 ▼", "effect-btns");

    // 画像切り替え
    if (ELS.imgBtn) {
        ELS.imgBtn.onclick = () => {
            showImages = !showImages;
            ELS.imgBtn.textContent = showImages ? "画像: ON" : "画像: OFF";
            ELS.imgBtn.classList.toggle("active", showImages);
            updateList(false);
        };
    }

    // ソート
    ELS.sortBtn.onclick = () => {
        positionSorted = !positionSorted;
        ELS.sortBtn.setAttribute("aria-pressed", positionSorted ? "true" : "false");
        updateList(true);
    };

    // 検索入力
    let searchTimeout;
    ELS.filter.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => { updateList(true); }, 300);
    });
}

function createToggleBtn(id, text, targetId) {
    const btn = document.createElement('button');
    btn.id = id;
    btn.textContent = text;
    btn.className = "attr-btn";
    btn.style.background = "#393864";
    btn.style.color = "#fff";
    btn.style.border = "1px solid #5d5c8d";
    
    const panel = document.getElementById(targetId);
    btn.onclick = () => {
        panel.classList.toggle('is-open');
        btn.textContent = panel.classList.contains('is-open') ? text.replace('▼', '▲') : text;
    };
    ELS.toggleRow.appendChild(btn);
}

function updateRoleBtnColors() {
    CONFIG.roles.forEach(role => {
        const btn = roleBtnMap[role];
        if(!btn) return;
        btn.style.background = selectedRoles.has(role) ? "#2c5d8a" : "#444444";
    });
}

function updateAttrBtnColors() {
    for (const attr of ["赤","緑","黄","青"]) {
        const btn = attrBtnMap[attr];
        if(!btn) continue;
        btn.style.background = selectedAttrs.has(attr) ? CONFIG.attributes[attr] : "#666666";
    }
}

/* =========================================
   検索・リスト表示ロジック
   ========================================= */
function getCurrentFilterKeywords(){
    return ELS.filter.value.normalize('NFKC').toLowerCase().replace(/　/g, ' ').trim().split(/[ ]+/).filter(k=>k);
}

function highlightText(text, keywords){ return text; } // プレースホルダ

function applyHighlightDOM(root, keywords) {
    if (!root || !keywords || !keywords.length) return;
    const safeWords = keywords.filter(k => k && k.trim()).map(k => k.replace(CONFIG.REGEX.unsafeChars, '\\$&'));
    if (!safeWords.length) return;

    const splitRegex = new RegExp(`(${safeWords.join('|')})`, 'gi');
    const testRegex = new RegExp(`^(${safeWords.join('|')})$`, 'i');

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            if (!node.parentElement || node.parentElement.closest('.hit') || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
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

function updateList(resetSelect=false) {
    const filterKeywords = getCurrentFilterKeywords();

    const fieldMap = {
        "特殊": ["traits"], "特技": ["skill1", "skill2"], "奥義": ["ultimate","ex_ultimate"],
        "魔道具": ["magic_item1", "magic_item2"], "コンボ": ["combo"], "通常": ["normal_attack"]
    };

    let filtered = characters.filter(char => {
        if (!char._search) return false;
        
        const matchKeywords = filterKeywords.every(token => {
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
            return char._search.includes(token);
        });
        if (!matchKeywords) return false;

        if (selectedAttrs.size > 0 && !selectedAttrs.has(char.attribute)) return false;
        if (selectedRoles.size > 0 && !selectedRoles.has(char.role)) return false;
        if (selectedGroups.size > 0 && !(char.group || []).some(g => selectedGroups.has(g))) return false;
        
        if (selectedNames.size > 0) {
            const cleanName = char.name.split('[')[0].trim();
            const names = cleanName.split(CONFIG.REGEX.splitName).map(n => n.trim());
            if (!names.some(n => selectedNames.has(n))) return false;
        }

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

    if (positionSorted) filtered.sort((a,b)=>(parseInt(a.position)||999)-(parseInt(b.position)||999));

    lastFiltered = filtered;
    ELS.hitCount.textContent = `ヒット件数: ${filtered.length}件`;

    const highlightKeywords = filterKeywords.map(k => {
        if (k.includes(':') || k.includes('：')) return k.split(CONFIG.REGEX.splitColon)[1];
        return k;
    }).filter(k => k);

    ELS.list.innerHTML = "";
    const fragment = document.createDocumentFragment();

    filtered.forEach((char, idx) => {
        const li = document.createElement('li');
        li.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 0 10px;
            height: 35px; /* 高さを固定 */
            box-sizing: border-box;
            cursor: pointer;
        `;

        // --- 1. 名前の前：通常画像 (name.webp) ---
        if (showImages) {
            const imgArea1 = document.createElement('div');
            imgArea1.style.cssText = `width: 30px; height: 30px; flex-shrink: 0;`;
            
            const img1 = document.createElement('img');
            img1.src = `image/characters/${char.name}.webp`;
            img1.style.cssText = `
                width: 30px; height: 30px; object-fit: cover; 
                border-radius: 4px; border: 1px solid #555; background: #2a2a2a;
            `;
            img1.onerror = () => img1.style.visibility = 'hidden'; 
            imgArea1.appendChild(img1);
            li.appendChild(imgArea1);
        }

        // --- 2. キャラ名 ---
        const nameSpan = document.createElement('span');
        nameSpan.textContent = char.name;
        nameSpan.style.cssText = `
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            flex-shrink: 1; /* 名前が長すぎる場合は縮む */
        `;
        applyHighlightDOM(nameSpan, highlightKeywords);
        li.appendChild(nameSpan);

        // --- 3. 文字のすぐ右：Ex画像 (name_Ex.webp) ---
        if (showImages) {
            const img2 = document.createElement('img');
            img2.src = `image/characters/${char.name}_Ex.webp`;
            img2.style.cssText = `
                width: 30px; height: 30px; object-fit: cover;
                border-radius: 4px; border: 1px solid #555; background: #2a2a2a;
                flex-shrink: 0;
                margin-left: 2px; /* 名前との間にわずかな隙間 */
            `;
            // Exがないキャラはスペースを詰めたいので remove()
            img2.onerror = () => img2.remove(); 
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

    if(filtered.length) {
        if(resetSelect) selectedIdx = 0;
        if (selectedIdx >= filtered.length) selectedIdx = 0;
        showDetail(filtered[selectedIdx], highlightKeywords);
        highlightSelected();
    } else {
        showDetail(null);
    }
}

function highlightSelected() {
    const items = ELS.list.children;
    for (let i = 0; i < items.length; i++) {
        if (i === selectedIdx) items[i].classList.add('selected');
        else items[i].classList.remove('selected');
    }
}

/* =========================================
   詳細表示 (元のHTML構築ロジックを維持)
   ========================================= */
function comboBlock(combo, filter=[]) {
    let res = "";
    if (Array.isArray(combo)) {
        res = combo
            .map(row => (typeof row === 'object') ? (row.effect ?? '') : row)
            .filter(text => text && text !== "-")
            .map(text => `<div class="combo-row" style="border:none !important;"><span class="combo-effect">${highlightText(text, filter)}</span></div>`)
            .join('<hr class="skill-sep">');
    } 
    else if (typeof combo === 'object' && combo !== null) {
        const effect = combo.effect ?? '';
        if (effect && effect !== "-") res = `<div class="combo-row" style="border:none !important;"><span class="combo-effect">${highlightText(effect, filter)}</span></div>`;
    } 
    else {
        const text = combo || '';
        if (text && text !== "-") res = `<div class="combo-row" style="border:none !important;"><span class="combo-effect">${highlightText(text, filter)}</span></div>`;
    }
    return replaceDynamicValues(res, 'affinity');
}

function skillBlockBothInline(arr, filter=[], isMagic=false) {
    if (!arr) return "";
    if (!Array.isArray(arr)) arr = [arr];
    const type = isMagic ? 'magic' : 'affinity';
    
    return arr.map(skill => {
        if (typeof skill === "object") {
            const skillName = skill.title || skill.name || "";
            if (isMagic) {
                const text = replaceDynamicValues(skill.effect || skill.normal || skill.description || "", type);
                return `<div>${skillName ? `<b>${highlightText(skillName, filter)}</b><br>` : ""}${highlightText(text, filter)}</div>`;
            }
            const normal = replaceDynamicValues(skill.normal || "", type);
            const awakened = replaceDynamicValues(skill.awakened || "", type);
            
            if (awakened) {
                return `<div>${skillName ? `<b>${highlightText(skillName, filter)}</b><br>` : ""}
                  <span class="effect-label normal-label">覚醒前</span>${highlightText(normal, filter)}
                  <div style="border-top: 1px dashed #555; margin: 6px 0 6px 0; opacity: 0.7;"></div>
                  <span class="effect-label awakened-label">覚醒後</span>${highlightText(awakened, filter)}
                </div>`;
            } else {
                return `<div>${skillName ? `<b>${highlightText(skillName, filter)}</b><br>` : ""}${highlightText(normal, filter)}</div>`;
            }
        }
        const text = replaceDynamicValues(skill, type);
        return (text === "-") ? "" : `<div>${highlightText(text, filter)}</div>`;
    }).filter(html => html !== "").join('<hr class="skill-sep">');
}

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
        return highlightText(replaceDynamicValues(rawText, calcType), filter);
    }).filter(s => s !== "").join('<hr class="skill-sep">'); 
}

/* =========================================
   詳細表示ロジック
   ========================================= */
/**
 * キャラクターの詳細を表示するメイン関数
 * 画像の動き（アニメーション）を完全に停止し、サイズを固定した修正版
 */
function showDetail(char, filter = []) {
    if (!char) {
        ELS.detail.textContent = "該当キャラクターがありません。";
        if (ELS.captureBtn) ELS.captureBtn.style.display = 'none';
        return;
    }

    // URLパラメータ更新
    if (char.CharacterID) {
        const url = new URL(window.location);
        url.searchParams.set('id', char.CharacterID);
        window.history.replaceState({}, '', url);
    }

    const attrColor = CONFIG.attributes[char.attribute] || "#E0E0E0";
    const highlightDetail = (val) => (val && filter.length) ? highlightText(val, filter) : val;

    // --- 画像表示セクション (動きの停止 & サイズ固定) ---
// --- 画像表示セクション (1枚の時は1枚分の枠にする修正) ---
    let imageHtml = "";
    if (showImages) {
        const base = "image/characters/";
        // 1枚目と2枚目の定義
        const imgData = [
            { src: `${base}${char.name}.webp`, suffix: "" },
            { src: `${base}${char.name}_Ex.webp`, suffix: " Ex" }
        ];

        // 画像を表示する部分
        imageHtml = `
        <div class="char-image-container" style="display:flex; gap:10px; justify-content:center; align-items: flex-start; margin-bottom:15px; width: 100%;">
            ${imgData.map(img => `
                <img 
                    src="${img.src}" 
                    alt="${char.name}${img.suffix}"
                    class="char-image" 
                    crossorigin="anonymous" 
                    loading="lazy" 
                    decoding="async"
                    style="
                        display: block;
                        width: auto;           /* 固定％をやめる */
                        height: auto;
                        max-width: 35%;        /* 最大でも画面の35%に抑える */
                        max-height: 150px;     /* iPhoneでの縦伸び防止 */
                        object-fit: contain; 
                        border-radius: 6px; 
                        border: 1px solid #444; 
                        background: #2a2a2a;
                        animation: none !important; 
                        transform: none !important; 
                        transition: none !important;
                        flex: 0 1 auto;        /* 必要な分だけ幅を取る */
                    "
                    onerror="this.style.display='none';" 
                >`).join("")}
        </div>`;
    }

    const attributeClass = (attr) => ({"赤": "attr-red", "緑": "attr-green", "黄": "attr-yellow", "青": "attr-blue"}[attr] || "");

    let mainContent = `
    <div class="char-detail-wrap" style="padding:15px; background:#232323; color:#fff; border-radius:10px;">
        <div class="char-title" style="color: ${attrColor}; font-size:1.5em; font-weight:bold; margin-bottom:10px; text-align:center;">
            ${highlightDetail(char.name)}
        </div>
        ${imageHtml}
        <div class="char-basic" style="display:grid; grid-template-columns: repeat(3, auto); justify-content: start; gap:15px; background:#333; padding:10px; border-radius:5px; margin-bottom:15px;">
            <div class="char-basic-item" style="white-space:nowrap;"><span class="char-label" style="opacity:0.7; font-size:0.8em; margin-right:4px;">属性:</span><span class="char-value ${attributeClass(char.attribute)}">${highlightDetail(char.attribute)}</span></div>
            <div class="char-basic-item" style="white-space:nowrap;"><span class="char-label" style="opacity:0.7; font-size:0.8em; margin-right:4px;">ロール:</span><span class="char-value">${highlightDetail(char.role)}</span></div>
            <div class="char-basic-item" style="white-space:nowrap;"><span class="char-label" style="opacity:0.7; font-size:0.8em; margin-right:4px;">ポジション:</span><span class="char-value">${highlightDetail(char.position)}</span></div>
            
            <div class="char-basic-item" style="grid-column: 1 / -1; border-top: 1px solid #444; padding-top: 4px;"><span class="char-label" style="opacity:0.7; font-size:0.8em; margin-right:5px;">グループ:</span><span class="char-value">${(char.group || []).join(', ')}</span></div>
            <div class="char-basic-item" style="grid-column: 1 / -1; border-top: 1px solid #444; padding-top: 4px;"><span class="char-label" style="opacity:0.7; font-size:0.8em; margin-right:5px;">覚醒:</span><span class="char-value">${char.arousal}</span></div>
        </div>`;

    // --- スキルセクション表示 (変更なし) ---
    const sect = (title, data, isMag = false) => {
        if (!data || (Array.isArray(data) && data.length === 0)) return "";
        let content;
        if (tabMode === 0) content = skillBlockBothInline(data, filter, isMag);
        else if (tabMode === 1) content = skillBlockCompare(data, filter, 1, isMag);
        else content = skillBlockCompare(data, filter, 2, isMag);
        
        if (!content) return "";
        return `
        <div class="char-section" style="margin-bottom:15px; border-left:4px solid ${attrColor}; padding-left:10px;">
            <div class="char-section-title" style="font-weight:bold; color:${attrColor}; margin-bottom:5px;">${title}</div>
            <div class="char-section-content" style="line-height:1.6;">${content}</div>
        </div>`;
    };

    mainContent += `
        ${sect("究極奥義", char.ex_ultimate)}
        ${sect("奥義", char.ultimate)}
        ${sect("特技1", char.skill1)}
        ${sect("特技2", char.skill2)}
        ${sect("特殊", char.traits)}
        <div class="char-section" style="margin-bottom:15px; border-left:4px solid ${attrColor}; padding-left:10px;">
            <div class="char-section-title" style="font-weight:bold; color:${attrColor}; margin-bottom:5px;">コンボ</div>
            <div class="char-section-content">${comboBlock(char.combo, filter)}</div>
        </div>
        ${sect("通常攻撃", char.normal_attack)}
        ${sect("魔道具1", char.magic_item1, true)}
        ${sect("魔道具2", char.magic_item2, true)}
    </div>`;

    ELS.detail.innerHTML = mainContent;
    
    // タブ再生成
    const tabRange = document.createRange().createContextualFragment(`
    <div class="tabs-wrap" id="detail-tabs" style="margin-bottom:10px;">
      <div class="tabs-buttons" style="display:flex; gap:5px;">
        <button class="tabs-btn${tabMode===0?' active':''}" id="tab-both" style="flex:1; padding:8px; cursor:pointer;">比較</button>
        <button class="tabs-btn${tabMode===1?' active':''}" id="tab-normal" style="flex:1; padding:8px; cursor:pointer;">覚醒前</button>
        <button class="tabs-btn${tabMode===2?' active':''}" id="tab-awakened" style="flex:1; padding:8px; cursor:pointer;">覚醒後</button>
      </div>
    </div>`);
    ELS.detail.prepend(tabRange);
    
    document.getElementById('tab-both').onclick = () => { tabMode = 0; showDetail(char, filter); };
    document.getElementById('tab-normal').onclick = () => { tabMode = 1; showDetail(char, filter); };
    document.getElementById('tab-awakened').onclick = () => { tabMode = 2; showDetail(char, filter); };

    applyHighlightDOM(ELS.detail, filter);
    if (ELS.captureBtn) ELS.captureBtn.style.display = 'inline-block';
}
/**
 * スクショ時に利用する画像読み込み待機関数 (重要)
 */
const waitImagesLoaded = async (root) => {
    const images = Array.from(root.querySelectorAll('img'));
    return Promise.all(images.map(img => {
        // スクショ時に lazy 属性を剥がして即時ロードさせる
        if (img.getAttribute('loading') === 'lazy') {
            img.removeAttribute('loading');
        }
        if (img.complete && img.naturalHeight !== 0) return Promise.resolve();
        return new Promise(resolve => {
            img.onload = resolve;
            img.onerror = resolve;
            if (!img.src) resolve();
        });
    }));
};
/* =========================================
   データ読み込み・ボタン生成
   ========================================= */
async function loadCharacters() {
    const jsonUrl = 'characters/all_characters.json';
    const cacheKeyData = 'kage_char_data_v3'; 
    const cacheKeyTime = 'kage_char_time_v3'; 

    try {
        const headResp = await fetch(jsonUrl, { method: 'HEAD' });
        if (!headResp.ok) throw new Error("Network response was not ok");
        
        const serverLastModified = headResp.headers.get('Last-Modified');
        const localLastModified = localStorage.getItem(cacheKeyTime);
        const localData = localStorage.getItem(cacheKeyData);

        if (localData && localLastModified && serverLastModified === localLastModified) {
            console.log("Using cached data");
            characters = JSON.parse(localData);
            initButtons();

            // ★追加: キャッシュ使用時もURLパラメータをチェック
            handleUrlParameter();

            return; 
        }

        console.log("Downloading new data...");
        const resp = await fetch(jsonUrl);
        if(resp.ok){
            characters = await resp.json();

            const extractEffects = (text, targetSet) => {
                if (!text || typeof text !== 'string') return;
                const matches = text.matchAll(CONFIG.REGEX.effects);
                for (const m of matches) targetSet.add(m[1].trim());
            };
            const processSkillData = (data, targetSet) => {
                if (!data) return;
                if (Array.isArray(data)) data.forEach(item => processSkillData(item, targetSet));
                else if (typeof data === 'object') {
                    extractEffects(data.normal, targetSet);
                    extractEffects(data.awakened, targetSet);
                    extractEffects(data.effect, targetSet);
                    extractEffects(data.description, targetSet);
                } else if (typeof data === 'string') extractEffects(data, targetSet);
            };

            characters.forEach(c => {
                c._search = (c.name + " " + (c.group||[]).join(" ") + " " + JSON.stringify(c)).toLowerCase();
                const effectSet = new Set();
                [c.ultimate, c.ex_ultimate, c.skill1, c.skill2, c.traits, c.combo, c.magic_item1, c.magic_item2].forEach(t => processSkillData(t, effectSet));
                c._effects = Array.from(effectSet);
            });

            try {
                localStorage.setItem(cacheKeyData, JSON.stringify(characters));
                localStorage.setItem(cacheKeyTime, serverLastModified);
            } catch (e) { console.warn("Cache quota exceeded", e); }

            initButtons();

            // ★追加: 新規ダウンロード時もURLパラメータをチェック
            handleUrlParameter();
        }
    } catch (err) { console.error("Failed to load characters:", err); }
}

// ★追加: URLパラメータを解析して初期表示を制御するヘルパー関数
function handleUrlParameter() {
    const params = new URLSearchParams(window.location.search);
    const targetId = params.get('id');
    
    if (targetId) {
        // 全キャラの中からIDが一致するものを探す
        const targetChar = characters.find(c => String(c.CharacterID) === targetId);
        if (targetChar) {
            // 1. フィルタを一旦通してリストを生成
            updateList(true); 
            
            // 2. 生成された lastFiltered の中から対象のインデックスを探す
            const idx = lastFiltered.findIndex(c => String(c.CharacterID) === targetId);
            
            if (idx !== -1) {
                selectedIdx = idx;
                showDetail(targetChar, []);
                highlightSelected();
                
                // 3. 選択された要素までスクロールさせる（親切設計）
                const targetLi = ELS.list.children[idx];
                if (targetLi) {
                    targetLi.scrollIntoView({ block: 'nearest' });
                }
                return; // ここで終了
            }
        }
    }
    // パラメータがない、または見つからない場合は通常通り
    updateList(true);
}

function initButtons() {
    setupGroupButtons();
    setupNameButtons();
    setupEffectButtons();
}

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
   機能系（キャプチャ・パネル・高さ）
   ========================================= */
function setupCaptureButton() {
    if (!ELS.captureBtn) return;
    
    const waitImagesLoaded = (root) => {
        const images = Array.from(root.querySelectorAll('img'));
        return Promise.all(images.map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise(resolve => {
                img.onload = resolve;
                img.onerror = resolve; 
            });
        }));
    };

    ELS.captureBtn.addEventListener('click', async () => {
        if (!ELS.detail) return;
        ELS.captureBtn.disabled = true;
        ELS.captureBtn.style.opacity = '0.5';
        
        const charNameElement = ELS.detail.querySelector('.char-title');
        const safeName = charNameElement ? charNameElement.textContent.trim().replace(CONFIG.REGEX.sanitize, '_') : 'detail';
        const now = new Date();
        const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
        const filename = `kage_${safeName}_${dateStr}.png`;

        let clone = null;
        try {
            await waitImagesLoaded(ELS.detail);
            clone = ELS.detail.cloneNode(true);
            Object.assign(clone.style, {
                position: 'fixed', top: '0', left: '0', width: '1100px', minWidth: '1100px', maxWidth: 'none',
                height: 'auto', padding: '20px', margin: '0', background: '#232323', color: '#ffffff',
                zIndex: '-9999', overflow: 'visible', borderRadius: '0', transform: 'none'
            });
            clone.removeAttribute('id');
            document.body.appendChild(clone);

            const isMobile = window.innerWidth < 800;
            const canvas = await html2canvas(clone, {
                scale: isMobile ? 1.5 : 2, useCORS: true, allowTaint: false, logging: true,
                windowWidth: 1200, backgroundColor: '#232323'
            });
            showCaptureOverlay(canvas.toDataURL('image/png'), filename);

        } catch (err) { 
            console.error("Capture Failed:", err);
            alert('【NEW】エラー詳細:\n' + (err.message || err));
        } finally { 
            if (clone && clone.parentNode) clone.parentNode.removeChild(clone);
            ELS.captureBtn.disabled = false;
            ELS.captureBtn.style.opacity = ''; 
        }
    });
}

function showCaptureOverlay(dataUrl, filename) {
    const existing = document.getElementById('capture-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'capture-overlay';
    Object.assign(overlay.style, {
        position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
        backgroundColor: 'rgba(0,0,0,0.85)', zIndex: '10000', display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
    });

    const img = document.createElement('img');
    img.src = dataUrl;
    Object.assign(img.style, { maxWidth: '90%', maxHeight: '80%', border: '2px solid #fff', marginBottom: '15px', boxShadow: '0 0 20px rgba(0,0,0,0.5)' });

    const btnArea = document.createElement('div');
    const createBtn = (text, bg, action, isLink) => {
        const el = document.createElement(isLink ? 'a' : 'button');
        el.textContent = text;
        Object.assign(el.style, {
            display: 'inline-block', padding: '10px 20px', background: bg, color: '#fff',
            textDecoration: 'none', borderRadius: '5px', fontSize: '16px', cursor: 'pointer', margin: '0 10px', border: 'none'
        });
        if(isLink) { el.href = dataUrl; el.download = filename; }
        else el.onclick = action;
        return el;
    };

    btnArea.appendChild(createBtn('画像を保存', '#4CAF50', null, true));
    btnArea.appendChild(createBtn('閉じる', '#f44336', () => overlay.remove(), false));

    overlay.appendChild(img);
    overlay.appendChild(btnArea);
    document.body.appendChild(overlay);
}

function setupOptionPanel() {
    if (!ELS.panelBtn || !ELS.controlPanel) return;
    ELS.panelBtn.onclick = () => {
        const isHidden = ELS.controlPanel.style.display === 'none';
        ELS.controlPanel.style.display = isHidden ? 'block' : 'none';
        ELS.panelBtn.classList.toggle('active', isHidden);
    };
    document.addEventListener('click', (e) => {
        if (ELS.controlPanel.style.display === 'none') return;
        if (!ELS.panelBtn.contains(e.target) && !ELS.controlPanel.contains(e.target)) {
            ELS.controlPanel.style.display = 'none';
            ELS.panelBtn.classList.remove('active');
        }
    });
}

function setupListHeightControl() {
    if (!ELS.listHeightSelect || !ELS.list) return;
    const saved = localStorage.getItem('kage_list_height');
    if (saved) ELS.listHeightSelect.value = saved;

    const updateHeight = () => {
        const val = ELS.listHeightSelect.value;
        localStorage.setItem('kage_list_height', val);
        
        if (val === 'auto') {
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
            const count = parseInt(val);
            const first = ELS.list.querySelector('li');
            const h = first ? first.getBoundingClientRect().height : 40;
            const style = window.getComputedStyle(ELS.list);
            const extra = (parseFloat(style.paddingTop)||0) + (parseFloat(style.paddingBottom)||0) + (parseFloat(style.borderTopWidth)||0) + (parseFloat(style.borderBottomWidth)||0) + 1;
            ELS.list.style.setProperty('height', `${(h * count) + extra}px`, 'important');
            ELS.list.style.setProperty('max-height', 'none', 'important');
        }
    };

    ELS.listHeightSelect.addEventListener('change', updateHeight);
    window.addEventListener('resize', updateHeight);
    ['toggle-panel-btn', 'group-toggle-btn', 'name-toggle-btn', 'effect-toggle-btn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener('click', () => { setTimeout(updateHeight, 50); setTimeout(updateHeight, 300); });
    });
    setTimeout(updateHeight, 100);
}