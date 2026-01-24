// ============= update.js =============
import fs from 'fs/promises';
import path from 'path';
import inquirer from 'inquirer';
import { processImages } from './utils/image-handler.js';

const DATA_DIR = 'docs/data';
const COLLECTIONS_FILE = path.join(DATA_DIR, 'collections.json');
const ITEMS_DIR = path.join(DATA_DIR, 'items');

async function main() {
    console.log('\n✏️ 更新收藏\n');

    const collections = JSON.parse(await fs.readFile(COLLECTIONS_FILE, 'utf-8'));
    const categories = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'categories.json'), 'utf-8'));

    // 选择要更新的项目
    const { itemId } = await inquirer.prompt([{
        type: 'list',
        name: 'itemId',
        message: '选择要更新的收藏:',
        choices: collections.items.map(i => ({
            name: `${i.archived ? '📦' : '✨'} ${i.name} (${i.category})`,
            value: i.id
        })),
        pageSize: 15
    }]);

    // 读取详情
    const itemFile = path.join(ITEMS_DIR, `${itemId}.json`);
    const item = JSON.parse(await fs.readFile(itemFile, 'utf-8'));

    // 选择更新内容
    const { fields } = await inquirer.prompt([{
        type: 'checkbox',
        name: 'fields',
        message: '选择要更新的字段:',
        choices: [
            { name: '中文名称', value: 'name' },
            { name: '英文名称', value: 'nameEn' },
            { name: '简介', value: 'summary' },
            { name: '详细描述', value: 'description' },
            { name: '分类', value: 'category' },
            { name: '标签', value: 'tags' },
            { name: '添加图片', value: 'images' },
            { name: '备注', value: 'notes' },
            { name: '归档状态', value: 'archived' }
        ]
    }]);

    if (fields.length === 0) {
        console.log('未选择任何字段，退出。');
        return;
    }

    const updates = {};

    for (const field of fields) {
        if (field === 'name') {
            const { value } = await inquirer.prompt([{ type: 'input', name: 'value', message: '新的中文名称:', default: item.name }]);
            updates.name = value;
        } else if (field === 'nameEn') {
            const { value } = await inquirer.prompt([{ type: 'input', name: 'value', message: '新的英文名称:', default: item.nameEn }]);
            updates.nameEn = value;
        } else if (field === 'summary') {
            const { value } = await inquirer.prompt([{ type: 'input', name: 'value', message: '新的简介:', default: item.summary }]);
            updates.summary = value;
        } else if (field === 'description') {
            const { value } = await inquirer.prompt([{ type: 'editor', name: 'value', message: '新的详细描述:', default: item.description }]);
            updates.description = value;
        } else if (field === 'category') {
            const { value } = await inquirer.prompt([{
                type: 'list', name: 'value', message: '新的分类:',
                choices: categories.categories.map(c => ({ name: `${c.icon} ${c.name}`, value: c.id })),
                default: item.category
            }]);
            updates.category = value;
        } else if (field === 'tags') {
            const { value } = await inquirer.prompt([{ type: 'input', name: 'value', message: '新的标签 (逗号分隔):', default: item.tags.join(', ') }]);
            updates.tags = value.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
        } else if (field === 'images') {
            const { value } = await inquirer.prompt([{ type: 'input', name: 'value', message: '添加图片 (URL或路径，逗号分隔):' }]);
            if (value) {
                const newImages = value.split(',').map(s => s.trim()).filter(Boolean);
                console.log('🖼️ 处理新图片...');
                const { images } = await processImages(newImages, itemId);
                updates.images = [...(item.images || []), ...images];
            }
        } else if (field === 'notes') {
            const { value } = await inquirer.prompt([{ type: 'input', name: 'value', message: '新的备注:', default: item.notes }]);
            updates.notes = value;
        } else if (field === 'archived') {
            const { value } = await inquirer.prompt([{
                type: 'confirm', name: 'value', message: '是否归档?', default: item.archived
            }]);
            updates.archived = value;
        }
    }

    // 更新详情文件
    const updatedItem = { ...item, ...updates, updatedAt: new Date().toISOString() };
    await fs.writeFile(itemFile, JSON.stringify(updatedItem, null, 2));

    // 更新索引
    const idx = collections.items.findIndex(i => i.id === itemId);
    if (idx !== -1) {
        const syncFields = ['name', 'nameEn', 'summary', 'category', 'tags', 'archived'];
        syncFields.forEach(f => { if (f in updates) collections.items[idx][f] = updates[f]; });
        if (updates.images) collections.items[idx].thumbnail = updates.images[0];
        collections.lastUpdated = new Date().toISOString();
        await fs.writeFile(COLLECTIONS_FILE, JSON.stringify(collections, null, 2));
    }

    console.log('\n✅ 更新成功！');
}

main().catch(console.error);