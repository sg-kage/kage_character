// ==== モーダルHTMLを挿入 ====
function insertModal() {
  const modalHTML = `
  <!-- 利用規約モーダル -->
  <div id="terms-modal-bg">
    <div id="terms-modal">
      <div id="terms-modal-text">
        健全なプレイヤーのみ使用可能です。<br>
        （<a href="https://aiming-inc.com/ja/tos/" target="_blank" rel="noopener">Aiming</a>の利用規約を遵守してください）<br><br>
        最低限以下に該当する行為をしていない、<br>または過去にしていないことが条件です<br><br>
        ・チート行為<br>
        ・グリッチ行為<br>　（例：意図的なギルメンの入れ替えによる加算）<br>
        ・サブアカウントの使用<br>
        ・金銭のやり取り<br>
        ・外部ツールを使ったデータ取得<br><br>
        <button id="show-original-terms-btn" type="button">オリジナル利用規約抜粋を見る</button><br>
        これらに該当しませんか？
      </div>
      <button id="agree-btn" type="button">はい</button>
      <button id="deny-btn" type="button">いいえ</button>
    </div>
  </div>

  <!-- オリジナル利用規約モーダル -->
  <div id="original-terms-modal-bg" class="hidden">
    <div id="original-terms-modal">
      <b>【オリジナル利用規約抜粋】</b><br>
      ・利用者は本サイトの内容を無断転載・再配布してはなりません。<br>
      ・自動取得スクリプトなどの使用は禁止されています。<br><br>
      <button id="close-original-terms-btn" type="button">閉じる</button>
    </div>
  </div>`;

  document.getElementById("modal-container").innerHTML = modalHTML;
  initModalEvents();
}

// ==== モーダル動作 ====
function initModalEvents() {
  const TERMS_KEY = "kageCharacterTermsAgreed";
  const termsModal = document.getElementById("terms-modal-bg");
  const agreeBtn = document.getElementById("agree-btn");
  const denyBtn = document.getElementById("deny-btn");
  const showOriginalBtn = document.getElementById("show-original-terms-btn");
  const originalModal = document.getElementById("original-terms-modal-bg");
  const closeOriginalBtn = document.getElementById("close-original-terms-btn");

  // 初回のみ利用規約を表示
  if (!localStorage.getItem(TERMS_KEY)) {
    termsModal.style.display = "flex";
  }

  agreeBtn.addEventListener("click", () => {
    localStorage.setItem(TERMS_KEY, "1");
    termsModal.style.display = "none";
  });

  denyBtn.addEventListener("click", () => {
    alert("ご利用いただけません。");
    window.location.href = "https://aiming-inc.com/ja/tos/";
  });

  showOriginalBtn.addEventListener("click", () => {
    originalModal.classList.remove("hidden");
  });

  closeOriginalBtn.addEventListener("click", () => {
    originalModal.classList.add("hidden");
  });
}

// ==== ページ読み込み時 ====
window.addEventListener("DOMContentLoaded", insertModal);
