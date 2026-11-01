/**
 * 优视频 (uvod.tv) 专属私有高速云端解析微服务
 * 支持部署平台：Vercel / Deno Deploy / Node.js Standalone
 * 协议：CatVod T4 (FongMi 潘多拉影视 / TVBox 原生标准)
 * 具备 C++ 级 OpenSSL 硬件加速，毫秒级响应，与 Cloudflare 100% 隔离
 */

const crypto = typeof require === 'function' ? require('crypto') : globalThis.crypto;
const https = typeof require === 'function' ? require('https') : null;

// ==================== 1. 加密核心与常量 ====================
const RSA_N = BigInt('0x9e0505a8b563a9b2e3e7dcf000f9b72633c6037c43b33f3ee16ffbc8b55e37bc1255d8570cef61dd72fdc371c205b8457d2d0f2f726b9eb6577df1e92c8daf6f4353a5f2b4e78e94e931b7781de75ebd2b8885689d25d300389283137020185710bd078fb3cd2e5d8d898532e4467d880a60d1fdf6f7d8ec166374063af2dcb9');
const RSA_E = 65537n;
const RSA_D = BigInt('0x75adbbc7263e70545ed17f81e4d813030a2f7eccfe05f125bcf18e8aac36dc3edd50bcea2721e6b9ea36fd642c5fe2192ddd6e9fa1107083cea8668d85b6865ca4227eac5a94336ff0c95e02bb394bd3eacd352abb6e06bb77b51595de214183827df48c89fc85e6b085347d69cbfe03becc26a62e6a9637fe74f2d29715e5d9');
const AES_IV = Buffer.from('abcdefghijklmnop', 'utf8');

function modPow(b, exp, mod) {
    let r = 1n;
    b = b % mod;
    while (exp > 0n) {
        if (exp % 2n === 1n) r = (r * b) % mod;
        exp = exp / 2n;
        b = (b * b) % mod;
    }
    return r;
}

function rsaEncrypt(keyStr) {
    const keyBytes = Buffer.from(keyStr, 'utf8');
    const padLen = 128 - 3 - keyBytes.length;
    const padded = Buffer.alloc(128);
    padded[0] = 0x00;
    padded[1] = 0x02;
    for (let i = 0; i < padLen; i++) padded[2 + i] = 0x01 + Math.floor(Math.random() * 254);
    padded[2 + padLen] = 0x00;
    keyBytes.copy(padded, 3 + padLen);

    const m = BigInt('0x' + padded.toString('hex'));
    const c = modPow(m, RSA_E, RSA_N);
    let cHex = c.toString(16);
    while (cHex.length < 256) cHex = '0' + cHex;
    return Buffer.from(cHex, 'hex').toString('base64');
}

function rsaDecrypt(base64Cipher) {
    const cipherBytes = Buffer.from(base64Cipher, 'base64');
    const c = BigInt('0x' + cipherBytes.toString('hex'));
    const m = modPow(c, RSA_D, RSA_N);
    let mHex = m.toString(16);
    while (mHex.length < 256) mHex = '0' + mHex;
    const mBytes = Buffer.from(mHex, 'hex');
    let zeroIdx = 2;
    while (zeroIdx < mBytes.length && mBytes[zeroIdx] !== 0) zeroIdx++;
    return mBytes.subarray(zeroIdx + 1).toString('utf8');
}

function aesEncrypt(plainText, keyStr) {
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(keyStr, 'utf8'), AES_IV);
    return Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]).toString('base64');
}

function aesDecrypt(base64Text, keyStr) {
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(keyStr, 'utf8'), AES_IV);
    return Buffer.concat([decipher.update(Buffer.from(base64Text, 'base64')), decipher.final()]).toString('utf8');
}

function randomKey(len = 32) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
    let s = '';
    for (let i = 0; i < len; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return s;
}

// ==================== 2. 内存 LRU 缓存与通信 ====================
const memoryCache = new Map();
const CACHE_TTL_DEFAULT = 1800 * 1000; // 30 分钟

function getCache(key) {
    if (!memoryCache.has(key)) return null;
    const entry = memoryCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expire) {
        memoryCache.delete(key);
        return null;
    }
    return entry.data;
}

function setCache(key, data, ttl = CACHE_TTL_DEFAULT) {
    if (!key || data === undefined || data === null) return;
    if (memoryCache.has(key)) memoryCache.delete(key);
    else if (memoryCache.size >= 500) {
        const oldest = memoryCache.keys().next().value;
        if (oldest) memoryCache.delete(oldest);
    }
    memoryCache.set(key, { expire: Date.now() + ttl, data });
}

