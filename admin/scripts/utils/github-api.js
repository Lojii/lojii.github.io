import { Octokit } from '@octokit/rest';
import * as cheerio from 'cheerio';
import fetch from 'node-fetch';

// 初始化 Octokit（可选使用 token 提高限额）
const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN // 设置环境变量 GITHUB_TOKEN
});

/**
 * 从 GitHub URL 解析 owner 和 repo
 */
export function parseGitHubUrl(url) {
    const match = url.match(/github\.com\/([^\/]+)\/([^\/\?#]+)/);
    if (!match) return null;
    return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
}

/**
 * 获取 GitHub 仓库信息
 */
export async function getRepoInfo(url) {
    const parsed = parseGitHubUrl(url);
    if (!parsed) throw new Error('无效的 GitHub URL');

    const { owner, repo } = parsed;

    try {
        const { data } = await octokit.repos.get({ owner, repo });

        return {
            id: `${owner}-${repo}`.toLowerCase(),
            name: data.name,
            nameEn: data.name,
            url: data.html_url,
            homepage: data.homepage || null,
            summary: data.description || '暂无描述',
            github: {
                stars: data.stargazers_count,
                forks: data.forks_count,
                language: data.language,
                license: data.license?.spdx_id || null,
                lastUpdate: data.updated_at.split('T')[0],
                topics: data.topics || [],
                createdAt: data.created_at.split('T')[0]
            }
        };
    } catch (error) {
        if (error.status === 404) throw new Error('仓库不存在');
        if (error.status === 403) throw new Error('API 限额已用完，请设置 GITHUB_TOKEN');
        throw error;
    }
}

/**
 * 批量获取仓库的 stars/forks 等信息（用于批量更新）
 */
export async function getRepoStats(url) {
    const parsed = parseGitHubUrl(url);
    if (!parsed) return null;

    try {
        const { data } = await octokit.repos.get({
            owner: parsed.owner,
            repo: parsed.repo
        });
        return {
            stars: data.stargazers_count,
            forks: data.forks_count,
            language: data.language,
            lastUpdate: data.updated_at.split('T')[0],
            license: data.license?.spdx_id || null
        };
    } catch {
        return null;
    }
}

/**
 * 抓取技术文章的基本信息
 */
export async function getArticleInfo(url) {
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Bot/1.0)' }
        });
        const html = await res.text();
        const $ = cheerio.load(html);

        // 尝试获取标题
        const title = $('meta[property="og:title"]').attr('content')
            || $('title').text()
            || '未知标题';

        // 尝试获取描述
        const description = $('meta[property="og:description"]').attr('content')
            || $('meta[name="description"]').attr('content')
            || '';

        // 尝试获取预览图
        const image = $('meta[property="og:image"]').attr('content') || null;

        return {
            id: generateId(title),
            type: 'article',
            name: title.trim(),
            url,
            summary: description.trim() || '暂无描述',
            thumbnail: image,
            images: image ? [image] : []
        };
    } catch (error) {
        return {
            id: generateId(url),
            type: 'article',
            name: '文章',
            url,
            summary: '暂无描述',
            images: []
        };
    }
}

/**
 * 生成简单的 ID
 */
function generateId(input) {
    return input
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 50) + '-' + Date.now().toString(36);
}

/**
 * 检查 API 限额
 */
export async function checkRateLimit() {
    try {
        const { data } = await octokit.rateLimit.get();
        return {
            remaining: data.rate.remaining,
            limit: data.rate.limit,
            reset: new Date(data.rate.reset * 1000).toLocaleString()
        };
    } catch {
        return { remaining: 0, limit: 60, reset: '未知' };
    }
}

/**
 * 获取 GitHub 仓库的 README 内容
 */
export async function getRepoReadme(url) {
    const parsed = parseGitHubUrl(url);
    if (!parsed) return null;

    try {
        const { data } = await octokit.repos.getReadme({
            owner: parsed.owner,
            repo: parsed.repo,
            mediaType: { format: 'html' }
        });
        // 处理相对路径的图片，转换为绝对路径
        let html = data;
        const baseUrl = `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/HEAD/`;
        html = html.replace(/src="(?!http)([^"]+)"/g, `src="${baseUrl}$1"`);
        html = html.replace(/href="(?!http|#)([^"]+)"/g, `href="https://github.com/${parsed.owner}/${parsed.repo}/blob/HEAD/$1"`);
        return html;
    } catch (error) {
        console.error('获取 README 失败:', error.message);
        return null;
    }
}

/**
 * 抓取文章内容
 */
export async function fetchArticleContent(url) {
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
            timeout: 30000
        });
        const html = await res.text();
        const $ = cheerio.load(html);

        // 移除不需要的元素
        $('script, style, nav, header, footer, aside, .ads, .comments, .sidebar').remove();

        // 尝试找到文章主体内容
        let content = '';
        const selectors = [
            'article', '.article', '.post-content', '.entry-content', '.content',
            '.markdown-body', '.post', 'main', '#content', '.main-content'
        ];

        for (const selector of selectors) {
            const el = $(selector);
            if (el.length && el.text().trim().length > 200) {
                content = el.html();
                break;
            }
        }

        // 如果没找到，取 body 内容
        if (!content) {
            content = $('body').html() || '';
        }

        // 清理和美化 HTML
        const $content = cheerio.load(content);

        // 转换相对路径为绝对路径
        const urlObj = new URL(url);
        const baseUrl = `${urlObj.protocol}//${urlObj.host}`;

        $content('img').each((_, el) => {
            const src = $content(el).attr('src');
            if (src && !src.startsWith('http') && !src.startsWith('data:')) {
                $content(el).attr('src', src.startsWith('/') ? baseUrl + src : baseUrl + '/' + src);
            }
        });

        $content('a').each((_, el) => {
            const href = $content(el).attr('href');
            if (href && !href.startsWith('http') && !href.startsWith('#') && !href.startsWith('mailto:')) {
                $content(el).attr('href', href.startsWith('/') ? baseUrl + href : baseUrl + '/' + href);
            }
            $content(el).attr('target', '_blank');
        });

        return $content.html();
    } catch (error) {
        console.error('抓取文章内容失败:', error.message);
        return null;
    }
}