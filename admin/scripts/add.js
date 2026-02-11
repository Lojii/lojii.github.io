import fs from 'fs/promises';
import path from 'path';
import inquirer from 'inquirer';
import { getRepoInfo, getArticleInfo, parseGitHubUrl } from './utils/github-api.js';
import { processImages, generateItemId } from './utils/image-handler.js';
import { saveItem } from './utils/item-storage.js';

const DATA_DIR = 'docs/data';
const COLLECTIONS_FILE = path.join(DATA_DIR, 'collections.json');
const ITEMS_DIR = path.join(DATA_DIR, 'items');

async function ensureDataDir() {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.mkdir(ITEMS_DIR, { recursive: true });
    try {
        await fs.access(COLLECTIONS_FILE);
    } catch {
        await fs.writeFile(COLLECTIONS_FILE, JSON.stringify([], null, 2));
    }
}

async function loadCategories() {
    try {
        const data = await fs.readFile(path.join(DATA_DIR, 'categories.json'), 'utf-8');
        return JSON.parse(data);
    } catch {
        const defaultCats = {
            categories: [
                { "id": "flutter", "name": "Flutter", "icon": "🇫🇮" },
                { "id": "iOS", "name": "iOS", "icon": "🍎" },
                { "id": "unity", "name": "Unity", "icon": "🎮" },
                { "id": "vue", "name": "Vue", "icon": "🖼️" },
                { "id": "mini", "name": "小程序", "icon": "📱" },
                { "id": "tools", "name": "工具", "icon": "🔧" },
                { "id": "ai", "name": "AI/ML", "icon": "🤖" },
                { "id": "article", "name": "技术文章", "icon": "📝" }
            ],
            tags: []
        };
        await fs.writeFile(path.join(DATA_DIR, 'categories.json'), JSON.stringify(defaultCats, null, 2));
        return defaultCats;
    }
}

async function main() {
    console.log('\n📦 添加新收藏\n');
    await ensureDataDir();
    const categories = await loadCategories();

    // 1. 输入URL
    const { url } = await inquirer.prompt([{
        type: 'input', name: 'url', message: '请输入 GitHub 仓库或文章 URL:',
        validate: v => v.startsWith('http') || '请输入有效的 URL'
    }]);

    // 2. 自动获取信息
    console.log('\n🔍 正在获取信息...');
    const isGitHub = parseGitHubUrl(url);
    let info;
    try {
        info = isGitHub ? await getRepoInfo(url) : await getArticleInfo(url);
        info.type = isGitHub ? 'repo' : 'article';
        console.log(`✅ 获取成功: ${info.name}`);
    } catch (e) {
        console.error('❌ 获取失败:', e.message);
        info = { id: generateItemId('item'), name: '', url, type: isGitHub ? 'repo' : 'article', summary: '', github: {} };
    }

    // 3. 补充/修改信息
    const answers = await inquirer.prompt([
        { type: 'input', name: 'name', message: '中文名称:', default: info.name },
        { type: 'input', name: 'nameEn', message: '英文名称:', default: info.nameEn || info.name },
        { type: 'input', name: 'summary', message: '简介:', default: info.summary },
        { type: 'editor', name: 'description', message: '详细描述 (可选，按回车打开编辑器):' },
        { type: 'list', name: 'category', message: '选择分类:', choices: categories.categories.map(c => ({ name: `${c.icon} ${c.name}`, value: c.id })) },
        { type: 'input', name: 'tags', message: '标签 (中英文逗号分隔):', default: (info.github?.topics || []).join(', ') },
        { type: 'input', name: 'images', message: '预览图片 (URL或本地路径，中英文逗号分隔):' },
        { type: 'input', name: 'notes', message: '个人备注 (可选):' }
    ]);

    // 4. 生成ID
    const itemId = info.id || generateItemId(answers.name);
    console.log(`\n📝 ID: ${itemId}`);

    // 5. 处理图片
    const imageList = answers.images ? answers.images.split(/[,，]/).map(s => s.trim()).filter(Boolean) : [];
    console.log('\n🖼️ 处理图片...');
    const { images, thumbnail } = await processImages(imageList, itemId);
    console.log(`✅ 已处理 ${images.length} 张图片`);

    // 6. 构建数据
    const now = new Date().toISOString();
    const tags = answers.tags.split(/[,，]/).map(t => t.trim().toLowerCase()).filter(Boolean);

    const itemData = {
        id: itemId,
        type: info.type,
        name: answers.name,
        nameEn: answers.nameEn,
        url: info.url || url,
        homepage: info.homepage || null,
        summary: answers.summary,
        description: answers.description || null,
        notes: answers.notes || null,
        images,
        thumbnail,
        category: answers.category,
        tags,
        github: info.github || null,
        archived: false,
        createdAt: now,
        updatedAt: now,
        originalContent: null  // 初始为 null，后续可通过 update 添加
    };

    // 7. 保存数据（双文件：轻量版 + 完整版）
    await saveItem(itemId, itemData);

    const collections = JSON.parse(await fs.readFile(COLLECTIONS_FILE, 'utf-8'));
    const itemIds = Array.isArray(collections) ? collections : [];
    itemIds.unshift(itemId);
    await fs.writeFile(COLLECTIONS_FILE, JSON.stringify(itemIds, null, 2));

    // 8. 更新标签（tag 是独立的，不关联 category）
    const newTags = tags.filter(t => !categories.tags.includes(t));
    if (newTags.length) {
        categories.tags.push(...newTags);
        await fs.writeFile(path.join(DATA_DIR, 'categories.json'), JSON.stringify(categories, null, 2));
    }

    console.log('\n✅ 添加成功！');
    console.log(`   轻量版: docs/data/items/${itemId}.json`);
    console.log(`   完整版: docs/data/items/${itemId}.full.json`);
    console.log(`   图片: docs/assets/images/${itemId}/`);
}

main().catch(console.error);