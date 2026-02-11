import fs from 'fs/promises';
import path from 'path';

const ITEMS_DIR = 'docs/data/items';

/**
 * 保存 item 的双文件版本
 * - {id}.json: 轻量版（无 originalContent）- 用于首页列表加载
 * - {id}.full.json: 完整版（含 originalContent）- 用于详情页
 */
export async function saveItem(itemId, itemData) {
    await fs.mkdir(ITEMS_DIR, { recursive: true });

    // 1. 保存完整版（含 originalContent）
    const fullFile = path.join(ITEMS_DIR, `${itemId}.full.json`);
    await fs.writeFile(fullFile, JSON.stringify(itemData, null, 2));

    // 2. 保存轻量版（移除 originalContent）
    const { originalContent, ...lightData } = itemData;
    const lightFile = path.join(ITEMS_DIR, `${itemId}.json`);
    await fs.writeFile(lightFile, JSON.stringify(lightData, null, 2));

    return { lightFile, fullFile };
}

/**
 * 读取 item 数据
 * @param {string} itemId - 项目 ID
 * @param {boolean} full - 是否读取完整版（含 originalContent）
 */
export async function readItem(itemId, full = false) {
    const fileName = full ? `${itemId}.full.json` : `${itemId}.json`;
    const filePath = path.join(ITEMS_DIR, fileName);
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
}

/**
 * 删除 item 的所有文件（双文件版本）
 */
export async function deleteItem(itemId) {
    const lightFile = path.join(ITEMS_DIR, `${itemId}.json`);
    const fullFile = path.join(ITEMS_DIR, `${itemId}.full.json`);

    await Promise.all([
        fs.rm(lightFile, { force: true }),
        fs.rm(fullFile, { force: true })
    ]);
}

/**
 * 更新 item 数据（同时更新双文件）
 */
export async function updateItem(itemId, updates) {
    // 读取完整版数据
    const item = await readItem(itemId, true);

    // 合并更新
    const updatedItem = { ...item, ...updates, updatedAt: new Date().toISOString() };

    // 保存双文件
    await saveItem(itemId, updatedItem);

    return updatedItem;
}
