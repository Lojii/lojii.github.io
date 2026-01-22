import express from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getRepoInfo, getArticleInfo, parseGitHubUrl, getRepoStats, getRepoReadme, fetchArticleContent } from './scripts/utils/github-api.js';
import { processImages, deleteImages, generateItemId } from './scripts/utils/image-handler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const upload = multer({ dest: 'temp/' });

const DATA_DIR = 'docs/data';
const COLLECTIONS_FILE = path.join(DATA_DIR, 'collections.json');
const ITEMS_DIR = path.join(DATA_DIR, 'items');
const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json');

app.use(express.json());
app.use(express.static(path.join(__dirname)));
app.use('/docs', express.static('docs'));
// 关键：让 /assets 路径直接映射到 docs/assets，解决图片 404 问题
app.use('/assets', express.static('docs/assets'));

// 更新 categories.json 中的 tags
async function updateCategoryTags(tags) {
    if (!tags || !tags.length) return;

    try {
        let categories;
        try {
            categories = JSON.parse(await fs.readFile(CATEGORIES_FILE, 'utf-8'));
        } catch {
            categories = { categories: [], tags: [] };
        }

        if (!categories.tags) categories.tags = [];

        // 找出新的 tags
        const existingTagIds = new Set(categories.tags.map(t => t.id));
        const newTags = tags.filter(t => !existingTagIds.has(t));

        if (newTags.length > 0) {
            // 添加新 tags（tag 是独立的，不关联 category）
            newTags.forEach(tagId => {
                categories.tags.push({
                    id: tagId,
                    name: tagId
                });
            });

            // 保存更新
            await fs.writeFile(CATEGORIES_FILE, JSON.stringify(categories, null, 2));
            console.log(`已添加新标签: ${newTags.join(', ')}`);
        }
    } catch (e) {
        console.error('更新 tags 失败:', e.message);
    }
}

// 获取所有收藏
app.get('/api/collections', async (req, res) => {
    try {
        const data = await fs.readFile(COLLECTIONS_FILE, 'utf-8');
        res.json(JSON.parse(data));
    } catch { res.json({ items: [], total: 0 }); }
});

// 获取分类
app.get('/api/categories', async (req, res) => {
    try {
        const data = await fs.readFile(CATEGORIES_FILE, 'utf-8');
        res.json(JSON.parse(data));
    } catch { res.json({ categories: [], tags: [] }); }
});

// 获取单个收藏详情
app.get('/api/items/:id', async (req, res) => {
    try {
        const data = await fs.readFile(path.join(ITEMS_DIR, `${req.params.id}.json`), 'utf-8');
        res.json(JSON.parse(data));
    } catch { res.status(404).json({ error: '未找到' }); }
});

