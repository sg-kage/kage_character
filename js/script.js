/* =========================================
   グローバル変数・設定
   ========================================= */
let characters = [];        // キャラクター全データ
let positionSorted = false; // ポジション順ソートフラグ
let lastFiltered = [];      // 最後に検索ヒットしたリスト
let selectedIdx = 0;        // リスト内の選択位置
let selectedGroups = new Set(); // 選択中のグループ
let selectedNames = new Set(); // 選択中のキャラ名

// レベル管理変数 (1〜10 または 'inf')
let currentAffinity = 3;
let currentMagicLv = 5;

// 属性・ロール設定
const attributes = {"赤": "#FF6347", "緑": "#32CD32", "黄": "#FFD700", "青": "#1E90FF"};
const roles = ["アタッカー", "タンク", "サポーター"];

// フィルタ選択状態
let selectedAttrs = new Set();
let selectedRoles = new Set();

// 表示モード設定
let tabMode = 0; // 0:比較, 1:覚醒前, 2:覚醒後
let showImages = false;

// DOM要素のキャッシュ
const attrBtns = document.getElementById('attribute-btns');
const roleBtnsContainer = document.getElementById('role-btns');

/* =========================================
   初期化処理 (ローカルストレージ読み込み)
   ========================================= */
// 保存されたレベル設定があれば読み込む
let savedAffinity = localStorage.getItem('kage_affinity');
let savedMagicLv = localStorage.getItem('kage_magicLv');

// 保存値が数値なら変換、'inf'なら文字列のまま保持
if (savedAffinity && savedAffinity !== 'inf') currentAffinity = parseInt(savedAffinity);
else if (savedAffinity === 'inf') currentAffinity = 'inf';

if (savedMagicLv && savedMagicLv !== 'inf') currentMagicLv = parseInt(savedMagicLv);
else if (savedMagicLv === 'inf') currentMagicLv = 'inf';

// ページ読み込み完了時の処理
document.addEventListener('DOMContentLoaded', () => {
  // ★追加: 区切り線用のCSSスタイルを動的に追加
  const style = document.createElement('style');
  style.textContent = `
    .skill-sep {
        border: 0;
        border-bottom: 1px dashed #666; /* 点線 */
        margin: 8px 0;
        opacity: 0.5;
    }
  `;
  document.head.appendChild(style);

  // レベルUIの初期反映
  setAffinity(currentAffinity);
  setMagicLv(currentMagicLv);

  // オプションパネルの開閉設定
  setupOptionPanel();
    
  // スクリーンショットボタンの設定
  setupCaptureButton();
});

/* =========================================
   レベル操作・計算ロジック
   ========================================= */

// スキルLv (親密度) 切り替え
function setAffinity(lv) {
  currentAffinity = lv;
  localStorage.setItem('kage_affinity', lv); // 設定を保存
    
  // 数値表示更新 ('inf'の場合は'∞')
  const display = document.getElementById('affinity-val');
  if(display) display.textContent = (lv === 'inf') ? '∞' : lv;

  // ボタンの選択状態（色）を更新
  document.querySelectorAll('.magic-btn[data-kind="affinity"]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lv == lv);
  });
    
  refreshDetail(); // 表示更新
}

// 魔道具Lv 切り替え
function setMagicLv(lv) {
  currentMagicLv = lv;
  localStorage.setItem('kage_magicLv', lv); // 設定を保存
    
  // 数値表示更新
  const display = document.getElementById('magic-val');
  if(display) display.textContent = (lv === 'inf') ? '∞' : lv;
    
  // ボタンの選択状態（色）を更新
  document.querySelectorAll('.magic-btn[data-kind="magic"]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lv == lv);
  });
    
  refreshDetail(); // 表示更新
}

