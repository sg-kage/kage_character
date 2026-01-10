/* =========================================
   グローバル変数・設定
   ========================================= */
let characters = [];        // キャラクター全データ
let positionSorted = false; // ポジション順ソートフラグ
let lastFiltered = [];      // 最後に検索ヒットしたリスト
let selectedIdx = 0;        // リスト内の選択位置
let selectedGroups = new Set(); // 選択中のグループ
let selectedNames = new Set(); // 選択中のキャラ名
let selectedEffects = new Set(); // 選択中の効果（『』内）

// レベル管理変数 (1〜10 または 'inf')
let currentAffinity = 3;
let currentMagicLv = 5;

// 属性・ロール設定
const attributes = {"赤": "#FF6347", "緑": "#32CD32", "黄": "#FFD700", "青": "#1E90FF"};
const roles = ["アタッカー", "タンク", "サポーター"];

// フィルタ選択状態
let selectedAttrs = new Set();
let selectedRoles = new Set();

// 効果フィルタのモード: 'and' または 'or'
let effectMode = 'and';

// 表示モード設定
let tabMode = 0; // 0:比較, 1:覚醒前, 2:覚醒後
let showImages = false;

// DOM要素のキャッシュ
const attrBtns = document.getElementById('attribute-btns');
const roleBtnsContainer = document.getElementById('role-btns');

/* =========================================
   初期化処理 (ローカルストレージ読み込み)
   ========================================= */
let savedAffinity = localStorage.getItem('kage_affinity');
let savedMagicLv = localStorage.getItem('kage_magicLv');

if (savedAffinity && savedAffinity !== 'inf') currentAffinity = parseInt(savedAffinity);
else if (savedAffinity === 'inf') currentAffinity = 'inf';

if (savedMagicLv && savedMagicLv !== 'inf') currentMagicLv = parseInt(savedMagicLv);
else if (savedMagicLv === 'inf') currentMagicLv = 'inf';

document.addEventListener('DOMContentLoaded', () => {
  const style = document.createElement('style');
  style.textContent = `
    .skill-sep {
        border: 0;
        border-bottom: 1px dashed #666;
        margin: 8px 0;
        opacity: 0.5;
    }
  `;
  document.head.appendChild(style);

  setAffinity(currentAffinity);
  setMagicLv(currentMagicLv);
  setupOptionPanel();
  setupCaptureButton();
  setupListHeightControl();
});

/* =========================================
   レベル操作・計算ロジック
   ========================================= */
function setAffinity(lv) {
  currentAffinity = lv;
  localStorage.setItem('kage_affinity', lv);
  const display = document.getElementById('affinity-val');
  if(display) display.textContent = (lv === 'inf') ? '∞' : lv;
  document.querySelectorAll('.magic-btn[data-kind="affinity"]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lv == lv);
  });
  refreshDetail();
}

function setMagicLv(lv) {
  currentMagicLv = lv;
  localStorage.setItem('kage_magicLv', lv);
  const display = document.getElementById('magic-val');
  if(display) display.textContent = (lv === 'inf') ? '∞' : lv;
  document.querySelectorAll('.magic-btn[data-kind="magic"]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lv == lv);
  });
  refreshDetail();
}

function refreshDetail() {
  const filter = getCurrentFilter();
  if(lastFiltered.length > 0 && lastFiltered[selectedIdx]) {
    showDetail(lastFiltered[selectedIdx], filter);
  }
}

function replaceDynamicValues(text, type) {
  if (!text) return text;
  return text.replace(/\{([\d.]+),\s*([\d.]+)\}/g, (match, minStr, maxStr) => {
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
    if (isInf) return `<span class="lv-highlight">${min.toFixed(2)}～${max.toFixed(2)}</span>`;
    return `<span class="lv-highlight">${val.toFixed(02)}</span>`;
  });
}

/* =========================================
   フィルタボタン生成
   ========================================= */
const roleBtnMap = {};
const attrBtnMap = {};

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

const nameToggleBtn = document.createElement('button');
nameToggleBtn.id = "name-toggle-btn";
nameToggleBtn.textContent = "キャラ名 ▼";
nameToggleBtn.className = "attr-btn";
nameToggleBtn.style.background = "#393864";
nameToggleBtn.style.color = "#fff";
nameToggleBtn.style.border = "1px solid #5d5c8d";
nameToggleBtn.onclick = () => {
  const panel = document.getElementById('name-btns');
  panel.classList.toggle('is-open');
  nameToggleBtn.textContent = panel.classList.contains('is-open') ? "キャラ名 ▲" : "キャラ名 ▼";
};
document.getElementById('filter-toggle-row').appendChild(nameToggleBtn);