async function postApi(path, data = {}) {
    const aesKey = randomKey(32);
    const aesCipher = aesEncrypt(JSON.stringify(data), aesKey);
    const rsaCipher = rsaEncrypt(aesKey);
    const payload = `${aesCipher}.${rsaCipher}`;

    const keys = Object.keys(data).filter(k => data[k] !== '' && data[k] !== null && data[k] !== undefined && data[k] !== false).sort();
    const queryParts = keys.map(k => `${encodeURIComponent(k)}=${encodeURIComponent(data[k])}`);
    const queryStr = queryParts.join('&').toLowerCase();
    const timestamp = Date.now();
    const signature = crypto.createHash('md5').update(`-${queryStr}-${timestamp}`).digest('hex');

    const options = {
        hostname: 'api-h5.uvod.tv',
        path: path,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-TOKEN': '',
            'X-TIMESTAMP': String(timestamp),
            'X-SIGNATURE': signature,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Origin': 'https://www.uvod.tv',
            'Referer': 'https://www.uvod.tv/'
        }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const parts = body.split('.');
                    if (parts.length !== 2) return resolve({ error: -1, raw: body });
                    const decKey = rsaDecrypt(parts[1]);
                    const plain = aesDecrypt(parts[0], decKey);
                    resolve(JSON.parse(plain));
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

async function postApiWithCache(path, data = {}, ttl = CACHE_TTL_DEFAULT) {
    const key = `${path}_${JSON.stringify(data)}`;
    const cached = getCache(key);
    if (cached !== null) return cached;

    const res = await postApi(path, data);
    if (res && res.error === 0) setCache(key, res, ttl);
    return res;
}

// ==================== 3. CatVod T4 业务逻辑 ====================
function getHomeFilters() {
    const classes = [
        { type_id: '100', type_name: '电影' },
        { type_id: '101', type_name: '电视剧' },
        { type_id: '102', type_name: '综艺' },
        { type_id: '103', type_name: '动漫' },
        { type_id: '105', type_name: '纪录片' },
        { type_id: '106', type_name: '粤台专区' },
        { type_id: '107', type_name: '少儿' },
        { type_id: '104', type_name: '体育' }
    ];

    const commonYears = [
        { n: '全部', v: '0' },
        { n: '2026', v: '2026' },
        { n: '2025', v: '2025' },
        { n: '2024', v: '2024' },
        { n: '2023', v: '2023' },
        { n: '2022', v: '2022' },
        { n: '2021', v: '2021' },
        { n: '2020', v: '2020' },
        { n: '2019', v: '2019' },
        { n: '2018', v: '2018' },
        { n: '2017', v: '2017' },
        { n: '2016', v: '2016' },
        { n: '2015', v: '2015' },
        { n: '2014', v: '2014' },
        { n: '2013', v: '2013' },
        { n: '2012', v: '2012' },
        { n: '2011', v: '2011' },
        { n: '2010', v: '2010' }
    ];

    const commonRegions = [
        { n: '全部', v: '0' },
        { n: '大陆', v: '大陆' },
        { n: '香港', v: '香港' },
        { n: '台湾', v: '台湾' },
        { n: '欧美', v: '欧美' },
        { n: '日本', v: '日本' },
        { n: '韩国', v: '韩国' },
        { n: '其他', v: '其他' }
    ];

    const movieSubs = [
        { n: '全部', v: '0' },
        { n: '喜剧', v: '109' },
        { n: '爱情', v: '110' },
        { n: '动作', v: '111' },
        { n: '犯罪', v: '112' },
        { n: '科幻', v: '113' },
        { n: '奇幻', v: '114' },
        { n: '冒险', v: '115' },
        { n: '灾难', v: '116' },
        { n: '惊悚', v: '117' },
        { n: '剧情', v: '118' },
        { n: '战争', v: '119' },
        { n: '经典', v: '120' },
        { n: '悬疑', v: '210' },
        { n: '历史', v: '211' }
    ];

    const tvSubs = [
        { n: '全部', v: '0' },
        { n: '国产剧', v: '123' },
        { n: '欧美剧', v: '124' },
        { n: '港台剧', v: '125' },
        { n: '短剧', v: '207' },
        { n: '新马泰', v: '127' },
        { n: '日韩剧', v: '126' },
        { n: '其它剧', v: '128' }
    ];

    const varietySubs = [
        { n: '全部', v: '0' },
        { n: '搞笑', v: '129' },
        { n: '情感', v: '130' },
        { n: '选秀', v: '131' },
        { n: '访谈', v: '132' },
        { n: '时尚', v: '133' },
        { n: '真人秀', v: '134' },
        { n: '脱口秀', v: '135' },
        { n: '演唱会', v: '136' }
    ];

    const animeSubs = [
        { n: '全部', v: '0' },
        { n: '热血', v: '151' },
        { n: '冒险', v: '137' },
        { n: '科幻', v: '139' },
        { n: '恋爱', v: '140' },
        { n: '校园', v: '141' },
        { n: '魔幻', v: '148' },
        { n: '悬疑', v: '158' },
        { n: '治愈', v: '156' },
        { n: '历史', v: '152' }
    ];

    const docSubs = [
        { n: '全部', v: '0' },
        { n: '文化', v: '168' },
        { n: '科技', v: '169' },
        { n: '历史', v: '170' },
        { n: '军事', v: '171' },
        { n: '人物', v: '172' },
        { n: '解密', v: '173' },
        { n: '自然', v: '174' }
    ];

    const yueSubs = [
        { n: '全部', v: '0' },
        { n: '粤台电影', v: '175' },
        { n: '粤台剧集', v: '176' },
        { n: '粤台综艺', v: '177' }
    ];

    const childSubs = [
        { n: '全部', v: '0' },
        { n: '益智', v: '178' },
        { n: '冒险', v: '179' },
        { n: '搞笑', v: '180' },
        { n: '魔幻', v: '181' }
    ];

    const sportSubs = [
        { n: '全部', v: '0' },
        { n: '足球', v: '182' },
        { n: '篮球', v: '183' },
        { n: '网球', v: '184' }
    ];

    const makeFilter = (subs) => [
        { key: 'category_id', name: '分类', value: subs },
        { key: 'region', name: '地区', value: commonRegions },
        { key: 'year', name: '年份', value: commonYears }
    ];

    return {
        class: classes,
        filters: {
            '100': makeFilter(movieSubs),
            '101': makeFilter(tvSubs),
            '102': makeFilter(varietySubs),
            '103': makeFilter(animeSubs),
            '105': makeFilter(docSubs),
            '106': makeFilter(yueSubs),
            '107': makeFilter(childSubs),
            '104': makeFilter(sportSubs)
        }
    };
}

async function getHomeData() {
    const homeInfo = getHomeFilters();
    let list = [];
    try {
        const cats = [100, 101, 102, 103];
        const results = await Promise.all(
            cats.map(cid => postApiWithCache('/video/list', { parent_category_id: cid, page: 1 }, 1800 * 1000))
        );
        for (const res of results) {
            const rawList = (res && res.data && Array.isArray(res.data.video_list)) ? res.data.video_list : [];
            const sliced = rawList.slice(0, 10).map(v => ({
                vod_id: String(v.id),
                vod_name: v.title || '',
                vod_pic: v.pic || '',
                vod_remarks: v.remark || v.state || (v.year ? String(v.year) : '')
            }));
            list.push(...sliced);
        }
    } catch (e) {
        console.error('getHomeData error:', e);
    }
    return {
        class: homeInfo.class,
        filters: homeInfo.filters,
        list: list
    };
}

async function handleCategory(tid, pg, extend = {}) {
    const page = parseInt(pg || 1);
    const payload = {
        parent_category_id: parseInt(tid || 100),
        page: page,
        page_size: 24
    };

    if (extend) {
        const rawCat = extend.category_id || extend.id || extend.class;
        if (rawCat && rawCat !== '0' && rawCat !== '全部' && rawCat !== 'all') {
            const parsedCat = parseInt(rawCat);
            if (!isNaN(parsedCat)) payload.category_id = parsedCat;
        }
        if (extend.year && extend.year !== '0' && extend.year !== '全部' && extend.year !== 'all') {
            const parsedYear = parseInt(extend.year);
            if (!isNaN(parsedYear)) payload.year = parsedYear;
        }
        const rawReg = extend.region || extend.area;
        if (rawReg && rawReg !== '0' && rawReg !== '全部' && rawReg !== 'all') {
            let reg = rawReg;
            if (reg === '港台') reg = '香港';
            else if (reg === '日韩') reg = '日本';
            payload.region = reg;
        }
    }

    const res = await postApiWithCache('/video/list', payload);
    const rawList = (res && res.data && Array.isArray(res.data.video_list)) ? res.data.video_list : [];
    const list = rawList.map(v => ({
        vod_id: String(v.id),
        vod_name: v.title || '',
        vod_pic: v.pic || '',
        vod_remarks: v.remark || v.state || (v.year ? String(v.year) : '')
    }));

    const total = (res && res.data && res.data.video_total) ? res.data.video_total : list.length;
    const pageSize = list.length || 50;
    return {
        page: page,
        pagecount: Math.ceil(total / pageSize) || page,
        limit: pageSize,
        total: total,
        list: list
    };
}

async function handleDetail(id) {
    const vodId = parseInt(id);
    const infoRes = await postApiWithCache('/video/info', { id: vodId });
    const video = (infoRes && infoRes.data && infoRes.data.video) ? infoRes.data.video : {};
    const frags = (infoRes && infoRes.data && Array.isArray(infoRes.data.video_fragment_list)) ? infoRes.data.video_fragment_list : [];

    let epList = [];
    for (let f of frags) {
        const sym = String(f.symbol || '').trim();
        const epName = !sym ? '正片' : (/^\d+$/.test(sym) ? `第${sym}集` : sym);
        epList.push(`${epName}$${vodId}_${f.id}`);
    }

    const vod = [{
        vod_id: String(video.id || id),
        vod_name: video.title || '',
        vod_pic: video.pic || '',
        vod_type_name: video.language || '',
        vod_year: String(video.year || ''),
        vod_area: video.region || '',
        vod_remarks: video.remark || video.state || (video.score ? `${video.score}分` : ''),
        vod_actor: video.starring || '',
        vod_director: video.director || '',
        vod_content: (video.description || '').trim(),
        vod_play_from: '粤语原声专线2',
        vod_play_url: epList.join('#')
    }];

    return { list: vod };
}

async function handleSearch(wd, pg = 1) {
    const page = parseInt(pg || 1);
    const res = await postApiWithCache('/video/list', {
        keyword: wd,
        page: page,
        page_size: 24
    }, 1800 * 1000);

    const rawList = (res && res.data && Array.isArray(res.data.video_list)) ? res.data.video_list : [];
    const list = rawList.map(v => ({
        vod_id: String(v.id),
        vod_name: v.title || '',
        vod_pic: v.pic || '',
        vod_remarks: v.remark || v.state || (v.year ? String(v.year) : '')
    }));

    const total = (res && res.data && res.data.video_total) ? res.data.video_total : list.length;
    const pageSize = list.length || 24;
    return {
        page: page,
        pagecount: Math.ceil(total / pageSize) || page,
        limit: pageSize,
        total: total,
        list: list
    };
}

async function handlePlay(id, flag) {
    const parts = String(id || '').split('_');
    if (parts.length >= 2) {
        const videoId = parseInt(parts[0]);
        const fragId = parseInt(parts[1]);
        const sourceRes = await postApi('/video/source', {
            video_id: videoId,
            video_fragment_id: fragId,
            quality: 4
        });
        const sourceData = (sourceRes && sourceRes.data) ? (sourceRes.data.video_soruce || sourceRes.data.video_source || {}) : {};
        const streamUrl = sourceData.url || '';
        if (streamUrl) {
            return {
                parse: 0,
                url: streamUrl,
                header: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Origin': 'https://www.uvod.tv',
                    'Referer': 'https://www.uvod.tv/'
                }
            };
        }
    }
    return { parse: 0, url: id };
}

