#!/usr/bin/env node
/**
 * 本地脚本：通过 Vercel 线上 API 代理批量更新所有 ptId 的完整属性数据
 * 
 * 使用方法:
 *   node scripts/sync-all-attributes.mjs
 * 
 * 这个脚本会：
 * 1. 读取本地 shein_attributes.json 的所有 ptId
 * 2. 通过线上 API 获取每个 ptId 的最新属性模板
 * 3. 更新本地 JSON 文件（保留 mainAttrStatus + 更新 attrs）
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_BASE = 'https://topm-photo.vercel.app/api/shein';
const JSON_PATH = path.resolve(__dirname, '..', 'src', 'data', 'shein_attributes.json');

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

function transformAttrs(apiAttrs) {
    return apiAttrs.map(a => ({
        id: a.attribute_id,
        name: a.attribute_name_en || a.attribute_name,
        type: a.attribute_type,
        label: a.attribute_label || 0,
        mode: a.attribute_mode || 1,
        req: a.attribute_is_show === 1,
        status: a.attribute_status,
        vals: (a.attribute_value_info_list || []).map(v => ({
            id: v.attribute_value_id,
            name: v.attribute_value_en || v.attribute_value,
        })),
    }));
}

async function main() {
    console.log('📂 读取 shein_attributes.json...');
    const allData = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'));
    const ptIds = allData.map(d => d.ptId);
    console.log(`   共 ${ptIds.length} 个 ptId\n`);

    const BATCH_SIZE = 10;
    let done = 0;
    let updated = 0;
    let errors = 0;

    // 建立 ptId -> index 映射
    const ptIdMap = new Map();
    allData.forEach((item, idx) => ptIdMap.set(item.ptId, idx));

    for (let i = 0; i < ptIds.length; i += BATCH_SIZE) {
        const batch = ptIds.slice(i, i + BATCH_SIZE);
        const progress = `[${done}/${ptIds.length}]`;

        try {
            const result = await callSheinViaProxy('attributes', {
                product_type_id_list: batch,
            });

            if (result.info?.data) {
                for (const entry of result.info.data) {
                    const idx = ptIdMap.get(entry.product_type_id);
                    if (idx === undefined) continue;

                    const existing = allData[idx];
                    const newAttrs = transformAttrs(entry.attribute_infos || []);
                    const oldCount = existing.attrs?.length || 0;

                    // 更新属性列表
                    existing.attrs = newAttrs;

                    // 更新 mainAttrStatus
                    if (entry.main_attribute_status !== undefined) {
                        existing.mainAttrStatus = entry.main_attribute_status;
                    }

                    if (newAttrs.length !== oldCount) {
                        console.log(`  ${progress} 🔄 ptId=${entry.product_type_id}: ${oldCount} → ${newAttrs.length} attrs`);
                    }
                    updated++;
                }
                console.log(`  ${progress} ✅ batch ok (累计更新 ${updated})`);
            } else {
                console.log(`  ${progress} ⚠️ 无数据: code=${result.code}`);
            }
        } catch (e) {
            errors++;
            console.log(`  ${progress} ❌ 失败: ${e.message}`);
            if (errors > 10) {
                console.log('\n⚠️ 错误过多，停止');
                break;
            }
        }

        done += batch.length;

        // 限流保护
        if (i + BATCH_SIZE < ptIds.length) {
            await new Promise(r => setTimeout(r, 500));
        }
    }

    // 写入文件
    console.log(`\n💾 写入文件...`);
    fs.writeFileSync(JSON_PATH, JSON.stringify(allData, null, 2), 'utf-8');
    console.log(`✅ 已更新 ${updated}/${ptIds.length} 个 ptId 的完整属性数据`);

    // 统计 mainAttrStatus
    const disabled = allData.filter(d => d.mainAttrStatus === 3).length;
    console.log(`📊 主规格禁用: ${disabled}/${allData.length}`);
}

main().catch(e => {
    console.error('❌ 脚本出错:', e);
    process.exit(1);
});
