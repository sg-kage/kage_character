// ==== キャラクター検索用変数 ====
let characters = [];
let positionSorted = false;
let lastFiltered = [];
let selectedIdx = 0;

const attributes = {"赤": "#FF6347", "緑": "#32CD32", "黄": "#FFD700", "青": "#1E90FF"};
const attrBtns = document.getElementById('attribute-btns');

// 仕様：選択（＝フィルタ対象）を保持するセット。初期は何も選択していない
let selectedAttrs = new Set();

let tabMode = 0; // 0:比較, 1:覚醒前, 2:覚醒後
let showImages = false; // ← デフォルトは画像 OFF

document.getElementById("toggle-img").addEventListener("change", (e)=>{
    showImages = e.target.checked;
    updateList(false);
});

// ==== 属性ボタン作成（DOM探索削減・機能不変）====
const attrBtnMap = {};

for (const attr of ["赤","緑","黄","青"]) {
    const btn = document.createElement('button');
    btn.textContent = attr;
    btn.className = "attr-btn";

    // 初期は白（未選択）
    btn.style.background = "#E0E0E0";

    btn.onclick = () => {
        if (selectedAttrs.has(attr)) {
            selectedAttrs.delete(attr); // 選択解除（白に戻る）
        } else {
            selectedAttrs.add(attr); // 選択（色付き）
        }
        updateAttrBtnColors();
        updateList(true);
    };

    attrBtns.appendChild(btn);
    attrBtnMap[attr] = btn; // キャッシュ
}

function updateAttrBtnColors() {
    for (const attr of ["赤","緑","黄","青"]) {
        const btn = attrBtnMap[attr];
        if(!btn) continue;

        // 選択中なら属性色、未選択なら白
        btn.style.background = selectedAttrs.has(attr)
            ? attributes[attr]
            : "#E0E0E0";
    }
}
updateAttrBtnColors();

// ==== ソートボタン ====
const sortBtn = document.getElementById('sort-btn');
sortBtn.onclick = () => {
    positionSorted = !positionSorted;
    sortBtn.setAttribute("aria-pressed", positionSorted ? "true" : "false");
    updateList(true);
};

// ==== フィルター入力 ====
document.getElementById('filter').addEventListener('input', () => updateList(true));

// ==== テキストハイライト（機能不変）====
function highlightText(text, keywords){
    return text;
}

