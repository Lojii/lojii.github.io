import fs from 'fs/promises';
import path from 'path';
import { getRepoStats, checkRateLimit, parseGitHubUrl } from './utils/github-api.js';
import { readItem, saveItem } from './utils/item-storage.js';

const DATA_DIR = 'docs/data';
const COLLECTIONS_FILE = path.join(DATA_DIR, 'collections.json');
const ITEMS_DIR = path.join(DATA_DIR, 'items');

async function main() {
    console.log('\n🔄 批量更新 GitHub 仓库信息\n');

    // 检查 API 限额
    const rateLimit = await checkRateLimit();
    console.log(`📊 API 限额: ${rateLimit.remaining}/${rateLimit.limit} (重置时间: ${rateLimit.reset})`);

    if (rateLimit.remaining < 10) {
        console.log('⚠️ API 限额不足，建议设置 GITHUB_TOKEN 环境变量');
        console.log('   export GITHUB_TOKEN=your_token_here');
        return;
    }

    // 读取收藏列表
    const itemIds = JSON.parse(await fs.readFile(COLLECTIONS_FILE, 'utf-8'));

    // 从 itemIds 加载所有详情文件，筛选出 repo 类型
    const repos = [];
    for (const id of itemIds) {
        try {
            const item = await readItem(id, false);
            if (item.type === 'repo' && parseGitHubUrl(item.url)) {
                repos.push(item);
            }
        } catch (err) {
            console.error(`⚠️  无法读取 ${id}:`, err.message);
        }
    }

    console.log(`📦 共 ${repos.length} 个 GitHub 仓库需要更新\n`);

    let updated = 0, failed = 0;

    for (let i = 0; i < repos.length; i++) {
        const item = repos[i];
        process.stdout.write(`[${i + 1}/${repos.length}] ${item.name}... `);

        try {
            const stats = await getRepoStats(item.url);
            if (!stats) {
                console.log('❌ 跳过');
                failed++;
                continue;
            }

            // 更新详情数据（双文件：轻量版 + 完整版）
            try {
                const itemData = await readItem(item.id, true);
                itemData.github = { ...itemData.github, ...stats };
                itemData.updatedAt = new Date().toISOString();
                await saveItem(item.id, itemData);
            } catch (err) {
                console.log(`⚠️  更新详情文件失败: ${err.message}`);
            }

            console.log(`✅ ⭐${formatNum(stats.stars)} 🍴${formatNum(stats.forks)}`);
            updated++;

            // 避免触发 API 限制
            await delay(100);
        } catch (error) {
            console.log(`❌ ${error.message}`);
            failed++;
        }
    }

    console.log(`\n✅ 更新完成: 成功 ${updated}, 失败 ${failed}`);
}

function formatNum(n) {
    return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error);