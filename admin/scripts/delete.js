import fs from 'fs/promises';
import path from 'path';
import inquirer from 'inquirer';
import { deleteImages } from './utils/image-handler.js';

const DATA_DIR = 'docs/data';
const COLLECTIONS_FILE = path.join(DATA_DIR, 'collections.json');
const ITEMS_DIR = path.join(DATA_DIR, 'items');

async function main() {
    console.log('\n🗑️ 删除收藏\n');

    const collections = JSON.parse(await fs.readFile(COLLECTIONS_FILE, 'utf-8'));

    const { itemId } = await inquirer.prompt([{
        type: 'list', name: 'itemId', message: '选择要删除的收藏:',
        choices: collections.items.map(i => ({ name: `${i.name} (${i.category})`, value: i.id })),
        pageSize: 15
    }]);

    const item = collections.items.find(i => i.id === itemId);
    const { confirm } = await inquirer.prompt([{
        type: 'confirm', name: 'confirm', message: `确定要删除 "${item.name}" 吗？此操作不可恢复！`, default: false
    }]);

    if (!confirm) { console.log('已取消'); return; }

    // 删除详情文件
    await fs.rm(path.join(ITEMS_DIR, `${itemId}.json`), { force: true });

    // 删除图片
    await deleteImages(itemId);

    // 更新索引
    collections.items = collections.items.filter(i => i.id !== itemId);
    collections.total = collections.items.length;
    collections.lastUpdated = new Date().toISOString();
    await fs.writeFile(COLLECTIONS_FILE, JSON.stringify(collections, null, 2));

    console.log('\n✅ 删除成功！');
}

main().catch(console.error);