// ==== DOMハイライト（安全＆軽量判定）====
function applyHighlightDOM(root, keywords) {
    if (!root || !keywords || !keywords.length) return;

    const safeWords = keywords
        .filter(k => k && k.trim())
        .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

    if (!safeWords.length) return;

    const splitRegex = new RegExp(`(${safeWords.join('|')})`, 'gi');
    const testRegex  = new RegExp(`^(${safeWords.join('|')})$`, 'i');

    const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode(node) {
                if (!node.parentElement) return NodeFilter.FILTER_REJECT;
                if (node.parentElement.closest('.hit')) return NodeFilter.FILTER_REJECT;
                if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    const textNodes = [];
    while (walker.nextNode()) {
        textNodes.push(walker.currentNode);
    }

    textNodes.forEach(node => {
        const frag = document.createDocumentFragment();
        const parts = node.nodeValue.split(splitRegex);

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
    });
}

function addSpaces(arr, filter){ 
    return (arr||[]).map(item=>'　'+highlightText(item,filter)).join('<br>'); 
}

// ==== attributeClass（if連打 → マップ化・機能不変）====
const attrClassMap = {
    "赤": "attr-red",
    "緑": "attr-green",
    "黄": "attr-yellow",
    "青": "attr-blue"
};
function attributeClass(attr) {
    return attrClassMap[attr] || "";
}

// =======================
// ここから下は【機能・挙動すべて完全そのまま】
// =======================

// ==== コンボ表示 ====
function comboBlock(combo, filter=[]) {
    if (Array.isArray(combo)) {
        return combo.map(row => {
            if (typeof row === 'object') {
                return `<div class="combo-row">${row.name ? `<b>${highlightText(row.name, filter)}</b><br>` : ""}<span class="combo-effect">${highlightText(row.effect ?? '', filter)}</span></div>`;
            } else if (typeof row === 'string') {
                return `<div class="combo-row"><span class="combo-effect">${highlightText(row, filter)}</span></div>`;
            } else { return ""; }
        }).join('');
    } else if (typeof combo === 'object') {
        return Object.entries(combo).map(([name, effect]) =>
            `<div class="combo-row"><b>${highlightText(name, filter)}</b><br><span class="combo-effect">${highlightText(effect, filter)}</span></div>`
        ).join('');
    } else if (typeof combo === 'string') {
        if (combo.match(/【/)) {
            return combo
                .split(/[\n\r]+/)
                .map(line => line.trim())
                .filter(line => line)
                .map(line => {
                    const m = line.match(/^【(.+?)】(.*)$/);
                    if (m) {
                        return `<div class="combo-row"><b>【${highlightText(m[1], filter)}】</b><br><span class="combo-effect">${highlightText(m[2].trim(), filter)}</span></div>`;
                    } else {
                        return `<div class="combo-row"><span class="combo-effect">${highlightText(line, filter)}</span></div>`;
                    }
                })
                .join('');
        } else {
            return `<div class="combo-row"><span class="combo-effect">${highlightText(combo, filter)}</span></div>`;
        }
    } else { return ""; }
}

// ==== スキル表示（両方/比較） ====
function skillBlockBothInline(arr, filter=[]) {
    if (!arr) return "";
    if (!Array.isArray(arr)) arr = [arr];

    return arr.map(skill => {
        if (typeof skill === "object") {
            const skillName = skill.title || skill.name || "";
            const normalText = skill.normal ? `<span class="effect-label normal-label">通常</span>${highlightText(skill.normal, filter)}` : "";
            const awakenedText = skill.awakened ? `<span class="effect-label awakened-label">覚醒</span>${highlightText(skill.awakened, filter)}` : "";

            return `<div style="margin-bottom:0.7em;">
                ${skillName ? `<b>${highlightText(skillName, filter)}</b><br>` : ""}
                ${normalText}${normalText && awakenedText ? "<br>" : ""}${awakenedText}
            </div>`;
        }

        if (typeof skill === "string") return `<div>${highlightText(skill, filter)}</div>`;
        return "";
    }).join("");
}

function skillBlockCompare(arr, filter=[], type=0) {
    if (!arr) return "";
    if (!Array.isArray(arr)) arr = [arr];
    return arr.map(skill => {
        if (typeof skill === "string") return highlightText(skill, filter);
        if ("title" in skill) return `<b>${highlightText(skill.title, filter)}</b><br>${highlightText(type===0?skill.normal:skill.awakened, filter)}`;
        if (skill.normal || skill.awakened) return highlightText(type===0?skill.normal:skill.awakened, filter);
        return "";
    }).map(s => "　" + s).join("<br>");
}

// ==== タブ表示 ====
function showTabs(char, filter) {
    const detail = document.getElementById('detail');
    detail.prepend(document.createRange().createContextualFragment(`
        <div class="tabs-wrap" id="detail-tabs">
            <div class="tabs-buttons">
                <button class="tabs-btn${tabMode===0?' active':''}" id="tab-both">比較</button>
                <button class="tabs-btn${tabMode===1?' active':''}" id="tab-normal">覚醒前</button>
                <button class="tabs-btn${tabMode===2?' active':''}" id="tab-awakened">覚醒後</button>
            </div>
        </div>`));
    document.getElementById('tab-both').onclick = ()=>{ tabMode=0; showDetail(char, filter); };
    document.getElementById('tab-normal').onclick = ()=>{ tabMode=1; showDetail(char, filter); };
    document.getElementById('tab-awakened').onclick = ()=>{ tabMode=2; showDetail(char, filter); };
}

// ==== キャラクター詳細表示 ====
function showDetail(char, filter=[]) {
    const detail=document.getElementById('detail');
    if(!char){ detail.textContent="該当キャラクターがありません。"; return; }

    function highlightDetail(val){ if(!val||!filter.length) return val; return highlightText(val,filter); }
    const attrColor=attributes[char.attribute]||"#E0E0E0";

    function getCharImages(name) {
        const base = "image/characters/";
        return [
            base + name + ".png",
            base + name + "_Ex.png"
        ];
    }

    const images = getCharImages(char.name);
    let imageHtml = "";

    if (showImages) {
        imageHtml = `<div class="char-image-container">` +
            images.map(img => `<img src="${img}" alt="${char.name}" class="char-image" onerror="this.style.display='none';">`).join("") +
            `</div>`;
    }

    let mainContent="";

    if(tabMode===0) {
        const bothPanel=(title, arr)=>`<div class="char-section"><div class="char-section-title">${title}</div><div class="char-section-content">${skillBlockBothInline(arr, filter)}</div></div>`;

        mainContent=`
        <div class="char-detail-wrap">
          <div class="char-title" style="color: ${attrColor}">${highlightDetail(char.name)}</div>
          ${imageHtml}
          <div class="char-basic">
            <div class="char-basic-item"><span class="char-label">属性</span><span class="char-value ${attributeClass(char.attribute)}">${highlightDetail(char.attribute)}</span></div>
            <div class="char-basic-item"><span class="char-label">ロール</span><span class="char-value">${highlightDetail(char.role)}</span></div>
            <div class="char-basic-item"><span class="char-label">ポジション</span><span class="char-value">${highlightDetail(char.position)}</span></div>
            <div class="char-basic-item"><span class="char-label">グループ</span><span class="char-value">${(char.group||[]).map(g=>highlightDetail(g)).join(', ')}</span></div>
            <div class="char-basic-item"><span class="char-label">覚醒</span><span class="char-value">${highlightDetail(char.arousal)}</span></div>
          </div>
          <div class="char-section"><div class="char-section-title">コンボ</div><div class="char-section-content">${comboBlock(char.combo, filter)}</div></div>
          ${bothPanel("特殊", char.traits)}
          ${bothPanel("特技1", char.skill1)}
          ${bothPanel("特技2", char.skill2)}
          ${bothPanel("究極奥義", char.ex_ultimate||[])}
          ${bothPanel("奥義", char.ultimate)}
          ${bothPanel("通常攻撃", char.normal_attack||[])}
          ${bothPanel("魔道具1", char.magic_item1)}
          ${bothPanel("魔道具2", char.magic_item2)}
        </div>`;
    } else {
        const type=tabMode===1?0:1;
        const singlePanel=(title, arr)=>`<div class="char-section"><div class="char-section-title">${title}</div><div class="char-section-content">${skillBlockCompare(arr, filter, type)}</div></div>`;

        mainContent=`
        <div class="char-detail-wrap">
          <div class="char-title" style="color: ${attrColor}">${highlightDetail(char.name)}</div>
          ${imageHtml}
          <div class="char-basic">
            <div class="char-basic-item"><span class="char-label">属性</span><span class="char-value ${attributeClass(char.attribute)}">${highlightDetail(char.attribute)}</span></div>
            <div class="char-basic-item"><span class="char-label">ロール</span><span class="char-value">${highlightDetail(char.role)}</span></div>
            <div class="char-basic-item"><span class="char-label">ポジション</span><span class="char-value">${highlightDetail(char.position)}</span></div>
            <div class="char-basic-item"><span class="char-label">グループ</span><span class="char-value">${(char.group||[]).map(g=>highlightDetail(g)).join(', ')}</span></div>
            <div class="char-basic-item"><span class="char-label">覚醒</span><span class="char-value">${highlightDetail(char.arousal)}</span></div>
          </div>
          <div class="char-section"><div class="char-section-title">コンボ</div><div class="char-section-content">${comboBlock(char.combo, filter)}</div></div>
          ${singlePanel("特殊", char.traits)}
          ${singlePanel("特技1", char.skill1)}
          ${singlePanel("特技2", char.skill2)}
          ${singlePanel("究極奥義", char.ex_ultimate||[])}
          ${singlePanel("奥義", char.ultimate)}
          ${singlePanel("通常攻撃", char.normal_attack||[])}
          ${singlePanel("魔道具1", char.magic_item1)}
          ${singlePanel("魔道具2", char.magic_item2)}
        </div>`;
    }

    detail.innerHTML = mainContent;
    showTabs(char, filter);
    applyHighlightDOM(detail, filter);

    if (char && char.CharacterID) {
        const url = new URL(location);
        url.searchParams.set("id", char.CharacterID);
        history.replaceState({}, "", url);
    }
}

// ==== リスト更新 ====
function updateList(resetSelect=false) {
    const list = document.getElementById('list');
    const filter = document.getElementById('filter').value.toLowerCase().split(/[ 　]+/).filter(k=>k);

    let filtered = characters.filter(char =>
        filter.every(k => k === "" || char._search.includes(k))
    );

    // selectedAttrs が空 → 全表示。
    // selectedAttrs に要素がある → 選択された属性のみ表示（OR）
    if (selectedAttrs.size > 0) {
        filtered = filtered.filter(c => selectedAttrs.has(c.attribute));
    }

    if(positionSorted)
        filtered.sort((a,b)=>(parseInt(a.position)||999)-(parseInt(b.position)||999));

    lastFiltered = filtered;
    document.getElementById('hit-count').textContent=`ヒット件数: ${filtered.length}件`;

    list.innerHTML = "";

    filtered.forEach((char,idx)=>{
        const li = document.createElement('li');
        li.textContent = char.name;
        applyHighlightDOM(li, filter);
        li.onclick = () => { tabMode=0; showDetail(char, filter); selectedIdx=idx; highlightSelected(); };
        list.appendChild(li);
    });

    if(filtered.length) {
        if(resetSelect) selectedIdx=0;
        if(selectedIdx<0||selectedIdx>=filtered.length) selectedIdx=0;
        tabMode=0;
        showDetail(filtered[selectedIdx], filter);
        highlightSelected();
    } else showDetail(null);
}

function highlightSelected() {
    document.querySelectorAll('#list li')
        .forEach((li,idx)=> li.classList.toggle('selected', idx===selectedIdx));
}

// ==== キーボード操作 ====
document.addEventListener('keydown', function(e){
    if(!lastFiltered.length) return;
    const filter=getCurrentFilter();

    if(e.key==='ArrowDown'){
        selectedIdx=Math.min(selectedIdx+1,lastFiltered.length-1);
        tabMode=0; showDetail(lastFiltered[selectedIdx], filter);
        highlightSelected(); e.preventDefault();
    }
    if(e.key==='ArrowUp'){
        selectedIdx=Math.max(selectedIdx-1,0);
        tabMode=0; showDetail(lastFiltered[selectedIdx], filter);
        highlightSelected(); e.preventDefault();
    }
});

function getCurrentFilter(){
    return document.getElementById('filter').value.toLowerCase().split(/[ 　]+/).filter(k=>k);
}

// ==== データ読み込み ====
async function loadCharacters() {
    try {
        const resp = await fetch('characters/all_characters.json');
        if(resp.ok){
            characters = await resp.json();

            characters.forEach(char => {
                let parts = [];
                if (char.name) parts.push(char.name);
                if (Array.isArray(char.aliases)) parts.push(...char.aliases);
                parts.push(JSON.stringify(char));
                char._search = parts.join(" ").toLowerCase();
            });

            const params = new URLSearchParams(location.search);
            const q = params.get("id");

            if (q) {
                const targetID = parseInt(q, 10);
                const target = characters.find(c => c.CharacterID === targetID);

                if (target) {
                    // URL指定で表示する場合は選択解除（全表示の状態）
                    selectedAttrs.clear();
                    updateList(true);

                    const filter = getCurrentFilter();
                    tabMode = 0;
                    showDetail(target, filter);

                    const idx = lastFiltered.findIndex(c => c.CharacterID === targetID);
                    if (idx !== -1) {
                        selectedIdx = idx;
                        highlightSelected();
                    }
                    return;
                }
            }

            updateList(true);

        } else {
            document.getElementById('detail').innerText="キャラクターデータの取得に失敗しました";
        }
    } catch(e){
        document.getElementById('detail').innerText="キャラクターデータの取得に失敗しました";
    }
}

loadCharacters();
