/**
 * SHEIN 属性模板全量同步脚本
 * 
 * 使用墨西哥测试店铺的 OpenKey/SecretKey 直接调用 SHEIN API，
 * 遍历所有类目获取完整属性模板并保存为 src/data/shein_attributes.json
 * 
 * 用法: node scripts/sync-shein-attributes.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { createHmac } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

// ===== 墨西哥测试店铺 API 配置 =====
const SHEIN_BASE_URL = 'https://openapi-test01.sheincorp.cn';
const OPEN_KEY = 'B3EA8E9A735147E081DC9DA61BB9A9C2';
const SECRET_KEY = 'E81C68F316C3494E94E3F777897115D1';
const API_PATH = '/open-api/goods/query-attribute-template';

const DELAY_MS = 350;
const BATCH_SIZE = 5;
const OUTPUT_FILE = join(ROOT, 'src/data/shein_attributes.json');

// ===== HMAC-SHA256 签名 =====
function generateSignature(timestamp, path) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let randomKey = '';
    for (let i = 0; i < 5; i++) {
        randomKey += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const value = `${OPEN_KEY}&${timestamp}&${path}`;
    const key = SECRET_KEY + randomKey;
    const hmac = createHmac('sha256', key).update(value).digest('hex').toLowerCase();
    const base64 = Buffer.from(hmac).toString('base64');
    return randomKey + base64;
}

// ===== 调用 API =====
async function fetchAttributes(productTypeId) {
    const timestamp = String(Date.now());
    const signature = generateSignature(timestamp, API_PATH);

    const resp = await fetch(`${SHEIN_BASE_URL}${API_PATH}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json;charset=UTF-8',
            'x-lt-openKeyId': OPEN_KEY,
            'x-lt-timestamp': timestamp,
            'x-lt-signature': signature,
            'language': 'en',
        },
        body: JSON.stringify({ product_type_id_list: [productTypeId] }),
    });

    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
    }

    const result = await resp.json();
    if (result.code !== '0') {
        throw new Error(`API: ${result.code} - ${result.msg}`);
    }

    const rawInfos = result?.info?.data?.[0]?.attribute_infos || [];
    return rawInfos.map(a => ({
        id: a.attribute_id,
        name: a.attribute_name_en || a.attribute_name,
        type: a.attribute_type,
        label: a.attribute_label ?? 0,
        mode: a.attribute_mode ?? 1,
        req: a.attribute_is_show === 1,
        vals: (a.attribute_value_info_list || []).map(v => ({
            id: v.attribute_value_id,
            name: v.attribute_value_en || v.attribute_value,
        })),
    }));
}

// ===== 主流程 =====
console.log('📂 读取本地类目数据...');
const catFile = join(ROOT, 'src/data/shein_leaf_categories.json');
const categories = JSON.parse(readFileSync(catFile, 'utf-8'));
const uniquePtIds = [...new Set(categories.map(c => c.typeId))];
console.log(`📊 ${uniquePtIds.length} 个唯一 productTypeId`);
console.log(`🌐 ${SHEIN_BASE_URL}`);
console.log(`🔑 墨西哥测试店铺 OpenKey: ${OPEN_KEY.slice(0, 8)}...\n`);

// 测试连接
console.log('🔑 测试 API 连接...');
try {
    const testAttrs = await fetchAttributes(uniquePtIds[0]);
    console.log(`✅ 成功！ptId=${uniquePtIds[0]} 有 ${testAttrs.length} 个属性\n`);
} catch (err) {
    console.error(`❌ 失败: ${err.message}`);
    process.exit(1);
}

// 批量同步
const allData = [];
let synced = 0;
let failed = 0;
const startTime = Date.now();

for (let i = 0; i < uniquePtIds.length; i += BATCH_SIZE) {
    const batch = uniquePtIds.slice(i, i + BATCH_SIZE);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const avgTime = synced > 0 ? (Date.now() - startTime) / synced / 1000 : 0.5;
    const remaining = Math.round(avgTime * (uniquePtIds.length - synced - failed));
    const eta = remaining > 60 ? `~${Math.round(remaining / 60)}m` : `~${remaining}s`;

    process.stdout.write(
        `\r📦 ${synced + failed}/${uniquePtIds.length} (✅${synced} ❌${failed}) | ${elapsed}s | ETA ${eta}   `
    );

    const results = await Promise.allSettled(
        batch.map(ptId => fetchAttributes(ptId).then(attrs => ({ ptId, attrs })))
    );

    for (const r of results) {
        if (r.status === 'fulfilled') { allData.push(r.value); synced++; }
        else failed++;
    }

    await new Promise(r => setTimeout(r, DELAY_MS));
}

const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`\n\n✅ 同步完成！ 成功: ${synced} | 失败: ${failed} | 耗时: ${totalTime}s`);

// 保存
console.log(`\n💾 保存到 ${OUTPUT_FILE}...`);
writeFileSync(OUTPUT_FILE, JSON.stringify(allData));
const fileSize = (readFileSync(OUTPUT_FILE).length / 1024 / 1024).toFixed(2);
console.log(`✅ 文件大小: ${fileSize} MB`);
console.log(`📁 ${OUTPUT_FILE}`);