// ==================== 4. 统一路由调度器 ====================
async function handleRequest(query = {}) {
    // 1. 播放接口
    if (query.play) {
        return await handlePlay(query.play, query.flag);
    }

    // 2. 详情与搜索与分类接口
    if (query.ids) {
        return await handleDetail(query.ids);
    }
    if (query.wd) {
        return await handleSearch(query.wd, query.pg || 1);
    }
    if (query.t) {
        let extend = {};
        if (query.f) {
            try { extend = JSON.parse(query.f); } catch (e) {}
        } else if (query.ext) {
            try {
                const decoded = Buffer.from(query.ext, 'base64').toString('utf8');
                extend = JSON.parse(decoded);
            } catch (e) {
                try { extend = JSON.parse(query.ext); } catch (e2) {}
            }
        } else {
            extend = query;
        }
        return await handleCategory(query.t, query.pg || 1, extend);
    }

    // 3. 首页与分类过滤接口（?filter=true, ?filter=false, ?ac=filter, ?ac=videolist, 根目录等）
    // 必须同时返回 class (分类列表)、filters (筛选选项) 以及 list (更新推荐视频流)
    return await getHomeData();
}

// ==================== 5. Vercel Serverless Function 适配器 ====================
module.exports = async (req, res) => {
    // 允许跨域
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, User-Agent');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
    }

    try {
        let query = req.query || {};
        if (req.method === 'POST' && req.body) {
            query = { ...query, ...(typeof req.body === 'object' ? req.body : {}) };
        }
        const result = await handleRequest(query);
        res.statusCode = 200;
        res.end(JSON.stringify(result));
    } catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: 500, message: String(err) }));
    }
};

// ==================== 6. 本地独立 Node.js 服务测试 ====================
if (require.main === module) {
    const http = require('http');
    const url = require('url');
    const port = process.env.PORT || 3000;

    const server = http.createServer(async (req, res) => {
        const parsedUrl = url.parse(req.url, true);
        req.query = parsedUrl.query;
        module.exports(req, res);
    });

    server.listen(port, () => {
        console.log(`[OK] Uvod T4 microservice listening on http://localhost:${port}`);
    });
}
