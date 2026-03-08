/**
 * SHEIN 属性模板全量同步脚本
 * 
 * 直接调用 SHEIN 测试环境 API，自签名 HMAC-SHA256，
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

// ===== SHEIN API 配置 =====
// 测试环境（从截图获取）
const SHEIN_BASE_URL = 'https://openapi-test01.sheincorp.cn';
const OPEN_KEY = '10ADAAA5CE0008CF3585A106B6AFF';
const SECRET_KEY = 'D70A14A37467468AA4F5B96CE42A61F2';
const API_PATH = '/open-api/goods/query-attribute-template';

const DELAY_MS = 350;
const BATCH_SIZE = 5;
const OUTPUT_FILE = join(ROOT, 'src/data/shein_attributes.json');

// ===== HMAC-SHA256 签名（与 api/shein.ts 完全一致）=====
function generateSignature(timestamp, path) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let randomKey = '';
    for (let i = 0; i < 5; i++) {
        randomKey += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // VALUE = OpenKeyId + "&" + Timestamp + "&" + Path
    const value = `${OPEN_KEY}&${timestamp}&${path}`;
    // KEY = SecretKey + RandomKey
    const key = SECRET_KEY + randomKey;
    // HMAC-SHA256 → hex → Base64
    const hmac = createHmac('sha256', key).update(value).digest('hex').toLowerCase();
    const base64 = Buffer.from(hmac).toString('base64');
    // Signature = RandomKey + Base64
    return randomKey + base64;
}

// 调用 API
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
        throw new Error(`HTTP ${resp.status}: ${text.slice(0, 300)}`);
    }

    const result = await resp.json();

    if (result.code !== '0') {
        throw new Error(`API error: ${result.code} - ${result.msg}`);
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
console.log(`📊 共 ${categories.length} 个类目，${uniquePtIds.length} 个唯一 productTypeId`);
console.log(`🌐 API: ${SHEIN_BASE_URL}`);
console.log(`🔑 OpenKey: ${OPEN_KEY.slice(0, 8)}...`);
console.log('');

// 先测试
console.log('🔑 测试 API 连接...');
try {
    const timestamp = String(Date.now());
    const sig = generateSignature(timestamp, API_PATH);
    console.log(`  Timestamp: ${timestamp}`);
    console.log(`  Signature: ${sig.slice(0, 20)}...`);

    const testAttrs = await fetchAttributes(uniquePtIds[0]);
    console.log(`✅ 连接成功！类目 ptId=${uniquePtIds[0]} 有 ${testAttrs.length} 个属性\n`);
} catch (err) {
    console.error(`❌ API 连接失败: ${err.message}`);
    console.error('\n请检查 OPEN_KEY 和 SECRET_KEY 是否正确');
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
        batch.map(async (ptId) => {
            const attrs = await fetchAttributes(ptId);
            return { ptId, attrs };
        })
    );

    for (const result of results) {
        if (result.status === 'fulfilled') {
            allData.push(result.value);
            synced++;
        } else {
            failed++;
        }
    }

    await new Promise(r => setTimeout(r, DELAY_MS));
}

const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

console.log(`\n\n✅ 同步完成！`);
console.log(`   成功: ${synced}/${uniquePtIds.length}`);
console.log(`   失败: ${failed}`);
console.log(`   耗时: ${totalTime}s`);

// 保存文件
console.log(`\n💾 保存到 ${OUTPUT_FILE}...`);
writeFileSync(OUTPUT_FILE, JSON.stringify(allData));

const fileSize = (readFileSync(OUTPUT_FILE).length / 1024 / 1024).toFixed(2);
console.log(`✅ 已保存！文件大小: ${fileSize} MB`);
console.log(`📁 路径: ${OUTPUT_FILE}`);