// 詳細表示の再描画（レベル変更時などに呼ぶ）
function refreshDetail() {
  const filter = getCurrentFilter();
  // 選択中のキャラがいれば、現在のレベル設定で再描画
  if(lastFiltered.length > 0 && lastFiltered[selectedIdx]) {
    showDetail(lastFiltered[selectedIdx], filter);
  }
}

// 数値置換ロジック
function replaceDynamicValues(text, type) {
  if (!text) return text;
    
  return text.replace(/\{([\d.]+),\s*([\d.]+)\}/g, (match, minStr, maxStr) => {
    const min = parseFloat(minStr);
    const max = parseFloat(maxStr);
    let val;
    let isInf = false;

    if (type === 'affinity') {
      if (currentAffinity === 'inf') {
        isInf = true;
      } else {
        const step = (max - min) / 9;
        val = min + (step * (currentAffinity - 1));
      }
    } else {
      if (currentMagicLv === 'inf') {
        isInf = true;
      } else {
        const diff = (max - min) / 2;
        if (currentMagicLv <= 2) val = min;
        else if (currentMagicLv <= 4) val = min + diff;
        else val = max;
      }
    }

    if (isInf) {
      return `<span class="lv-highlight">${min.toFixed(2)}～${max.toFixed(2)}</span>`;
    }
    return `<span class="lv-highlight">${val.toFixed(2)}</span>`;
  });
}

/* =========================================
   フィルタボタン生成
   ========================================= */
const roleBtnMap = {};
const attrBtnMap = {};

// --- 既存のロールボタン生成処理 ---
roles.forEach(role => {
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
  roleBtnsContainer.appendChild(btn);
  roleBtnMap[role] = btn;
});
// ------------------------------------

// ★修正: グループ開閉ボタン（属性の横のコンテナに追加）★
const groupToggleBtn = document.createElement('button');
groupToggleBtn.textContent = "グループ ▼";
groupToggleBtn.className = "attr-btn";
groupToggleBtn.style.background = "#393864";
groupToggleBtn.style.color = "#fff";
groupToggleBtn.style.border = "1px solid #5d5c8d";

groupToggleBtn.onclick = () => {
  const panel = document.getElementById('group-btns');
  const container = document.getElementById('group-btns-container');
  
  panel.classList.toggle('is-open');
  // 開いたときに親コンテナにクラスをつけて、幅100%にする
  container.classList.toggle('expanded');

  if (panel.classList.contains('is-open')) {
    groupToggleBtn.textContent = "グループ ▲";
    groupToggleBtn.style.background = "#5d5c8d"; 
  } else {
    groupToggleBtn.textContent = "グループ ▼";
    groupToggleBtn.style.background = "#393864"; 
  }
};
// 修正: 正しいコンテナに追加
const groupContainer = document.getElementById('group-btns-container');
if(groupContainer) groupContainer.prepend(groupToggleBtn);

// ★修正: キャラ名開閉ボタン（属性の横のコンテナに追加）★
const nameToggleBtn = document.createElement('button');
nameToggleBtn.textContent = "キャラ名 ▼";
nameToggleBtn.className = "attr-btn";
nameToggleBtn.style.background = "#393864";
nameToggleBtn.style.color = "#fff";
nameToggleBtn.style.border = "1px solid #5d5c8d";

nameToggleBtn.onclick = () => {
  const panel = document.getElementById('name-btns');
  const container = document.getElementById('name-btns-container');
  
  panel.classList.toggle('is-open');
  container.classList.toggle('expanded');

  if (panel.classList.contains('is-open')) {
    nameToggleBtn.textContent = "キャラ名 ▲";
    nameToggleBtn.style.background = "#5d5c8d";
  } else {
    nameToggleBtn.textContent = "キャラ名 ▼";
    nameToggleBtn.style.background = "#393864";
  }
};
// 修正: 正しいコンテナに追加
const nameContainer = document.getElementById('name-btns-container');
if(nameContainer) nameContainer.prepend(nameToggleBtn);


