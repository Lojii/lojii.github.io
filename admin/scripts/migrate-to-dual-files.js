import fs from 'fs/promises';
import path from 'path';
import { saveItem } from './utils/item-storage.js';

const DATA_DIR = 'docs/data';
const COLLECTIONS_FILE = path.join(DATA_DIR, 'collections.json');
const ITEMS_DIR = path.join(DATA_DIR, 'items');

async function main() {
    console.log('\n🔄 迁移到双文件结构\n');
    console.log('将每个 item 拆分为：');
    console.log('  - {id}.json (轻量版，无 originalContent)');
    console.log('  - {id}.full.json (完整版，含 originalContent)\n');

    // 读取所有 item IDs
    const itemIds = JSON.parse(await fs.readFile(COLLECTIONS_FILE, 'utf-8'));
    console.log(`📦 共 ${itemIds.length} 个项目需要迁移\n`);

    let migrated = 0, skipped = 0, failed = 0;

    for (let i = 0; i < itemIds.length; i++) {
        const id = itemIds[i];
        process.stdout.write(`[${i + 1}/${itemIds.length}] ${id}... `);

        try {
            const itemFile = path.join(ITEMS_DIR, `${id}.json`);
            const fullFile = path.join(ITEMS_DIR, `${id}.full.json`);

            // 检查是否已经迁移（full 文件存在）
            try {
                await fs.access(fullFile);
                console.log('⏭️  已迁移');
                skipped++;
                continue;
            } catch {
                // full 文件不存在，需要迁移
            }

            // 读取原始文件
            const itemData = JSON.parse(await fs.readFile(itemFile, 'utf-8'));

            // 如果没有 originalContent 字段，添加为 null
            if (!('originalContent' in itemData)) {
                itemData.originalContent = null;
            }

            // 使用 saveItem 保存双文件
            await saveItem(id, itemData);

            console.log('✅');
            migrated++;
        } catch (err) {
            console.log(`❌ ${err.message}`);
            failed++;
        }
    }

    console.log(`\n✅ 迁移完成:`);
    console.log(`   成功: ${migrated}`);
    console.log(`   跳过: ${skipped}`);
    console.log(`   失败: ${failed}`);

    // 统计文件大小
    if (migrated > 0) {
        console.log('\n📊 对比第一个迁移的文件大小:');
        try {
            const firstId = itemIds.find(async id => {
                try {
                    await fs.access(path.join(ITEMS_DIR, `${id}.full.json`));
                    return true;
                } catch {
                    return false;
                }
            });

            if (firstId) {
                const lightFile = path.join(ITEMS_DIR, `${firstId}.json`);
                const fullFile = path.join(ITEMS_DIR, `${firstId}.full.json`);

                const lightStat = await fs.stat(lightFile);
                const fullStat = await fs.stat(fullFile);

                const reduction = ((fullStat.size - lightStat.size) / fullStat.size * 100).toFixed(1);

                console.log(`   完整版: ${(fullStat.size / 1024).toFixed(2)} KB`);
                console.log(`   轻量版: ${(lightStat.size / 1024).toFixed(2)} KB`);
                console.log(`   减少: ${reduction}%`);
            }
        } catch (err) {
            console.log(`   (无法计算: ${err.message})`);
        }
    }

    console.log('\n💡 提示:');
    console.log('   - 首页会自动加载轻量版 JSON（更快）');
    console.log('   - 详情页会加载完整版 JSON（含 originalContent）');
    console.log('   - 原始的 {id}.json 文件已被轻量版覆盖');
}

main().catch(console.error);
