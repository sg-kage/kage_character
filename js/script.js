/* =========================================
   グローバル変数・設定
   ========================================= */
let characters = [];        // キャラクター全データ
let positionSorted = false; // ポジション順ソートフラグ
let lastFiltered = [];      // 最後に検索ヒットしたリスト
let selectedIdx = 0;        // リスト内の選択位置

// レベル管理変数 (1〜10 または 'inf')
let currentAffinity = 1;
let currentMagicLv = 1;

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
      return `<span class="lv-highlight">${min.toFixed(2)} ～ ${max.toFixed(2)}</span>`;
    }
    return `<span class="lv-highlight">${val.toFixed(2)}</span>`;
  });
}

/* =========================================
   フィルタボタン生成
   ========================================= */
const roleBtnMap = {};
const attrBtnMap = {};

// ロールボタン生成
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

// 検索フィルター入力
document.getElementById('filter').addEventListener('input', () => updateList(true));

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

// コンボ情報のHTML生成 (修正: 既存の線を消しつつ、新しい点線で繋ぐ)
function comboBlock(combo, filter=[]) {
  let res = "";
  if (Array.isArray(combo)) {
    res = combo
      // テキスト取得
      .map(row => (typeof row === 'object') ? (row.effect ?? '') : row)
      // 「-」や空文字を除外
      .filter(text => text && text !== "-")
      // HTML生成
      // ★ここで style="border:none" を入れて、元々CSSでついていた線を消す
      .map(text => `<div class="combo-row" style="border:none !important;"><span class="combo-effect">${highlightText(text, filter)}</span></div>`)
      // ★その上で、新しい点線(hr)で繋ぐ
      .join('<hr class="skill-sep">');
  } 
  else if (typeof combo === 'object' && combo !== null) {
    const effect = combo.effect ?? '';
    if (effect && effect !== "-") {
        // 単体の場合は線は不要だが、念のためborderは消しておく
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
// スキル情報のHTML生成 (通常・覚醒 並列表示)
// スキル情報のHTML生成 (修正: 余白を削除して、線との隙間を詰める)
function skillBlockBothInline(arr, filter=[], isMagic=false) {
  if (!arr) return "";
  if (!Array.isArray(arr)) arr = [arr];
  const type = isMagic ? 'magic' : 'affinity';

  return arr.map(skill => {
    if (typeof skill === "object") {
      const skillName = skill.title || skill.name || "";
       
      if (isMagic) {
        const text = replaceDynamicValues(skill.effect || skill.normal || skill.description || "", type);
        // ★修正: style="margin-bottom:0.7em;" を削除
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
        
        // ★修正: style="margin-bottom:0.7em;" を削除
        return `<div>
          ${skillName ? `<b>${highlightText(skillName, filter)}</b><br>` : ""}
          ${normalText}<br>${awakenedText}
        </div>`;
      } else {
        // ★修正: style="margin-bottom:0.7em;" を削除
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

// スキル情報のHTML生成 (比較表示：タブ切り替え用)
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
  .map(s => "　" + s)
  .join('<hr class="skill-sep">'); 
}

// タブ生成
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

// キャラクター詳細のメイン描画関数
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

  // 画像HTML生成
  let imageHtml = "";
  if (showImages) {
    const base = "image/characters/";
    const images = [base + char.name + ".png", base + char.name + "_Ex.png"];
    imageHtml = `<div class="char-image-container">${images.map(img => `<img src="${img}" class="char-image" onerror="this.style.display='none';">`).join("")}</div>`;
  }

  let displayNormalAttack = char.normal_attack;

  // 基本情報エリア
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

  // コンボ（共通）
  const comboHtml = `<div class="char-section"><div class="char-section-title">コンボ</div><div class="char-section-content">${comboBlock(char.combo, filter)}</div></div>`;

  // タブモードに応じた内容生成
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
  applyHighlightDOM(detail, filter); // ハイライト適用
   
  // キャプチャボタン表示
  if(captureBtn) captureBtn.style.display = 'inline-block';
   
  // URLパラメータ更新
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
   
  // キーワードフィルタ
  let filtered = characters.filter(char => filter.every(k => char._search.includes(k)));

  // 属性・ロールフィルタ
  if (selectedAttrs.size > 0) filtered = filtered.filter(c => selectedAttrs.has(c.attribute));
  if (selectedRoles.size > 0) filtered = filtered.filter(c => selectedRoles.has(c.role));
   
  // ソート
  if (positionSorted) filtered.sort((a,b)=>(parseInt(a.position)||999)-(parseInt(b.position)||999));

  lastFiltered = filtered;
  document.getElementById('hit-count').textContent=`ヒット件数: ${filtered.length}件`;
   
  // リスト再構築
  list.innerHTML = "";
  filtered.forEach((char,idx)=>{
    const li = document.createElement('li');
    li.textContent = char.name;
    applyHighlightDOM(li, filter);
    li.onclick = () => { tabMode=0; showDetail(char, filter); selectedIdx=idx; highlightSelected(); };
    list.appendChild(li);
  });

  // 詳細表示の更新
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

// 画像読み込み待ち（空白防止）
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
        setTimeout(resolve, 3000); // タイムアウト
    });
}

// 生成された画像を表示するオーバーレイ
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
            setTimeout(() => { window.scrollBy(0,1); window.scrollBy(0,-1); }, 50); // レンダリング補正
             
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
        // 開く
        panel.style.display = 'block';
        toggleBtn.classList.add('active'); // ボタン色変更
      } else {
        // 閉じる
        panel.style.display = 'none';
        toggleBtn.classList.remove('active');
      }
    });
  }
}

/* =========================================
   その他イベント (キーボード・データ読み込み)
   ========================================= */

// 上下キーでリスト選択
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

// JSONデータ読み込み
async function loadCharacters() {
  try {
    const resp = await fetch('characters/all_characters.json');
    if(resp.ok){
      characters = await resp.json();
      // 検索用文字列の作成
      characters.forEach(char => {
        char._search = (char.name + " " + (char.aliases||[]).join(" ") + " " + JSON.stringify(char)).toLowerCase();
      });
      updateList(true);
    }
  } catch(e){ console.error(e); }
}

// 実行
loadCharacters();