function updateRoleBtnColors() {
  roles.forEach(role => {
    const btn = roleBtnMap[role];
    if(!btn) return;
    btn.style.background = selectedRoles.has(role) ? "#2c5d8a" : "#444444";
    btn.style.color = "#E0E0E0";
    btn.style.boxShadow = selectedRoles.has(role) ? "0 0 5px rgba(44, 93, 138, 0.8)" : "none";
  });
}

// 属性ボタン生成
for (const attr of ["赤","緑","黄","青"]) {
  const btn = document.createElement('button');
  btn.textContent = attr;
  btn.className = "attr-btn";
  btn.style.background = "#666666";
  btn.onclick = () => {
    if (selectedAttrs.has(attr)) selectedAttrs.delete(attr);
    else selectedAttrs.add(attr);
    updateAttrBtnColors();
    updateList(true);
  };
  attrBtns.appendChild(btn);
  attrBtnMap[attr] = btn;
}

function updateAttrBtnColors() {
  for (const attr of ["赤","緑","黄","青"]) {
    const btn = attrBtnMap[attr];
    if(!btn) continue;
    btn.style.background = selectedAttrs.has(attr) ? attributes[attr] : "#666666";
  }
}
updateAttrBtnColors();

/* =========================================
   検索・ソート・表示制御
   ========================================= */

// 画像表示切り替え
document.getElementById("toggle-img").addEventListener("change", (e)=>{
  showImages = e.target.checked;
  updateList(false); 
});

// ポジション順ソートボタン
const sortBtn = document.getElementById('sort-btn');
sortBtn.onclick = () => {
  positionSorted = !positionSorted;
  sortBtn.setAttribute("aria-pressed", positionSorted ? "true" : "false");
  updateList(true);
};

// 検索フィルター入力 (プチフリーズ対策済み)
let searchTimeout;
document.getElementById('filter').addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    updateList(true);
  }, 300); // 300ms待機
});
function getCurrentFilter(){
  return document.getElementById('filter').value.toLowerCase().split(/[ 　]+/).filter(k=>k);
}

// テキストハイライト処理 (DOM操作版)
function highlightText(text, keywords){ return text; } 

function applyHighlightDOM(root, keywords) {
  if (!root || !keywords || !keywords.length) return;
    
  const safeWords = keywords.filter(k => k && k.trim()).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!safeWords.length) return;
    
  const splitRegex = new RegExp(`(${safeWords.join('|')})`, 'gi');
  const testRegex = new RegExp(`^(${safeWords.join('|')})$`, 'i');
    
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.parentElement || node.parentElement.closest('.hit') || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
    
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
    
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

// 属性ごとのCSSクラス取得
const attrClassMap = {"赤": "attr-red", "緑": "attr-green", "黄": "attr-yellow", "青": "attr-blue"};
function attributeClass(attr) { return attrClassMap[attr] || ""; }