const groupToggleBtn = document.createElement('button');
groupToggleBtn.id = "group-toggle-btn";
groupToggleBtn.textContent = "グループ ▼";
groupToggleBtn.className = "attr-btn";
groupToggleBtn.style.background = "#393864";
groupToggleBtn.style.color = "#fff";
groupToggleBtn.style.border = "1px solid #5d5c8d";
groupToggleBtn.onclick = () => {
  const panel = document.getElementById('group-btns');
  panel.classList.toggle('is-open');
  groupToggleBtn.textContent = panel.classList.contains('is-open') ? "グループ ▲" : "グループ ▼";
};
document.getElementById('filter-toggle-row').appendChild(groupToggleBtn);

// 新規: 効果トグルボタン
const effectToggleBtn = document.createElement('button');
effectToggleBtn.id = "effect-toggle-btn";
effectToggleBtn.textContent = "効果 ▼";
effectToggleBtn.className = "attr-btn";
effectToggleBtn.style.background = "#393864";
effectToggleBtn.style.color = "#fff";
effectToggleBtn.style.border = "1px solid #5d5c8d";
effectToggleBtn.onclick = () => {
  const panel = document.getElementById('effect-btns');
  panel.classList.toggle('is-open');
  effectToggleBtn.textContent = panel.classList.contains('is-open') ? "効果 ▲" : "効果 ▼";
};
document.getElementById('filter-toggle-row').appendChild(effectToggleBtn);

// 効果モード切替ボタン (AND/OR)
const effectModeBtn = document.createElement('button');
effectModeBtn.id = "effect-mode-btn";
effectModeBtn.textContent = "効果検索: AND";
effectModeBtn.className = "attr-btn";
effectModeBtn.style.background = "#2d6b2d";
effectModeBtn.style.color = "#fff";
effectModeBtn.style.border = "1px solid #4b8f4b";
effectModeBtn.onclick = () => {
  effectMode = (effectMode === 'and') ? 'or' : 'and';
  effectModeBtn.textContent = effectMode === 'and' ? "効果検索: AND" : "効果検索: OR";
  updateList(true);
};

function updateRoleBtnColors() {
  roles.forEach(role => {
    const btn = roleBtnMap[role];
    if(!btn) return;
    btn.style.background = selectedRoles.has(role) ? "#2c5d8a" : "#444444";
    btn.style.color = "#E0E0E0";
  });
}

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
document.getElementById("toggle-img").addEventListener("change", (e)=>{
  showImages = e.target.checked;
  updateList(false); 
});

const sortBtn = document.getElementById('sort-btn');
sortBtn.onclick = () => {
  positionSorted = !positionSorted;
  sortBtn.setAttribute("aria-pressed", positionSorted ? "true" : "false");
  updateList(true);
};

let searchTimeout;
document.getElementById('filter').addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => { updateList(true); }, 300);
});

function getCurrentFilter(){
  return document.getElementById('filter').value.toLowerCase().split(/[ 　]+/).filter(k=>k);
}

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
          <span class="effect-label normal-label">通常</span>${highlightText(normal, filter)}
          <div style="border-top: 1px dashed #555; margin: 6px 0 6px 0; opacity: 0.7;"></div>
          <span class="effect-label awakened-label">覚醒</span>${highlightText(awakened, filter)}
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
       else if ("title" in skill) rawText = `<b>${skill.title}</b><br>${tabType===0 ? skill.normal : skill.awakened}`;
       else rawText = tabType===0 ? (skill.normal || "") : (skill.awakened || "");
    }
    if (rawText === "-") return "";
    return highlightText(replaceDynamicValues(rawText, calcType), filter);
  }).filter(s => s !== "").join('<hr class="skill-sep">'); 
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
  const sect = (title, data, isMag=false) => `<div class="char-section"><div class="char-section-title">${title}</div><div class="char-section-content">${tabMode===0 ? skillBlockBothInline(data, filter, isMag) : (tabMode===1 ? skillBlockCompare(data, filter, 1, isMag) : skillBlockCompare(data, filter, 2, isMag))}</div></div>`;

  mainContent += `
    ${sect("究極奥義", char.ex_ultimate||[])}
    ${sect("奥義", char.ultimate)}
    ${sect("特技1", char.skill1)}
    ${sect("特技2", char.skill2)}
    ${sect("特殊", char.traits)}
    ${comboHtml}
    ${sect("通常攻撃", char.normal_attack||[])}
    ${sect("魔道具1", char.magic_item1, true)}
    ${sect("魔道具2", char.magic_item2, true)}
  </div>`;

  detail.innerHTML = mainContent;
  showTabs(char, filter);
  applyHighlightDOM(detail, filter);
  if(captureBtn) captureBtn.style.display = 'inline-block';
}

/* =========================================
   リスト選択ハイライト
   ========================================= */
