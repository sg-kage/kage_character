/**
 * ==============================================================================
 * i18n ローダー (多言語対応の土台)
 * ------------------------------------------------------------------------------
 * 役割:
 *   - 表示ロケールを解決する (?lang= / localStorage / 既定 ja)
 *   - i18n/<locale>.json を読み込み、t()/applyStaticDom() を提供する
 *   - 未訳キー (null / 空文字) は既定ロケール(ja)へ自動フォールバック
 *
 * 注意:
 *   - 切り替えUIはヘッダー右上の #lang-select（script.js の setupLangControl）。
 *   - キャラデータ(属性/ロール/グループ名など)の翻訳はUIリソースではなく
 *     キャラデータファイル(characters/all_characters_<locale>.json)側で行う。
 *   - script.js は DOMContentLoaded 内で必ず `await I18N.ready` してから使うこと。
 * ==============================================================================
 */
(function () {
  const SUPPORTED = ['ja', 'en'];
  const DEFAULT_LOCALE = 'ja';
  const STORAGE_KEY = 'kage_lang';

  // --- ロケール解決 (優先度: URLパラメータ > localStorage > 既定) ---
  function resolveLocale() {
    try {
      const p = new URLSearchParams(location.search).get('lang');
      if (p && SUPPORTED.includes(p)) return p;
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && SUPPORTED.includes(saved)) return saved;
    } catch (_) { /* localStorage 不可環境でも既定で動く */ }
    return DEFAULT_LOCALE;
  }

  const locale = resolveLocale();
  let dict = {};       // 表示ロケールの辞書
  let fallback = {};   // 既定(ja)辞書。常に読み込む

  // ドット区切りキーで辞書を引く ("section.ultimate" など)
  function dig(obj, key) {
    return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }

  // 未訳(null/undefined/空文字)は既定ロケールへフォールバック
  function resolve(key) {
    let v = dig(dict, key);
    if (v == null || v === '') v = dig(fallback, key);
    return v;
  }

  /**
   * 文字列を取得する。vars があれば {name} を差し込む。
   * 見つからなければキー名をそのまま返す(壊さない)。
   */
  function t(key, vars) {
    let s = resolve(key);
    if (s == null || s === '') return key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
    return s;
  }

  /**
   * data-i18n 属性を持つ要素にテキストを流し込む。
   *   data-i18n="key"           → textContent
   *   data-i18n-html="key"      → innerHTML (リンク等を含む文言用)
   *   data-i18n-attr="attr:key" → 指定属性 (";" 区切りで複数可)
   */
  function applyStaticDom(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    scope.querySelectorAll('[data-i18n-html]').forEach(el => {
      el.innerHTML = t(el.getAttribute('data-i18n-html'));
    });
    scope.querySelectorAll('[data-i18n-attr]').forEach(el => {
      el.getAttribute('data-i18n-attr').split(';').forEach(pair => {
        const idx = pair.indexOf(':');
        if (idx < 0) return;
        const attr = pair.slice(0, idx).trim();
        const key = pair.slice(idx + 1).trim();
        if (attr && key) el.setAttribute(attr, t(key));
      });
    });
  }

  async function fetchDict(loc) {
    const resp = await fetch(`i18n/${loc}.json`, { cache: 'no-cache' });
    if (!resp.ok) throw new Error(`i18n load failed: ${loc} (${resp.status})`);
    return resp.json();
  }

  // --- 初期化 (script.js はこの ready を待つ) ---
  const ready = (async () => {
    try {
      fallback = await fetchDict(DEFAULT_LOCALE);
    } catch (e) {
      console.error('[i18n] 既定辞書の読み込みに失敗:', e);
      fallback = {};
    }
    if (locale === DEFAULT_LOCALE) {
      dict = fallback;
    } else {
      try {
        dict = await fetchDict(locale);
      } catch (e) {
        console.warn(`[i18n] ${locale} の読み込みに失敗。ja へフォールバックします。`, e);
        dict = fallback;
      }
    }
    document.documentElement.setAttribute('lang', locale);
    applyStaticDom();
  })();

  window.I18N = {
    locale,            // 表示ロケール
    dataLocale: locale, // キャラデータの取得に使うロケール (将来 UI と分離する余地)
    DEFAULT_LOCALE,
    SUPPORTED,
    t,
    applyStaticDom,
    ready,
    /** 言語を切り替えて再読み込み (切り替えUIを付けるときの入口) */
    setLocale(loc) {
      if (!SUPPORTED.includes(loc)) return;
      try { localStorage.setItem(STORAGE_KEY, loc); } catch (_) {}
      const url = new URL(location.href);
      url.searchParams.set('lang', loc);
      location.href = url.toString();
    }
  };
})();