/* =========================================
   詳細表示 (HTML生成)
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
    if (effect && effect !== "-") {
        res = `<div class="combo-row" style="border:none !important;"><span class="combo-effect">${highlightText(effect, filter)}</span></div>`;
    }
  } 
  else {
    const text = combo || '';
    if (text && text !== "-") {
        res = `<div class="combo-row" style="border:none !important;"><span class="combo-effect">${highlightText(text, filter)}</span></div>`;
    }
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
        return `<div>
          ${skillName ? `<b>${highlightText(skillName, filter)}</b><br>` : ""}
          ${highlightText(text, filter)}
        </div>`;
      }

      const normal = replaceDynamicValues(skill.normal || "", type);
      const awakened = replaceDynamicValues(skill.awakened || "", type);

      if (awakened) {
        const normalText = normal ? `<span class="effect-label normal-label">通常</span>${highlightText(normal, filter)}` : "";
        const awakenedText = `<span class="effect-label awakened-label">覚醒</span>${highlightText(awakened, filter)}`;
        return `<div>
          ${skillName ? `<b>${highlightText(skillName, filter)}</b><br>` : ""}
          ${normalText}<br>${awakenedText}
        </div>`;
      } else {
        return `<div>
          ${skillName ? `<b>${highlightText(skillName, filter)}</b><br>` : ""}
          ${highlightText(normal, filter)}
        </div>`;
      }
    }
    const text = replaceDynamicValues(skill, type);
    if (text === "-") return "";
    return `<div>${highlightText(text, filter)}</div>`;

  })
  .filter(html => html !== "")
  .join('<hr class="skill-sep">');
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
       else if ("title" in skill) rawText = `<b>${skill.title}</b><br>${tabType===0 ? skill.normal : skill.awakened}`;
       else rawText = tabType===0 ? (skill.normal || "") : (skill.awakened || "");
    }
        
    if (rawText === "-") return "";
    return highlightText(replaceDynamicValues(rawText, calcType), filter);

  })
  .filter(s => s !== "")
  .join('<hr class="skill-sep">'); 
}

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

function showDetail(char, filter=[]) {
  const detail=document.getElementById('detail');
  const captureBtn = document.getElementById('capture-btn');
    
  if(!char){ 
    detail.textContent="該当キャラクターがありません。"; 
    if(captureBtn) captureBtn.style.display = 'none';
    return; 
  }
    
  const attrColor=attributes[char.attribute]||"#E0E0E0";
  function highlightDetail(val){ return (val && filter.length) ? highlightText(val, filter) : val; }

  let imageHtml = "";
  if (showImages) {
    const base = "image/characters/";
    const images = [base + char.name + ".png", base + char.name + "_Ex.png"];
    imageHtml = `<div class="char-image-container">${images.map(img => `<img src="${img}" class="char-image" loading="lazy" onerror="this.style.display='none';">`).join("")}</div>`;
  }

  let displayNormalAttack = char.normal_attack;

  let mainContent = `<div class="char-detail-wrap">
      <div class="char-title" style="color: ${attrColor}">${highlightDetail(char.name)}</div>
      ${imageHtml}
      <div class="char-basic">
       <div class="char-basic-item"><span class="char-label">属性</span><span class="char-value ${attributeClass(char.attribute)}">${highlightDetail(char.attribute)}</span></div>
       <div class="char-basic-item"><span class="char-label">ロール</span><span class="char-value">${highlightDetail(char.role)}</span></div>
       <div class="char-basic-item"><span class="char-label">ポジション</span><span class="char-value">${highlightDetail(char.position)}</span></div>
       <div class="char-basic-item"><span class="char-label">グループ</span><span class="char-value">${(char.group||[]).join(', ')}</span></div>
       <div class="char-basic-item"><span class="char-label">覚醒</span><span class="char-value">${char.arousal}</span></div>
      </div>`;

  const comboHtml = `<div class="char-section"><div class="char-section-title">コンボ</div><div class="char-section-content">${comboBlock(char.combo, filter)}</div></div>`;

  if(tabMode===0) {
    const sect = (title, data, isMag=false) => `<div class="char-section"><div class="char-section-title">${title}</div><div class="char-section-content">${skillBlockBothInline(data, filter, isMag)}</div></div>`;
    mainContent += `
      ${sect("究極奥義", char.ex_ultimate||[])}
      ${sect("奥義", char.ultimate)}
      ${sect("特技1", char.skill1)}
      ${sect("特技2", char.skill2)}
      ${sect("特殊", char.traits)}
      ${comboHtml}
      ${sect("通常攻撃", displayNormalAttack||[])}
      ${sect("魔道具1", char.magic_item1, true)}
      ${sect("魔道具2", char.magic_item2, true)}
    </div>`;
  } else {
    const t = tabMode===1 ? 0 : 1;
    const sect = (title, data, isMag=false) => `<div class="char-section"><div class="char-section-title">${title}</div><div class="char-section-content">${skillBlockCompare(data, filter, t, isMag)}</div></div>`;
    mainContent += `
      ${sect("究極奥義", char.ex_ultimate||[])}
      ${sect("奥義", char.ultimate)}
      ${sect("特技1", char.skill1)}
      ${sect("特技2", char.skill2)}
      ${sect("特殊", char.traits)}
      ${comboHtml}
      ${sect("通常攻撃", displayNormalAttack||[])}
      ${sect("魔道具1", char.magic_item1, true)}
      ${sect("魔道具2", char.magic_item2, true)}
    </div>`;
  }

  detail.innerHTML = mainContent;
  showTabs(char, filter);
  applyHighlightDOM(detail, filter);
    
  if(captureBtn) captureBtn.style.display = 'inline-block';
    
  if (char.CharacterID) {
    const url = new URL(location);
    url.searchParams.set("id", char.CharacterID);
    history.replaceState({}, "", url);
  }
}

// リストの更新（検索フィルタ・属性フィルタ適用）
function updateList(resetSelect=false) {
  const list = document.getElementById('list');
  const filter = getCurrentFilter();
    
  let filtered = characters.filter(char => filter.every(k => char._search.includes(k)));

  // 属性・ロールフィルタ
  if (selectedAttrs.size > 0) filtered = filtered.filter(c => selectedAttrs.has(c.attribute));
  if (selectedRoles.size > 0) filtered = filtered.filter(c => selectedRoles.has(c.role));

  // ★修正: キャラ名フィルタ (OR検索、&で分割対応)
  if (selectedNames.size > 0) {
    filtered = filtered.filter(c => {
      // 名前から「[」より前を取り出してトリム
      const cleanName = c.name.split('[')[0].trim();
      // さらに「＆」や「&」で分割
      const names = cleanName.split(/[&＆]/).map(n => n.trim());
      // 分割した名前のいずれかが選択されていればヒット
      return names.some(n => selectedNames.has(n));
    });
  }

  // グループフィルタ
  if (selectedGroups.size > 0) {
    filtered = filtered.filter(c => {
      if (!c.group || !Array.isArray(c.group)) return false;
      return c.group.some(g => selectedGroups.has(g));
    });
  }
  
  // ソート
  if (positionSorted) filtered.sort((a,b)=>(parseInt(a.position)||999)-(parseInt(b.position)||999));

  lastFiltered = filtered;
  document.getElementById('hit-count').textContent=`ヒット件数: ${filtered.length}件`;
    
  list.innerHTML = "";
  filtered.forEach((char,idx)=>{
    const li = document.createElement('li');
    li.textContent = char.name;
    applyHighlightDOM(li, filter);
    
    li.onclick = () => { 
      tabMode=0; 
      showDetail(char, filter); 
      selectedIdx=idx; 
      highlightSelected(); 
      
      // スマホ向け自動スクロール
      if (window.innerWidth <= 700) {
        const detailElement = document.getElementById('detail');
        const offset = 60;
        const elementPosition = detailElement.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({ top: elementPosition - offset, behavior: "smooth" });
      }
    };
    list.appendChild(li);
  });

  if(filtered.length) {
    if(resetSelect) selectedIdx=0;
    showDetail(filtered[selectedIdx], filter);
    highlightSelected();
  } else {
    showDetail(null);
  }
}

function highlightSelected() {
  document.querySelectorAll('#list li').forEach((li,idx)=> li.classList.toggle('selected', idx===selectedIdx));
}

/* =========================================
   画像キャプチャ機能 (html2canvas)
   ========================================= */

