import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = 'docs/data';
const COLLECTIONS_FILE = path.join(DATA_DIR, 'collections.json');
const BACKUP_FILE = COLLECTIONS_FILE + '.backup';
const ITEMS_DIR = path.join(DATA_DIR, 'items');

async function migrate() {
    console.log('\n🔄 开始迁移 collections.json 到轻量级索引结构\n');

    try {
        // 1. 读取旧的 collections.json
        console.log('📖 读取现有 collections.json...');
        const oldData = await fs.readFile(COLLECTIONS_FILE, 'utf-8');
        const oldCollections = JSON.parse(oldData);

        if (!oldCollections.items || !Array.isArray(oldCollections.items)) {
            console.error('❌ 错误：collections.json 格式不正确，缺少 items 数组');
            return;
        }

        console.log(`   找到 ${oldCollections.items.length} 个项目`);

        // 2. 备份原文件
        console.log('\n💾 备份原文件...');
        await fs.copyFile(COLLECTIONS_FILE, BACKUP_FILE);
        console.log(`   备份已保存到: ${BACKUP_FILE}`);

        // 3. 创建新的索引结构
        console.log('\n🏗️  创建新的索引结构...');
        const newCollections = {
            lastUpdated: oldCollections.lastUpdated,
            total: oldCollections.items.length,
            itemIds: oldCollections.items.map(item => item.id)
        };

        console.log(`   新索引包含 ${newCollections.itemIds.length} 个 ID`);

        // 4. 验证所有 items 文件存在
        console.log('\n✅ 验证数据完整性...');
        const missingFiles = [];
        let existingFiles = 0;

        for (const id of newCollections.itemIds) {
            const itemFile = path.join(ITEMS_DIR, `${id}.json`);
            try {
                await fs.access(itemFile);
                existingFiles++;
            } catch {
                missingFiles.push(id);
            }
        }

        console.log(`   ✓ 已存在的文件: ${existingFiles}/${newCollections.total}`);

        if (missingFiles.length > 0) {
            console.log(`   ⚠️  警告：发现 ${missingFiles.length} 个缺失的文件:`);
            missingFiles.slice(0, 5).forEach(id => console.log(`      - ${id}.json`));
            if (missingFiles.length > 5) {
                console.log(`      ... 还有 ${missingFiles.length - 5} 个文件`);
            }
        }

        // 5. 写入新的 collections.json
        console.log('\n💾 写入新的 collections.json...');
        await fs.writeFile(COLLECTIONS_FILE, JSON.stringify(newCollections, null, 2));
        console.log('   ✓ 新索引文件已保存');

        // 6. 显示文件大小对比
        console.log('\n📊 文件大小对比:');
        const oldSize = Buffer.byteLength(oldData, 'utf-8');
        const newData = await fs.readFile(COLLECTIONS_FILE, 'utf-8');
        const newSize = Buffer.byteLength(newData, 'utf-8');
        const reduction = ((1 - newSize / oldSize) * 100).toFixed(1);

        console.log(`   旧文件: ${(oldSize / 1024).toFixed(2)} KB`);
        console.log(`   新文件: ${(newSize / 1024).toFixed(2)} KB`);
        console.log(`   减少:   ${reduction}%`);

        // 7. 显示新文件预览
        console.log('\n📄 新文件预览:');
        const preview = {
            lastUpdated: newCollections.lastUpdated,
            total: newCollections.total,
            itemIds: [
                ...newCollections.itemIds.slice(0, 3),
                '...',
                `(共 ${newCollections.total} 个)`
            ]
        };
        console.log(JSON.stringify(preview, null, 2));

        console.log('\n✨ 迁移成功完成！\n');
        console.log('📝 后续步骤:');
        console.log('   1. 验证新的 collections.json 格式正确');
        console.log('   2. 测试管理端脚本 (add, update, delete, batch-update)');
        console.log('   3. 测试前端页面加载');
        console.log('   4. 如果一切正常，可以删除备份文件:\n');
        console.log(`      rm ${BACKUP_FILE}\n`);

    } catch (error) {
        console.error('\n❌ 迁移失败:', error.message);
        console.error('\n如果备份文件已创建，可以恢复:');
        console.error(`   cp ${BACKUP_FILE} ${COLLECTIONS_FILE}\n`);
        process.exit(1);
    }
}

migrate();
