// ==== キャラクター検索用変数 ====
let characters = [];
let positionSorted = false;
let lastFiltered = [];
let selectedIdx = 0;

// ★追加：レベル管理用変数
let currentAffinity = 1; // 1～10
let currentMagicLv = 1; // 1～5

const attributes = {"赤": "#FF6347", "緑": "#32CD32", "黄": "#FFD700", "青": "#1E90FF"};
const attrBtns = document.getElementById('attribute-btns');

// 仕様：選択（＝フィルタ対象）を保持するセット
let selectedAttrs = new Set();
let tabMode = 0; // 0:比較, 1:覚醒前, 2:覚醒後
let showImages = false; 

// ==== ロールボタン作成 ====
const roles = ["アタッカー", "タンク", "サポーター"];
let selectedRoles = new Set();
const roleBtnMap = {};
const roleBtnsContainer = document.getElementById('role-btns');

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

function updateRoleBtnColors() {
  roles.forEach(role => {
    const btn = roleBtnMap[role];
    if(!btn) return;
    btn.style.background = selectedRoles.has(role) ? "#2c5d8a" : "#444444";
    btn.style.color = "#E0E0E0";
    btn.style.boxShadow = selectedRoles.has(role) ? "0 0 5px rgba(44, 93, 138, 0.8)" : "none";
  });
}

// ==== ★レベル操作UIの連動設定 ====
const savedAffinity = localStorage.getItem('kage_affinity');
const savedMagicLv = localStorage.getItem('kage_magicLv');

if (savedAffinity) currentAffinity = parseInt(savedAffinity);
if (savedMagicLv) currentMagicLv = parseInt(savedMagicLv);

// ページ読み込み完了時にUIに反映させる
document.addEventListener('DOMContentLoaded', () => {
  setAffinity(currentAffinity);
  setMagicLv(currentMagicLv);
});

// スキルLv (親密度) 切り替え関数
function setAffinity(lv) {
  currentAffinity = lv;
  localStorage.setItem('kage_affinity', lv); // ★保存
  
  // 数値表示更新
  const display = document.getElementById('affinity-val');
  if(display) display.textContent = currentAffinity;

  // ボタンの色更新
  document.querySelectorAll('.magic-btn[data-kind="affinity"]').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.lv) === lv);
  });
  
  refreshDetail();
}

// 魔道具Lv切り替え関数
function setMagicLv(lv) {
  currentMagicLv = lv;
  localStorage.setItem('kage_magicLv', lv); // ★保存
  
  // 数値表示更新
  const display = document.getElementById('magic-val');
  if(display) display.textContent = currentMagicLv;
  
  // ボタンの色更新
  document.querySelectorAll('.magic-btn[data-kind="magic"]').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.lv) === lv);
  });
  
  refreshDetail();
}

function refreshDetail() {
  const filter = getCurrentFilter();
  // 選択中のキャラがいれば再描画して数値を反映
  if(lastFiltered.length > 0 && lastFiltered[selectedIdx]) {
    showDetail(lastFiltered[selectedIdx], filter);
  }
}

// ==== ★数値置換コアロジック ====
function replaceDynamicValues(text, type) {
  if (!text) return text;
  // {最小, 最大} 形式を正規表現で探して置換
  return text.replace(/\{([\d.]+),\s*([\d.]+)\}/g, (match, minStr, maxStr) => {
    const min = parseFloat(minStr);
    const max = parseFloat(maxStr);
    let val;

    if (type === 'affinity') {
      // 親密度: (最大-最小)/9 増え
      const step = (max - min) / 9;
      val = min + (step * (currentAffinity - 1));
    } else {
      // 魔道具: Lv1-2(最小), Lv3-4(最小+増分), Lv5(最大)
      const diff = (max - min) / 2;
      if (currentMagicLv <= 2) val = min;
      else if (currentMagicLv <= 4) val = min + diff;
      else val = max;
    }
    // 四捨五入などのズレを防ぐため小数点2桁。lv-highlightクラスで色変え可能に。
    return `<span class="lv-highlight">${val.toFixed(2)}</span>`;
  });
}

document.getElementById("toggle-img").addEventListener("change", (e)=>{
  showImages = e.target.checked;
  updateList(false);
});

// ==== 属性ボタン作成 ====
const attrBtnMap = {};
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

// ==== ソート・フィルター ====
const sortBtn = document.getElementById('sort-btn');
sortBtn.onclick = () => {
  positionSorted = !positionSorted;
  sortBtn.setAttribute("aria-pressed", positionSorted ? "true" : "false");
  updateList(true);
};

document.getElementById('filter').addEventListener('input', () => updateList(true));

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

// ==== コンボ表示 (数値置換対応) ====
function comboBlock(combo, filter=[]) {
  let res = "";
  if (Array.isArray(combo)) {
    res = combo.map(row => {
      const name = (typeof row === 'object') ? row.name : null;
      const effect = (typeof row === 'object') ? (row.effect ?? '') : row;
      return `<div class="combo-row">${name ? `<b>${highlightText(name, filter)}</b><br>` : ""}<span class="combo-effect">${highlightText(effect, filter)}</span></div>`;
    }).join('');
  } else if (typeof combo === 'object') {
    res = Object.entries(combo).map(([name, effect]) =>
      `<div class="combo-row"><b>${highlightText(name, filter)}</b><br><span class="combo-effect">${highlightText(effect, filter)}</span></div>`
    ).join('');
  } else {
    res = `<div class="combo-row"><span class="combo-effect">${highlightText(combo || '', filter)}</span></div>`;
  }
  return replaceDynamicValues(res, 'affinity');
}

