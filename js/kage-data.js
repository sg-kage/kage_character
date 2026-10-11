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