function waitImagesLoaded(container) {
    const imgs = Array.from(container.querySelectorAll('img'));
    if (!imgs.length) return Promise.resolve();
    return new Promise(resolve => {
        let count = 0;
        const check = () => { count++; if (count >= imgs.length) resolve(); };
        imgs.forEach(img => {
            try {
                if (img.complete) check();
                else {
                    img.addEventListener('load', check, { once: true });
                    img.addEventListener('error', check, { once: true });
                }
            } catch (e) { check(); }
        });
        setTimeout(resolve, 3000); 
    });
}

function showCaptureOverlay(dataUrl, filename) {
    const existing = document.getElementById('capture-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'capture-overlay';
    Object.assign(overlay.style, {
        position: 'fixed', left: 0, top: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.85)', zIndex: 9999,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '20px', gap: '12px'
    });

    const img = document.createElement('img');
    img.src = dataUrl;
    img.style.maxWidth = '100%';
    img.style.maxHeight = '80vh';
    img.style.borderRadius = '8px';

    const hint = document.createElement('div');
    hint.style.color = '#fff';
    hint.textContent = '※ 画像を長押し/右クリックで保存してください';

    const btnWrap = document.createElement('div');
    btnWrap.style.display = 'flex';
    btnWrap.style.gap = '8px';

    const dlBtn = document.createElement('a');
    dlBtn.textContent = '保存';
    dlBtn.href = dataUrl;
    dlBtn.download = filename || 'capture.png';
    Object.assign(dlBtn.style, {
        background: '#4CAF50', color: '#fff', padding: '10px 14px',
        borderRadius: '6px', textDecoration: 'none'
    });

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '閉じる';
    Object.assign(closeBtn.style, {
        background: '#999', color: '#fff', padding: '10px 14px',
        borderRadius: '6px', border: 'none', cursor: 'pointer'
    });
    closeBtn.onclick = () => overlay.remove();

    btnWrap.appendChild(dlBtn);
    btnWrap.appendChild(closeBtn);
    overlay.appendChild(img);
    overlay.appendChild(hint);
    overlay.appendChild(btnWrap);
    document.body.appendChild(overlay);
}

