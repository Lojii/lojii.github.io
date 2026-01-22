import fs from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch';
import sharp from 'sharp';
import { nanoid } from 'nanoid';

const IMAGES_DIR = 'docs/assets/images';

/**
 * 确保目录存在
 */
async function ensureDir(dir) {
    try {
        await fs.mkdir(dir, { recursive: true });
    } catch { }
}

/**
 * 处理图片（下载远程图片或复制本地图片）
 * @param {string[]} images - 图片路径或URL数组
 * @param {string} itemId - 收藏项ID
 * @returns {Promise<{images: string[], thumbnail: string}>}
 */
export async function processImages(images, itemId) {
    if (!images || images.length === 0) {
        return { images: [], thumbnail: null };
    }

    const itemDir = path.join(IMAGES_DIR, itemId);
    await ensureDir(itemDir);

    const processedImages = [];
    let thumbnail = null;

    for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const ext = getExtension(img);
        const filename = `${i + 1}${ext}`;
        const filepath = path.join(itemDir, filename);

        try {
            let buffer;

            // 判断是URL还是本地文件
            if (img.startsWith('http://') || img.startsWith('https://')) {
                console.log(`  下载图片: ${img}`);
                buffer = await downloadImage(img);
            } else {
                console.log(`  复制图片: ${img}`);
                buffer = await fs.readFile(img);
            }

            // 压缩并保存图片
            await sharp(buffer)
                .resize(1200, 800, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 85 })
                .toFile(filepath.replace(ext, '.jpg'));

            const savedPath = `/assets/images/${itemId}/${filename.replace(ext, '.jpg')}`;
            processedImages.push(savedPath);

            // 第一张图作为缩略图
            if (i === 0) {
                const thumbPath = path.join(itemDir, 'thumb.jpg');
                await sharp(buffer)
                    .resize(400, 225, { fit: 'cover', position: 'top' })
                    .jpeg({ quality: 80 })
                    .toFile(thumbPath);
                thumbnail = `/assets/images/${itemId}/thumb.jpg`;
            }
        } catch (error) {
            console.error(`  处理图片失败: ${img}`, error.message);
        }
    }

    return { images: processedImages, thumbnail };
}

/**
 * 下载远程图片
 */
async function downloadImage(url) {
    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
            'Accept': 'image/*'
        },
        timeout: 30000
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
}

/**
 * 获取文件扩展名
 */
function getExtension(pathOrUrl) {
    const url = pathOrUrl.split('?')[0];
    const ext = path.extname(url).toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext) ? ext : '.jpg';
}

/**
 * 删除收藏项的所有图片
 */
export async function deleteImages(itemId) {
    const itemDir = path.join(IMAGES_DIR, itemId);
    try {
        await fs.rm(itemDir, { recursive: true, force: true });
        console.log(`  已删除图片目录: ${itemDir}`);
    } catch { }
}

/**
 * 生成唯一的收藏项ID
 */
export function generateItemId(name) {
    const base = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 30);
    return `${base}-${nanoid(6)}`;
}