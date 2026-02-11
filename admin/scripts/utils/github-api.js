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
 * 从 HTML 页面抓取 GitHub 仓库信息（降级方案）
 */
async function getRepoInfoFromHTML(owner, repo) {
    try {
        const url = `https://github.com/${owner}/${repo}`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
        });
        const html = await res.text();
        const $ = cheerio.load(html);

        // 提取仓库信息
        const name = repo;
        const description = $('meta[property="og:description"]').attr('content') ||
                          $('p.f4.my-3').first().text().trim() || '暂无描述';

        // 提取 stars 数量
        const starsText = $('#repo-stars-counter-star').attr('title')?.replace(/,/g, '') ||
                         $('#repo-stars-counter-star').text().trim().replace(/k/i, '000').replace(/\./g, '') || '0';
        const stars = parseInt(starsText) || 0;

        // 提取 forks 数量
        const forksText = $('#repo-network-counter').attr('title')?.replace(/,/g, '') ||
                         $('#repo-network-counter').text().trim().replace(/k/i, '000').replace(/\./g, '') || '0';
        const forks = parseInt(forksText) || 0;

        // 提取主要语言
        const language = $('[itemprop="programmingLanguage"]').first().text().trim() || null;

        // 提取 license
        const license = $('a[href*="/blob/"][href*="LICENSE"]').first().text().trim() || null;

        // 提取 topics
        const topics = [];
        $('a.topic-tag').each((_, el) => {
            topics.push($(el).text().trim());
        });

        // 提取最后更新时间
        const lastUpdateEl = $('relative-time').first();
        const lastUpdate = lastUpdateEl.attr('datetime')?.split('T')[0] || new Date().toISOString().split('T')[0];

        // 提取 homepage（如果有）
        const homepage = $('a[data-analytics-event*="homepage"]').attr('href') || null;

        console.log(`✓ 通过 HTML 抓取获取了 ${owner}/${repo} 的信息`);

        return {
            id: `${owner}-${repo}`.toLowerCase(),
            name: name,
            nameEn: name,
            url: `https://github.com/${owner}/${repo}`,
            homepage: homepage,
            summary: description,
            github: {
                stars: stars,
                forks: forks,
                language: language,
                license: license,
                lastUpdate: lastUpdate,
                topics: topics,
                createdAt: lastUpdate // HTML 页面较难获取创建时间，使用最后更新时间
            }
        };
    } catch (error) {
        console.error('HTML 抓取失败:', error.message);
        throw new Error('无法获取仓库信息（API 和 HTML 抓取均失败）');
    }
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
        if (error.status === 403) {
            console.warn('⚠ API 限额已用完，切换到 HTML 抓取模式...');
            return await getRepoInfoFromHTML(owner, repo);
        }
        throw error;
    }
}

/**
 * 从 HTML 页面抓取仓库统计信息（降级方案）
 */
async function getRepoStatsFromHTML(owner, repo) {
    try {
        const url = `https://github.com/${owner}/${repo}`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
        });
        const html = await res.text();
        const $ = cheerio.load(html);

        // 提取 stars 数量
        const starsText = $('#repo-stars-counter-star').attr('title')?.replace(/,/g, '') ||
                         $('#repo-stars-counter-star').text().trim().replace(/k/i, '000').replace(/\./g, '') || '0';
        const stars = parseInt(starsText) || 0;

        // 提取 forks 数量
        const forksText = $('#repo-network-counter').attr('title')?.replace(/,/g, '') ||
                         $('#repo-network-counter').text().trim().replace(/k/i, '000').replace(/\./g, '') || '0';
        const forks = parseInt(forksText) || 0;

        // 提取主要语言
        const language = $('[itemprop="programmingLanguage"]').first().text().trim() || null;

        // 提取 license
        const license = $('a[href*="/blob/"][href*="LICENSE"]').first().text().trim() || null;

        // 提取最后更新时间
        const lastUpdateEl = $('relative-time').first();
        const lastUpdate = lastUpdateEl.attr('datetime')?.split('T')[0] || new Date().toISOString().split('T')[0];

        return {
            stars: stars,
            forks: forks,
            language: language,
            lastUpdate: lastUpdate,
            license: license
        };
    } catch (error) {
        console.error(`HTML 抓取统计信息失败 (${owner}/${repo}):`, error.message);
        return null;
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
    } catch (error) {
        if (error.status === 403) {
            console.warn(`⚠ API 限额已用完，切换到 HTML 抓取模式 (${parsed.owner}/${parsed.repo})...`);
            return await getRepoStatsFromHTML(parsed.owner, parsed.repo);
        }
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
 * 从 HTML 页面抓取 README 内容（降级方案）
 */
async function getRepoReadmeFromHTML(owner, repo) {
    try {
        const url = `https://github.com/${owner}/${repo}`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
        });
        const html = await res.text();
        const $ = cheerio.load(html);

        // GitHub 的 README 通常在 article 标签内，且包含 markdown-body 类
        let readmeHtml = $('article.markdown-body').html() ||
                        $('.markdown-body').first().html() ||
                        $('[data-target="readme-toc.content"]').html();

        if (!readmeHtml) {
            console.warn(`未找到 README 内容: ${owner}/${repo}`);
            return null;
        }

        // 处理相对路径的图片和链接，转换为绝对路径
        const $readme = cheerio.load(readmeHtml);
        const baseUrl = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/`;

        $readme('img').each((_, el) => {
            const src = $readme(el).attr('src');
            if (src && !src.startsWith('http') && !src.startsWith('data:')) {
                $readme(el).attr('src', baseUrl + src.replace(/^\.?\//, ''));
            }
        });

        $readme('a').each((_, el) => {
            const href = $readme(el).attr('href');
            if (href && !href.startsWith('http') && !href.startsWith('#') && !href.startsWith('mailto:')) {
                $readme(el).attr('href', `https://github.com/${owner}/${repo}/blob/HEAD/${href.replace(/^\.?\//, '')}`);
            }
        });

        console.log(`✓ 通过 HTML 抓取获取了 ${owner}/${repo} 的 README`);
        return $readme.html();
    } catch (error) {
        console.error(`HTML 抓取 README 失败 (${owner}/${repo}):`, error.message);
        return null;
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
        if (error.status === 403) {
            console.warn(`⚠ API 限额已用完，切换到 HTML 抓取模式 (${parsed.owner}/${parsed.repo})...`);
            return await getRepoReadmeFromHTML(parsed.owner, parsed.repo);
        }
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