function setupCaptureButton() {
    const captureBtn = document.getElementById('capture-btn');
    if (!captureBtn) return;
      
    captureBtn.addEventListener('click', async () => {
        const detailArea = document.getElementById('detail');
        if (!detailArea) return;
          
        captureBtn.disabled = true;
        captureBtn.style.opacity = '0.5';
          
        const charNameElement = detailArea.querySelector('.char-title');
        const safeName = charNameElement ? charNameElement.textContent.trim().replace(/[\/\\?%*:|"<>]/g, '_') : 'detail';
        const now = new Date();
        const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
        const filename = `kage_${safeName}_${dateStr}.png`;
          
        try {
            await waitImagesLoaded(detailArea);
            setTimeout(() => { window.scrollBy(0,1); window.scrollBy(0,-1); }, 50); 
              
            const canvas = await html2canvas(detailArea, {
                scale: 2, useCORS: true, allowTaint: false, logging: false
            });
            showCaptureOverlay(canvas.toDataURL('image/png'), filename);
        } catch (err) { 
            console.error(err); 
            alert('キャプチャエラーが発生しました');
        } finally { 
            captureBtn.disabled = false; 
            captureBtn.style.opacity = ''; 
        }
    });
}

/* =========================================
   オプションパネル (Lv設定) の開閉処理
   ========================================= */
function setupOptionPanel() {
  const toggleBtn = document.getElementById('toggle-panel-btn');
  const panel = document.getElementById('level-control-panel');

  if (toggleBtn && panel) {
    toggleBtn.addEventListener('click', () => {
      if (panel.style.display === 'none') {
        panel.style.display = 'block';
        toggleBtn.classList.add('active'); 
      } else {
        panel.style.display = 'none';
        toggleBtn.classList.remove('active');
      }
    });
  }
}

/* =========================================
   その他イベント (キーボード・データ読み込み)
   ========================================= */

document.addEventListener('keydown', (e) => {
  if(!lastFiltered.length) return;
  if(e.key==='ArrowDown'){
    selectedIdx=Math.min(selectedIdx+1,lastFiltered.length-1);
    showDetail(lastFiltered[selectedIdx], getCurrentFilter());
    highlightSelected(); e.preventDefault();
  }
  if(e.key==='ArrowUp'){
    selectedIdx=Math.max(selectedIdx-1,0);
    showDetail(lastFiltered[selectedIdx], getCurrentFilter());
    highlightSelected(); e.preventDefault();
  }
});

async function loadCharacters() {
  try {
    const resp = await fetch('characters/all_characters.json');
    if(resp.ok){
      characters = await resp.json();
      characters.forEach(char => {
        char._search = (char.name + " " + (char.aliases||[]).join(" ") + " " + JSON.stringify(char)).toLowerCase();
      });
      setupNameButtons();
      setupGroupButtons();
      updateList(true);
    }
  } catch(e){ console.error(e); }
}

/* =========================================
   グループボタン自動生成・制御
   ========================================= */
function setupGroupButtons() {
  const container = document.getElementById('group-btns');
  if (!container) return;
  container.classList.remove('is-open'); // 初期化時に閉じる
  container.innerHTML = "";

  const allGroups = new Set();
  characters.forEach(char => {
    if (Array.isArray(char.group)) {
      char.group.forEach(g => allGroups.add(g));
    }
  });

  const getPriority = (str) => {
    const firstChar = str.charAt(0);
    if (/[一-龠]/.test(firstChar)) return 1; 
    if (/[ァ-ヴー]/.test(firstChar)) return 2; 
    if (/[ぁ-ん]/.test(firstChar)) return 3; 
    return 4; 
  };

  const sortedGroups = Array.from(allGroups).sort((a, b) => {
    const priA = getPriority(a);
    const priB = getPriority(b);
    if (priA !== priB) return priA - priB;
    return a.localeCompare(b, 'ja');
  });

  sortedGroups.forEach(groupName => {
    const btn = document.createElement('button');
    btn.textContent = groupName;
    btn.className = "group-btn";
    
    if (selectedGroups.has(groupName)) {
        btn.classList.add('active');
    }

    btn.onclick = () => {
      if (selectedGroups.has(groupName)) {
        selectedGroups.delete(groupName);
        btn.classList.remove('active');
      } else {
        selectedGroups.add(groupName);
        btn.classList.add('active');
      }
      updateList(true);
    };

    container.appendChild(btn);
  });
}

/* =========================================
   キャラ名ボタン自動生成・制御 (修正版: &分割対応)
   ========================================= */
function setupNameButtons() {
  const container = document.getElementById('name-btns');
  if (!container) return;
  container.classList.remove('is-open'); // 初期化時に閉じる
  container.innerHTML = "";

  const allNames = new Set();
  characters.forEach(char => {
    if (char.name) {
      const cleanName = char.name.split('[')[0].trim();
      
      // ★修正: & で分割して個別に登録
      const names = cleanName.split(/[&＆]/);
      names.forEach(n => allNames.add(n.trim()));
    }
  });

  const getPriority = (str) => {
    const firstChar = str.charAt(0);
    if (/[一-龠]/.test(firstChar)) return 1;
    if (/[ァ-ヴー]/.test(firstChar)) return 2;
    if (/[ぁ-ん]/.test(firstChar)) return 3;
    return 4;
  };

  const sortedNames = Array.from(allNames).sort((a, b) => {
    const priA = getPriority(a);
    const priB = getPriority(b);
    if (priA !== priB) return priA - priB;
    return a.localeCompare(b, 'ja');
  });

  sortedNames.forEach(name => {
    const btn = document.createElement('button');
    btn.textContent = name;
    btn.className = "group-btn"; 
    
    if (selectedNames.has(name)) {
        btn.classList.add('active');
    }

    btn.onclick = () => {
      if (selectedNames.has(name)) {
        selectedNames.delete(name);
        btn.classList.remove('active');
      } else {
        selectedNames.add(name);
        btn.classList.add('active');
      }
      updateList(true);
    };

    container.appendChild(btn);
  });
}

// 実行
loadCharacters();