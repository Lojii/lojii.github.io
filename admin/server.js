import express from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getRepoInfo, getArticleInfo, parseGitHubUrl, getRepoStats, getRepoReadme, fetchArticleContent, fetchPageImages } from './scripts/utils/github-api.js';
import { processImages, deleteImages, generateItemId } from './scripts/utils/image-handler.js';
import { readItem, saveItem, deleteItem } from './scripts/utils/item-storage.js';

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

        // 找出新的 tags（直接使用字符串数组）
        const newTags = tags.filter(t => !categories.tags.includes(t));

        if (newTags.length > 0) {
            // 添加新 tags
            categories.tags.push(...newTags);

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
    } catch {
        res.json([]);
    }
});

// 获取分类
app.get('/api/categories', async (req, res) => {
    try {
        const data = await fs.readFile(CATEGORIES_FILE, 'utf-8');
        res.json(JSON.parse(data));
    } catch { res.json({ categories: [], tags: [] }); }
});

// 获取单个收藏详情
// 支持查询参数 ?full=true 获取完整版（含 originalContent）
app.get('/api/items/:id', async (req, res) => {
    try {
        const full = req.query.full === 'true';
        const item = await readItem(req.params.id, full);
        res.json(item);
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

// 提取网页图片
app.post('/api/fetch-page-images', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: '请提供 URL' });
        const images = await fetchPageImages(url);
        res.json({ images });
    } catch (e) { res.status(500).json({ error: e.message }); }
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

        // 时间戳精确到秒（完整 ISO 格式）
        const now = new Date().toISOString();
        const tags = (data.tags || []).map(t => t.toLowerCase().trim()).filter(Boolean);

        const itemData = {
            id: itemId,
            type: data.type || 'repo',
            name: data.name,
            nameEn: data.nameEn || data.name,
            url: data.url,
            homepage: data.homepage,
            summary: data.summary,
            description: data.description,
            notes: data.notes,
            images,
            thumbnail,
            category: data.category,
            tags,
            github: data.github,
            archived: false,
            createdAt: now,
            updatedAt: now,
            originalContent
        };

        // 保存双文件：轻量版 + 完整版
        await saveItem(itemId, itemData);

        // 更新索引
        let itemIds;
        try { itemIds = JSON.parse(await fs.readFile(COLLECTIONS_FILE, 'utf-8')); }
        catch { itemIds = []; }

        itemIds.unshift(itemId);
        await fs.writeFile(COLLECTIONS_FILE, JSON.stringify(itemIds, null, 2));

        // 更新 categories.json 的 tags
        await updateCategoryTags(tags);

        res.json({ success: true, id: itemId });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 更新收藏
app.put('/api/items/:id', upload.array('files'), async (req, res) => {
    try {
        const { id } = req.params;
        let updates;

        // 处理两种请求格式：FormData 和 JSON
        if (req.body.data) {
            updates = JSON.parse(req.body.data);
        } else {
            updates = req.body;
        }

        console.log(`更新收藏: ${id}`, updates);

        // 读取完整版数据
        const item = await readItem(id, true);

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

        const now = new Date().toISOString();
        const updated = { ...item, ...updates, updatedAt: now };
        await saveItem(id, updated);
        console.log(`  详情文件已更新（双文件）`);

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
        console.log(`删除收藏: ${id}`);

        // 删除详情文件（双文件：轻量版 + 完整版）
        await deleteItem(id);
        console.log(`  已删除文件（双文件）`);

        // 删除图片
        await deleteImages(id);
        console.log(`  已删除图片`);

        // 从索引中移除
        const itemIds = JSON.parse(await fs.readFile(COLLECTIONS_FILE, 'utf-8'));
        const beforeCount = itemIds.length;
        const updatedIds = itemIds.filter(itemId => itemId !== id);
        await fs.writeFile(COLLECTIONS_FILE, JSON.stringify(updatedIds, null, 2));
        console.log(`  已从索引移除: ${beforeCount} -> ${updatedIds.length}`);

        res.json({ success: true });
    } catch (e) {
        console.error('删除失败:', e);
        res.status(500).json({ error: e.message });
    }
});

// 批量更新（使用 GET，因为前端用 EventSource）
app.get('/api/batch-update', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');

    try {
        const itemIds = JSON.parse(await fs.readFile(COLLECTIONS_FILE, 'utf-8'));

        // 加载所有项目详情，筛选出 repo 类型
        const repos = [];
        for (const id of itemIds) {
            try {
                const item = await readItem(id, false);
                if (item.type === 'repo' && parseGitHubUrl(item.url)) {
                    repos.push(item);
                }
            } catch (err) {
                console.error(`无法读取 ${id}:`, err.message);
            }
        }

        res.write(`data: ${JSON.stringify({ type: 'start', total: repos.length })}\n\n`);

        for (let i = 0; i < repos.length; i++) {
            const item = repos[i];
            try {
                const stats = await getRepoStats(item.url);
                if (stats) {
                    // 更新详情文件（双文件：轻量版 + 完整版）
                    const itemData = await readItem(item.id, true);
                    itemData.github = { ...itemData.github, ...stats };
                    itemData.updatedAt = new Date().toISOString();
                    await saveItem(item.id, itemData);
                }
                res.write(`data: ${JSON.stringify({ type: 'progress', current: i + 1, name: item.name, success: !!stats })}\n\n`);
            } catch { res.write(`data: ${JSON.stringify({ type: 'progress', current: i + 1, name: item.name, success: false })}\n\n`); }
            await new Promise(r => setTimeout(r, 100));
        }

        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    } catch (e) { res.write(`data: ${JSON.stringify({ type: 'error', message: e.message })}\n\n`); }
    res.end();
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`\n🚀 管理后台已启动: http://localhost:${PORT}`);
    console.log(`📄 预览博客: http://localhost:${PORT}/docs/`);
});