// ==== スキル表示 (通常・比較用) ====
// isMagic=trueのときは「通常」「覚醒」ラベルを出さずにそのまま表示する
function skillBlockBothInline(arr, filter=[], isMagic=false) {
  if (!arr) return "";
  if (!Array.isArray(arr)) arr = [arr];
  const type = isMagic ? 'magic' : 'affinity';

  return arr.map(skill => {
    if (typeof skill === "object") {
      const skillName = skill.title || skill.name || "";
      
      // 魔道具の場合：覚醒概念がないのでそのまま表示
      if (isMagic) {
        const text = replaceDynamicValues(skill.effect || skill.normal || skill.description || "", type);
        return `<div style="margin-bottom:0.7em;">
          ${skillName ? `<b>${highlightText(skillName, filter)}</b><br>` : ""}
          ${highlightText(text, filter)}
        </div>`;
      }

      // 通常スキル：通常・覚醒のラベル付き表示
      const normal = replaceDynamicValues(skill.normal || "", type);
      const awakened = replaceDynamicValues(skill.awakened || "", type);
      const normalText = normal ? `<span class="effect-label normal-label">通常</span>${highlightText(normal, filter)}` : "";
      const awakenedText = awakened ? `<span class="effect-label awakened-label">覚醒</span>${highlightText(awakened, filter)}` : "";
      return `<div style="margin-bottom:0.7em;">
        ${skillName ? `<b>${highlightText(skillName, filter)}</b><br>` : ""}
        ${normalText}${normalText && awakenedText ? "<br>" : ""}${awakenedText}
      </div>`;
    }
    // 文字列だけの場合
    return `<div>${highlightText(replaceDynamicValues(skill, type), filter)}</div>`;
  }).join("");
}

// isMagic=trueのときはタブ(tabType)を無視して常に同じ内容を表示する
function skillBlockCompare(arr, filter=[], tabType=0, isMagic=false) {
  if (!arr) return "";
  if (!Array.isArray(arr)) arr = [arr];
  const calcType = isMagic ? 'magic' : 'affinity';

  return arr.map(skill => {
    let rawText = "";

    if (isMagic) {
       // 魔道具：タブ関係なく中身を表示
       if (typeof skill === "string") rawText = skill;
       else if (typeof skill === "object") rawText = skill.title ? `<b>${skill.title}</b><br>${skill.effect||skill.normal||""}` : (skill.effect||skill.normal||"");
    } else {
       // スキル：タブ(tabType 0=通常, 1=覚醒)に応じて切り替え
       if (typeof skill === "string") rawText = skill;
       else if ("title" in skill) rawText = `<b>${skill.title}</b><br>${tabType===0 ? skill.normal : skill.awakened}`;
       else rawText = tabType===0 ? (skill.normal || "") : (skill.awakened || "");
    }
      
    return highlightText(replaceDynamicValues(rawText, calcType), filter);
  }).map(s => "　" + s).join("<br>");
}

// ==== タブ ====
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

// ==== 画像キャプチャ機能 ====

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

document.addEventListener('DOMContentLoaded', () => {
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
        } catch (err) { console.error(err); alert('キャプチャエラー');
        } finally { captureBtn.disabled = false; captureBtn.style.opacity = ''; }
    });
});

// ==== キャラクター詳細表示 ====
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
    imageHtml = `<div class="char-image-container">${images.map(img => `<img src="${img}" class="char-image" onerror="this.style.display='none';">`).join("")}</div>`;
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

  // コンボ用HTML
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
      ${sect("通常攻撃", char.normal_attack||[])}
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
      ${sect("通常攻撃", char.normal_attack||[])}
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

// ==== リスト・キーボード・データ読み込み ====
function updateList(resetSelect=false) {
  const list = document.getElementById('list');
  const filter = getCurrentFilter();
  let filtered = characters.filter(char => filter.every(k => char._search.includes(k)));

  if (selectedAttrs.size > 0) filtered = filtered.filter(c => selectedAttrs.has(c.attribute));
  if (selectedRoles.size > 0) filtered = filtered.filter(c => selectedRoles.has(c.role));
  if (positionSorted) filtered.sort((a,b)=>(parseInt(a.position)||999)-(parseInt(b.position)||999));

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
    showDetail(filtered[selectedIdx], filter);
    highlightSelected();
  } else {
    showDetail(null);
  }
}

function highlightSelected() {
  document.querySelectorAll('#list li').forEach((li,idx)=> li.classList.toggle('selected', idx===selectedIdx));
}

function getCurrentFilter(){
  return document.getElementById('filter').value.toLowerCase().split(/[ 　]+/).filter(k=>k);
}

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
      updateList(true);
    }
  } catch(e){ console.error(e); }
}

loadCharacters();