function highlightSelected() {
  const list = document.getElementById('list');
  // 子要素を全て取得して判定
  Array.from(list.children).forEach((li, idx) => {
    if (idx === selectedIdx) {
      li.classList.add('selected');
    } else {
      li.classList.remove('selected');
    }
  });
}

/* =========================================
   高速化: リスト描画の最適化 (Fragment使用)
   ========================================= */
function updateList(resetSelect=false) {
  const list = document.getElementById('list');
  const filter = getCurrentFilter();
  
  // 1. フィルタリング (安全策を追加: _searchがない場合のエラー防止)
  let filtered = characters.filter(char => {
    if (!char._search) return false; 
    return filter.every(k => char._search.includes(k));
  });

  if (selectedAttrs.size > 0) filtered = filtered.filter(c => selectedAttrs.has(c.attribute));
  if (selectedRoles.size > 0) filtered = filtered.filter(c => selectedRoles.has(c.role));
  if (selectedNames.size > 0) {
    filtered = filtered.filter(c => {
      const cleanName = c.name.split('[')[0].trim();
      const names = cleanName.split(/[&＆]/).map(n => n.trim());
      return names.some(n => selectedNames.has(n));
    });
  }
  if (selectedGroups.size > 0) {
    // 安全策: c.group が undefined の場合は空配列扱い
    filtered = filtered.filter(c => (c.group || []).some(g => selectedGroups.has(g)));
  }

  // 効果フィルタ
  if (selectedEffects.size > 0) {
    if (effectMode === 'and') {
      filtered = filtered.filter(c => {
        const set = new Set((c._effects||[]));
        for (const e of selectedEffects) if (!set.has(e)) return false;
        return true;
      });
    } else {
      filtered = filtered.filter(c => {
        const set = new Set((c._effects||[]));
        for (const e of selectedEffects) if (set.has(e)) return true;
        return false;
      });
    }
  }

  if (positionSorted) filtered.sort((a,b)=>(parseInt(a.position)||999)-(parseInt(b.position)||999));

  lastFiltered = filtered;
  document.getElementById('hit-count').textContent=`ヒット件数: ${filtered.length}件`;
  
  // 2. ★ DocumentFragmentによる高速描画 ★
  list.innerHTML = ""; 
  const fragment = document.createDocumentFragment();

  filtered.forEach((char,idx)=>{
    const li = document.createElement('li');
    li.textContent = char.name;
    applyHighlightDOM(li, filter);
    li.onclick = () => { tabMode=0; showDetail(char, filter); selectedIdx=idx; highlightSelected(); };
    fragment.appendChild(li);
  });

  list.appendChild(fragment);

  if(filtered.length) {
    if(resetSelect) selectedIdx=0;
    // インデックスが範囲外にならないよう調整
    if (selectedIdx >= filtered.length) selectedIdx = 0;
    
    showDetail(filtered[selectedIdx], filter);
    highlightSelected();
  } else { showDetail(null); }
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

function setupOptionPanel() {
  const btn = document.getElementById('toggle-panel-btn');
  const p = document.getElementById('level-control-panel');
  btn.onclick = () => {
    const isHidden = p.style.display === 'none';
    p.style.display = isHidden ? 'block' : 'none';
    btn.classList.toggle('active', isHidden);
  };
}

/* =========================================
   ソート用ヘルパー関数
   ========================================= */
function getSortPriority(text, type) {
  if (!text) return 99;
  const charCode = text.charCodeAt(0);

  // Unicode範囲定義
  const isKanji = (charCode >= 0x4e00 && charCode <= 0x9fff);
  const isKatakana = (charCode >= 0x30a0 && charCode <= 0x30ff);
  const isHiragana = (charCode >= 0x3040 && charCode <= 0x309f);

  if (type === 'group') {
    // グループ: 漢字(1) -> カタカナ(2) -> ひらがな(3) -> その他(4)
    if (isKanji) return 1;
    if (isKatakana) return 2;
    if (isHiragana) return 3;
    return 4;
  } else if (type === 'name') {
    // キャラ名: カタカナ(1) -> 漢字(2) -> その他(3)
    if (isKatakana) return 1;
    if (isKanji) return 2;
    return 3;
  }
  return 99;
}

function customSort(a, b, type) {
  const priorityA = getSortPriority(a, type);
  const priorityB = getSortPriority(b, type);

  // 優先度が異なる場合は優先度順
  if (priorityA !== priorityB) {
    return priorityA - priorityB;
  }
  // 優先度が同じ場合は文字列の昇順（あいうえお順など）
  return a.localeCompare(b, 'ja');
}

/* =========================================
   グループボタン自動生成・制御
   ========================================= */
function setupGroupButtons() {
  const container = document.getElementById('group-btns');
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

/* =========================================
   キャラ名ボタン自動生成・制御
   ========================================= */
function setupNameButtons() {
  const container = document.getElementById('name-btns');
  const allNames = new Set();
  characters.forEach(c => c.name.split('[')[0].split(/[&＆]/).forEach(n => allNames.add(n.trim())));
  
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

/* =========================================
   効果ボタン自動生成・制御
   ========================================= */
function setupEffectButtons() {
  const container = document.getElementById('effect-btns');
  
  container.innerHTML = ""; 
  effectModeBtn.className = "group-btn"; 
  effectModeBtn.style.background = "#2d6b2d";
  effectModeBtn.style.border = "1px solid #4b8f4b";
  effectToggleBtn.style.setProperty('color', '#ffffff', 'important'); 
  
  container.appendChild(effectModeBtn); 

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
   キャラ読み込み（効果抽出含む）
   ========================================= */
/* =========================================
   高速化: キャラ読み込み & キャッシュ制御
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
      console.log("Using cached data (No download)");
      characters = JSON.parse(localData);
      
      setupGroupButtons();
      setupNameButtons();
      setupEffectButtons();
      updateList(true);
      return; 
    }

    console.log("Downloading new data...");
    const resp = await fetch(jsonUrl);
    if(resp.ok){
      characters = await resp.json();

      const extractEffects = (text, targetSet) => {
        if (!text || typeof text !== 'string') return;
        const matches = text.matchAll(/『([^』]+)』/g);
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

      characters.forEach(c => {
        c._search = (c.name + " " + (c.group||[]).join(" ") + " " + JSON.stringify(c)).toLowerCase();
        
        const effectSet = new Set();
        const targets = [c.ultimate, c.ex_ultimate, c.skill1, c.skill2, c.traits, c.combo, c.magic_item1, c.magic_item2];
        targets.forEach(t => processSkillData(t, effectSet));
        c._effects = Array.from(effectSet);
      });

      try {
        localStorage.setItem(cacheKeyData, JSON.stringify(characters));
        localStorage.setItem(cacheKeyTime, serverLastModified);
      } catch (e) {
        console.warn("Cache quota exceeded", e);
      }

      setupGroupButtons();
      setupNameButtons();
      setupEffectButtons();
      updateList(true);
    }
  } catch (err) {
    console.error("Failed to load characters:", err);
  }
}

loadCharacters();

/* =========================================
   リスト高さ調整機能 (保存機能付き・完全版)
   ========================================= */
function setupListHeightControl() {
  const select = document.getElementById('list-height-select');
  const list = document.getElementById('list');
  
  if (!select || !list) return;

  // ★追加1: 前回の設定を読み込む
  const savedHeight = localStorage.getItem('kage_list_height');
  if (savedHeight) {
    select.value = savedHeight;
  }

  // 高さを適用するメイン関数
  const updateHeight = () => {
    const val = select.value;

    // ★追加2: 設定を変更したら保存する
    localStorage.setItem('kage_list_height', val);
    
    if (val === 'auto') {
      // ■「自動」の場合
      // PC (幅900px以上) は「画面の一番下まで」広げる
      if (window.innerWidth >= 900) {
        const rect = list.getBoundingClientRect();
        // 画面の高さ - リストの上端位置 - 下部余白(20px)
        const availableHeight = window.innerHeight - rect.top - 20; 
        const finalHeight = Math.max(availableHeight, 100);

        list.style.setProperty('height', `${finalHeight}px`, 'important');
        list.style.setProperty('max-height', 'none', 'important');
      } else {
        // スマホはCSSの標準設定(50vh)に戻す
        list.style.removeProperty('height');
        list.style.removeProperty('max-height');
      }
    } else {
      // ■「件数指定」の場合
      const count = parseInt(val);
      
      const firstItem = list.querySelector('li');
      const itemHeight = firstItem ? firstItem.getBoundingClientRect().height : 40;

      const style = window.getComputedStyle(list);
      const padTop = parseFloat(style.paddingTop) || 0;
      const padBottom = parseFloat(style.paddingBottom) || 0;
      const borderTop = parseFloat(style.borderTopWidth) || 0;
      const borderBottom = parseFloat(style.borderBottomWidth) || 0;

      const newHeight = (itemHeight * count) + padTop + padBottom + borderTop + borderBottom + 1;
      
      list.style.setProperty('height', `${newHeight}px`, 'important');
      list.style.setProperty('max-height', 'none', 'important');
    }
  };

  select.addEventListener('change', updateHeight);
  window.addEventListener('resize', updateHeight);

  const toggleBtnIds = ['toggle-panel-btn', 'group-toggle-btn', 'name-toggle-btn', 'effect-toggle-btn'];
  toggleBtnIds.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener('click', () => {
        setTimeout(updateHeight, 50); 
        setTimeout(updateHeight, 300);
      });
    }
  });

  setTimeout(updateHeight, 100);
}