// 解析URL获取信息
app.post('/api/parse-url', async (req, res) => {
    try {
        const { url } = req.body;
        const isGitHub = parseGitHubUrl(url);
        const info = isGitHub ? await getRepoInfo(url) : await getArticleInfo(url);
        info.type = isGitHub ? 'repo' : 'article';
        res.json(info);
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// 抓取原文内容
app.post('/api/fetch-content', async (req, res) => {
    try {
        const { url, type } = req.body;
        let content = null;
        if (type === 'repo' || parseGitHubUrl(url)) {
            content = await getRepoReadme(url);
        } else {
            content = await fetchArticleContent(url);
        }
        res.json({ content });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// 添加收藏
app.post('/api/items', upload.array('files'), async (req, res) => {
    try {
        const data = JSON.parse(req.body.data);
        const itemId = data.id || generateItemId(data.name);

        // 处理图片
        let imageUrls = data.imageUrls || [];
        const uploadedFiles = (req.files || []).map(f => f.path);
        const allImages = [...imageUrls, ...uploadedFiles];

        const { images, thumbnail } = await processImages(allImages, itemId);

        // 清理临时文件
        for (const f of uploadedFiles) { try { await fs.unlink(f); } catch { } }

        // 抓取原文内容
        let originalContent = null;
        if (data.url) {
            console.log('正在抓取原文内容...');
            if (data.type === 'repo' || parseGitHubUrl(data.url)) {
                originalContent = await getRepoReadme(data.url);
            } else {
                originalContent = await fetchArticleContent(data.url);
            }
        }

        const now = new Date().toISOString().split('T')[0];
        const tags = (data.tags || []).map(t => t.toLowerCase().trim()).filter(Boolean);

        const itemData = {
            id: itemId, type: data.type || 'repo', name: data.name, nameEn: data.nameEn || data.name,
            url: data.url, homepage: data.homepage, summary: data.summary, description: data.description,
            notes: data.notes, images, thumbnail, category: data.category, tags,
            github: data.github, archived: false, createdAt: now, updatedAt: now,
            originalContent // 存储抓取的原文内容
        };

        await fs.mkdir(ITEMS_DIR, { recursive: true });
        await fs.writeFile(path.join(ITEMS_DIR, `${itemId}.json`), JSON.stringify(itemData, null, 2));

        // 更新索引
        let collections;
        try { collections = JSON.parse(await fs.readFile(COLLECTIONS_FILE, 'utf-8')); }
        catch { collections = { items: [], total: 0 }; }

        collections.items.unshift({
            id: itemId, type: itemData.type, name: itemData.name, nameEn: itemData.nameEn,
            summary: itemData.summary, url: itemData.url, thumbnail, category: itemData.category,
            tags, stars: data.github?.stars || 0, forks: data.github?.forks || 0,
            language: data.github?.language, lastUpdate: data.github?.lastUpdate || now,
            archived: false, createdAt: now
        });
        collections.total = collections.items.length;
        collections.lastUpdated = new Date().toISOString();
        await fs.writeFile(COLLECTIONS_FILE, JSON.stringify(collections, null, 2));

        // 更新 categories.json 的 tags
        await updateCategoryTags(tags);

        res.json({ success: true, id: itemId });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// await fs.mkdir(ITEMS_DIR, { recursive: true });
// await fs.writeFile(path.join(ITEMS_DIR, `${itemId}.json`), JSON.stringify(itemData, null, 2));

// // 更新索引
// let collections;
// try { collections = JSON.parse(await fs.readFile(COLLECTIONS_FILE, 'utf-8')); }
// catch { collections = { items: [], total: 0 }; }

// collections.items.unshift({
//     id: itemId, type: itemData.type, name: itemData.name, nameEn: itemData.nameEn,
//     summary: itemData.summary, url: itemData.url, thumbnail, category: itemData.category,
//     tags: itemData.tags, stars: data.github?.stars || 0, forks: data.github?.forks || 0,
//     language: data.github?.language, lastUpdate: data.github?.lastUpdate || now,
//     archived: false, createdAt: now
// });
// collections.total = collections.items.length;
// collections.lastUpdated = new Date().toISOString();
// await fs.writeFile(COLLECTIONS_FILE, JSON.stringify(collections, null, 2));

// res.json({ success: true, id: itemId });
//   } catch (e) { res.status(500).json({ error: e.message }); }
// });

// 更新收藏
app.put('/api/items/:id', upload.array('files'), async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body.data ? JSON.parse(req.body.data) : req.body;
        const itemFile = path.join(ITEMS_DIR, `${id}.json`);
        const item = JSON.parse(await fs.readFile(itemFile, 'utf-8'));

        // 处理新上传的图片
        if (req.files?.length || updates.imageUrls?.length) {
            const newImageUrls = updates.imageUrls || [];
            const uploadedFiles = (req.files || []).map(f => f.path);
            const allNewImages = [...newImageUrls, ...uploadedFiles];

            if (allNewImages.length) {
                const { images: newImages } = await processImages(allNewImages, id);
                updates.images = [...(item.images || []), ...newImages];
                if (!item.thumbnail && newImages.length) {
                    updates.thumbnail = newImages[0];
                }
            }

            // 清理临时文件
            for (const f of uploadedFiles) { try { await fs.unlink(f); } catch { } }
        }

        // 如果请求重新抓取内容
        if (updates.refetchContent && item.url) {
            console.log('重新抓取原文内容...');
            if (item.type === 'repo' || parseGitHubUrl(item.url)) {
                updates.originalContent = await getRepoReadme(item.url);
            } else {
                updates.originalContent = await fetchArticleContent(item.url);
            }
        }

        delete updates.imageUrls;
        delete updates.refetchContent;

        const updated = { ...item, ...updates, updatedAt: new Date().toISOString().split('T')[0] };
        await fs.writeFile(itemFile, JSON.stringify(updated, null, 2));

        // 同步索引
        const collections = JSON.parse(await fs.readFile(COLLECTIONS_FILE, 'utf-8'));
        const idx = collections.items.findIndex(i => i.id === id);
        if (idx !== -1) {
            ['name', 'nameEn', 'summary', 'category', 'tags', 'archived', 'thumbnail'].forEach(f => {
                if (f in updates) collections.items[idx][f] = updates[f];
            });
            collections.lastUpdated = new Date().toISOString();
            await fs.writeFile(COLLECTIONS_FILE, JSON.stringify(collections, null, 2));
        }

        // 更新 categories.json 的 tags
        if (updates.tags && updates.tags.length) {
            await updateCategoryTags(updates.tags);
        }

        res.json({ success: true, item: updated });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 删除收藏
app.delete('/api/items/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await fs.rm(path.join(ITEMS_DIR, `${id}.json`), { force: true });
        await deleteImages(id);

        const collections = JSON.parse(await fs.readFile(COLLECTIONS_FILE, 'utf-8'));
        collections.items = collections.items.filter(i => i.id !== id);
        collections.total = collections.items.length;
        await fs.writeFile(COLLECTIONS_FILE, JSON.stringify(collections, null, 2));

        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 批量更新
app.post('/api/batch-update', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');

    try {
        const collections = JSON.parse(await fs.readFile(COLLECTIONS_FILE, 'utf-8'));
        const repos = collections.items.filter(i => i.type === 'repo' && parseGitHubUrl(i.url));

        res.write(`data: ${JSON.stringify({ type: 'start', total: repos.length })}\n\n`);

        for (let i = 0; i < repos.length; i++) {
            const item = repos[i];
            try {
                const stats = await getRepoStats(item.url);
                if (stats) {
                    const idx = collections.items.findIndex(it => it.id === item.id);
                    if (idx !== -1) Object.assign(collections.items[idx], stats);
                }
                res.write(`data: ${JSON.stringify({ type: 'progress', current: i + 1, name: item.name, success: !!stats })}\n\n`);
            } catch { res.write(`data: ${JSON.stringify({ type: 'progress', current: i + 1, name: item.name, success: false })}\n\n`); }
            await new Promise(r => setTimeout(r, 100));
        }

        collections.lastUpdated = new Date().toISOString();
        await fs.writeFile(COLLECTIONS_FILE, JSON.stringify(collections, null, 2));
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    } catch (e) { res.write(`data: ${JSON.stringify({ type: 'error', message: e.message })}\n\n`); }
    res.end();
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`\n🚀 管理后台已启动: http://localhost:${PORT}`);
    console.log(`📄 预览博客: http://localhost:${PORT}/docs/`);
});