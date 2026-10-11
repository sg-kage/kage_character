/**
 * キャラデータ(characters/all_characters_<locale>.bin)の復号
 * .bin は gzip(JSON) を KEY で XOR したもの。生成は カゲマス図鑑/json/03_publish_site.py
 *
 * 注意:
 *   - KEY は 03_publish_site.py の KEY と一致させること
 *   - kage_site（party / 編成 / tier）が URL 直指定で読み込むため、パスと KageData の API を変えないこと
 *   - 抑止目的の難読化であり、鍵は公開されている
 */
(function () {
    const KEY = new Uint8Array([55, 246, 177, 154, 201, 236, 114, 190, 195, 36, 245, 7, 197, 234, 28, 67,
        50, 139, 123, 193, 59, 163, 167, 39, 124, 70, 205, 28, 223, 47, 135, 165]);

    async function decode(buffer) {
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.length; i++) bytes[i] ^= KEY[i % KEY.length];
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        return JSON.parse(await new Response(stream).text());
    }

    async function load(url, init) {
        const resp = await fetch(url, init);
        if (!resp.ok) throw new Error(`Failed to load ${url}: ${resp.status}`);
        return decode(await resp.arrayBuffer());
    }

    window.KageData = { decode, load };
})();
