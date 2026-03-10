#!/usr/bin/env node
/**
 * 本地脚本：通过 Vercel 线上 API 代理批量获取所有 ptId 的 main_attribute_status
 * 并更新本地 shein_attributes.json
 * 
 * 使用方法:
 *   node scripts/sync-main-attr-status.mjs
 * 
 * 无需本地 SHEIN API 密钥，通过已部署的 Vercel API 代理调用。
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 线上 API 代理地址
const API_BASE = 'https://topm-photo.vercel.app/api/shein';

async function callSheinViaProxy(action, body) {
    const resp = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, body }),
    });

    const json = await resp.json();
    if (!resp.ok || !json.success) {
        throw new Error(json.error || json.details?.msg || `API error: ${action}`);
    }
    return json.data;
}

// ===== 主逻辑 =====

const JSON_PATH = path.resolve(__dirname, '..', 'src', 'data', 'shein_attributes.json');

async function main() {
    // 1. 读取本地 JSON
    console.log('📂 读取 shein_attributes.json...');
    const rawContent = fs.readFileSync(JSON_PATH, 'utf-8');
    const allData = JSON.parse(rawContent);
    const ptIds = allData.map(d => d.ptId);
    console.log(`   共 ${ptIds.length} 个 ptId\n`);

    // 2. 批量获取 mainAttrStatus（每批 10 个，通过线上代理）
    const BATCH_SIZE = 10;
    const statusMap = new Map();
    let done = 0;
    let errors = 0;

    for (let i = 0; i < ptIds.length; i += BATCH_SIZE) {
        const batch = ptIds.slice(i, i + BATCH_SIZE);
        const progress = `[${done}/${ptIds.length}]`;

        try {
            const result = await callSheinViaProxy('attributes', {
                product_type_id_list: batch,
            });

            if (result.info?.data) {
                for (const entry of result.info.data) {
                    if (entry.main_attribute_status !== undefined) {
                        statusMap.set(entry.product_type_id, entry.main_attribute_status);
                    }
                }
                console.log(`  ${progress} ✅ 获取 ${batch.length} 个 (累计 ${statusMap.size})`);
            } else {
                console.log(`  ${progress} ⚠️ 无数据: code=${result.code} msg=${result.msg}`);
            }
        } catch (e) {
            errors++;
            console.log(`  ${progress} ❌ 失败: ${e.message}`);
            if (errors > 5) {
                console.log('\n⚠️ 连续错误过多，停止同步');
                break;
            }
        }

        done += batch.length;

        // 限流保护（Vercel serverless 函数有并发限制）
        if (i + BATCH_SIZE < ptIds.length) {
            await new Promise(r => setTimeout(r, 500));
        }
    }

    // 3. 统计
    const disabledCount = [...statusMap.values()].filter(s => s === 3).length;
    console.log(`\n📊 结果: ${statusMap.size}/${ptIds.length} 个已获取, ${disabledCount} 个主规格禁用`);

    if (statusMap.size === 0) {
        console.log('⚠️ 没有获取到任何数据，不更新文件');
        return;
    }

    // 4. 更新 JSON
    let updated = 0;
    for (const entry of allData) {
        const status = statusMap.get(entry.ptId);
        if (status !== undefined) {
            entry.mainAttrStatus = status;
            updated++;
        }
    }

    // 5. 写入文件
    fs.writeFileSync(JSON_PATH, JSON.stringify(allData, null, 2), 'utf-8');
    console.log(`\n✅ 已更新 ${updated} 个 ptId 的 mainAttrStatus 到 shein_attributes.json`);

    // 6. 显示禁用的 ptId
    if (disabledCount > 0) {
        console.log('\n⚡ 以下 ptId 的主规格已禁用 (mainAttrStatus=3):');
        for (const [ptId, status] of statusMap) {
            if (status === 3) console.log(`   ptId=${ptId}`);
        }
    }
}

main().catch(e => {
    console.error('❌ 脚本出错:', e);
    process.exit(1);
});
