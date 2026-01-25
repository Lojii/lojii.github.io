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
 * 获取文件扩展名（从路径）
 */
function getExtensionFromPath(pathOrUrl) {
    const url = pathOrUrl.split('?')[0].split('#')[0];
    const ext = path.extname(url).toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg', '.bmp', '.tiff', '.tif', '.ico', '.heic', '.heif'].includes(ext) ? ext : null;
}

/**
 * 通过图片内容检测实际格式
 */
async function detectImageFormat(buffer) {
    try {
        const metadata = await sharp(buffer, { limitInputPixels: false }).metadata();
        const formatMap = {
            'jpeg': '.jpg',
            'png': '.png',
            'gif': '.gif',
            'webp': '.webp',
            'avif': '.avif',
            'svg': '.svg',
            'tiff': '.tiff',
            'heif': '.heic',
            'raw': '.raw'
        };
        return formatMap[metadata.format] || '.jpg';
    } catch {
        // 如果 sharp 无法识别，尝试通过 magic bytes 检测
        return detectByMagicBytes(buffer);
    }
}

/**
 * 通过文件头 magic bytes 检测图片格式
 */
function detectByMagicBytes(buffer) {
    if (!buffer || buffer.length < 12) return '.jpg';

    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
        return '.jpg';
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
        return '.png';
    }

    // GIF: 47 49 46 38 (GIF8)
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
        return '.gif';
    }

    // WebP: 52 49 46 46 ... 57 45 42 50 (RIFF...WEBP)
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
        return '.webp';
    }

    // BMP: 42 4D (BM)
    if (buffer[0] === 0x42 && buffer[1] === 0x4D) {
        return '.bmp';
    }

    // TIFF: 49 49 2A 00 (little endian) 或 4D 4D 00 2A (big endian)
    if ((buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2A && buffer[3] === 0x00) ||
        (buffer[0] === 0x4D && buffer[1] === 0x4D && buffer[2] === 0x00 && buffer[3] === 0x2A)) {
        return '.tiff';
    }

    // ICO: 00 00 01 00
    if (buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x01 && buffer[3] === 0x00) {
        return '.ico';
    }

    // AVIF: 00 00 00 xx 66 74 79 70 61 76 69 66 (....ftypavif)
    if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
        const ftyp = buffer.slice(8, 12).toString('ascii');
        if (ftyp === 'avif' || ftyp === 'avis') return '.avif';
        if (ftyp === 'heic' || ftyp === 'heix' || ftyp === 'mif1') return '.heic';
    }

    // SVG: 检查是否以 < 开头（XML）
    if (buffer[0] === 0x3C) {
        const head = buffer.slice(0, 256).toString('utf8').toLowerCase();
        if (head.includes('<svg') || head.includes('<!doctype svg')) {
            return '.svg';
        }
    }

    // 默认返回 jpg
    return '.jpg';
}

/**
 * 检测图片是否是动图（GIF 或动态 WebP）
 */
async function isAnimatedImage(buffer, ext) {
    if (ext === '.gif') return true;
    if (ext === '.webp') {
        try {
            const metadata = await sharp(buffer, { limitInputPixels: false }).metadata();
            return metadata.pages && metadata.pages > 1;
        } catch {
            return false;
        }
    }
    return false;
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

    try {
        await ensureDir(itemDir);

        const processedImages = [];
        let thumbnail = null;

        for (let i = 0; i < images.length; i++) {
            const img = images[i];

            let buffer;

            // 判断是URL还是本地文件
            if (img.startsWith('http://') || img.startsWith('https://')) {
                console.log(`  下载图片: ${img}`);
                buffer = await downloadImage(img);
            } else {
                console.log(`  复制图片: ${img}`);
                buffer = await fs.readFile(img);
            }

            // 检测图片格式：先尝试从路径获取，没有则从内容检测
            let ext = getExtensionFromPath(img);
            if (!ext) {
                ext = await detectImageFormat(buffer);
                console.log(`  检测到图片格式: ${ext}`);
            }

            // 检测是否是动图
            const isAnimated = await isAnimatedImage(buffer, ext);

            // 动图保持原格式，静态图转 JPG（SVG 保持原格式）
            let outputExt = '.jpg';
            if (isAnimated) {
                outputExt = ext;
            } else if (ext === '.svg') {
                outputExt = '.svg';
            }

            const filename = `${i + 1}${outputExt}`;
            const filepath = path.join(itemDir, filename);

            if (isAnimated) {
                // 动图：保持原格式，保留动画
                console.log(`  检测到动图，保持 ${ext} 格式`);
                try {
                    await sharp(buffer, { animated: true, limitInputPixels: false })
                        .resize(1200, 800, { fit: 'inside', withoutEnlargement: true })
                        .toFile(filepath);
                } catch (err) {
                    // 如果处理失败（如超大 GIF），直接保存原文件，不改变格式
                    console.log(`  动图处理失败，保存原文件: ${err.message}`);
                    await fs.writeFile(filepath, buffer);
                }
            } else if (ext === '.svg') {
                // SVG：直接保存
                console.log(`  检测到 SVG，保持原格式`);
                await fs.writeFile(filepath, buffer);
            } else {
                // 静态图：压缩并转换为 JPG
                await sharp(buffer, { limitInputPixels: false })
                    .resize(1200, 800, { fit: 'inside', withoutEnlargement: true })
                    .jpeg({ quality: 85 })
                    .toFile(filepath);
            }

            const savedPath = `/assets/images/${itemId}/${filename}`;
            processedImages.push(savedPath);

            // 第一张图作为缩略图
            if (i === 0) {
                if (isAnimated) {
                    // 动图缩略图：保持动画格式，不取首帧
                    const thumbPath = path.join(itemDir, `thumb${ext}`);
                    try {
                        await sharp(buffer, { animated: true, limitInputPixels: false })
                            .resize(400, 225, { fit: 'cover', position: 'top' })
                            .toFile(thumbPath);
                    } catch (err) {
                        // 处理失败直接复制原图作为缩略图，保持动图格式
                        console.log(`  动图缩略图处理失败，使用原图: ${err.message}`);
                        await fs.writeFile(thumbPath, buffer);
                    }
                    thumbnail = `/assets/images/${itemId}/thumb${ext}`;
                } else if (ext === '.svg') {
                    // SVG 缩略图：转为 PNG
                    const thumbPath = path.join(itemDir, 'thumb.png');
                    await sharp(buffer, { limitInputPixels: false })
                        .resize(400, 225, { fit: 'cover', position: 'top' })
                        .png()
                        .toFile(thumbPath);
                    thumbnail = `/assets/images/${itemId}/thumb.png`;
                } else {
                    // 静态图缩略图：JPG
                    const thumbPath = path.join(itemDir, 'thumb.jpg');
                    await sharp(buffer, { limitInputPixels: false })
                        .resize(400, 225, { fit: 'cover', position: 'top' })
                        .jpeg({ quality: 80 })
                        .toFile(thumbPath);
                    thumbnail = `/assets/images/${itemId}/thumb.jpg`;
                }
            }
        }

        return { images: processedImages, thumbnail };
    } catch (error) {
        // 发生错误时，删除已创建的文件夹
        console.error(`  清理错误文件夹: ${itemDir}`);
        try {
            await fs.rm(itemDir, { recursive: true, force: true });
        } catch (cleanupError) {
            console.error(`  清理文件夹失败: ${cleanupError.message}`);
        }
        throw error;
    }
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
    const url = pathOrUrl.split('?')[0].split('#')[0];
    const ext = path.extname(url).toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'].includes(ext) ? ext : '.jpg';
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