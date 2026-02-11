import fs from 'fs/promises';
import path from 'path';
import inquirer from 'inquirer';
import { deleteImages } from './utils/image-handler.js';
import { readItem, deleteItem } from './utils/item-storage.js';

const DATA_DIR = 'docs/data';
const COLLECTIONS_FILE = path.join(DATA_DIR, 'collections.json');
const ITEMS_DIR = path.join(DATA_DIR, 'items');

async function main() {
    console.log('\n🗑️ 删除收藏\n');

    const itemIds = JSON.parse(await fs.readFile(COLLECTIONS_FILE, 'utf-8'));

    // 加载所有项目的基本信息用于选择
    console.log('📖 加载项目列表...');
    const itemChoices = [];
    for (const id of itemIds) {
        try {
            const itemData = await readItem(id, false);
            itemChoices.push({
                name: `${itemData.name} (${itemData.category})`,
                value: id
            });
        } catch (err) {
            console.error(`⚠️  无法读取 ${id}:`, err.message);
        }
    }

    const { itemId } = await inquirer.prompt([{
        type: 'list', name: 'itemId', message: '选择要删除的收藏:',
        choices: itemChoices,
        pageSize: 15
    }]);

    // 读取项目信息以显示确认消息
    const item = await readItem(itemId, false);
    const { confirm } = await inquirer.prompt([{
        type: 'confirm', name: 'confirm', message: `确定要删除 "${item.name}" 吗？此操作不可恢复！`, default: false
    }]);

    if (!confirm) { console.log('已取消'); return; }

    // 删除详情文件（双文件：轻量版 + 完整版）
    await deleteItem(itemId);

    // 删除图片
    await deleteImages(itemId);

    // 更新索引
    const updatedIds = itemIds.filter(id => id !== itemId);
    await fs.writeFile(COLLECTIONS_FILE, JSON.stringify(updatedIds, null, 2));

    console.log('\n✅ 删除成功！');
}

main().catch(console.error);