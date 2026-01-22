# GitHub Stars 收藏系统 - 完整实现指南

## 快速开始

### 1. 创建项目结构

```bash
mkdir github-stars && cd github-stars

# 创建目录结构
mkdir -p docs/{assets/{css,js,images},data/items}
mkdir -p admin/scripts/utils
mkdir -p temp
```

### 2. 初始化项目

```bash
npm init -y
npm install @octokit/rest cheerio express fuse.js inquirer multer nanoid node-fetch sharp
npm install -D serve
```

### 3. 创建文件

按照前面的 Artifact 内容，依次创建以下文件：

| 文件路径 | 对应 Artifact |
|---------|--------------|
| `package.json` | package.json |
| `docs/index.html` | docs/index.html |
| `docs/detail.html` | docs/detail.html |
| `admin/index.html` | admin/index.html |
| `admin/server.js` | admin/server.js |
| `admin/scripts/add.js` | admin/scripts/add.js |
| `admin/scripts/batch-update.js` | admin/scripts/batch-update.js |
| `admin/scripts/update.js` | update.js 部分 |
| `admin/scripts/delete.js` | delete.js 部分 |
| `admin/scripts/utils/github-api.js` | github-api.js |
| `admin/scripts/utils/image-handler.js` | image-handler.js |

### 4. 创建初始数据文件

**docs/data/categories.json:**
```json
{
  "categories": [
    { "id": "frontend", "name": "前端", "icon": "🌐" },
    { "id": "backend", "name": "后端", "icon": "⚙️" },
    { "id": "mobile", "name": "移动端", "icon": "📱" },
    { "id": "database", "name": "数据库", "icon": "🗄️" },
    { "id": "tools", "name": "工具", "icon": "🔧" },
    { "id": "devops", "name": "DevOps", "icon": "🚀" },
    { "id": "ai", "name": "AI/ML", "icon": "🤖" },
    { "id": "article", "name": "技术文章", "icon": "📝" }
  ],
  "tags": []
}
```

**docs/data/collections.json:**
```json
{
  "lastUpdated": "",
  "total": 0,
  "items": []
}
```

### 5. 配置 GitHub Token（可选但推荐）

创建 `.env` 文件或直接设置环境变量：

```bash
# 方式1: 环境变量
export GITHUB_TOKEN=your_github_personal_access_token

# 方式2: 在 package.json scripts 中
"admin": "GITHUB_TOKEN=xxx node admin/server.js"
```

获取 Token: GitHub → Settings → Developer settings → Personal access tokens

---

## 使用方式

### 方式一：Web 管理界面（推荐）

```bash
npm run admin
```

然后访问 http://localhost:3001

功能：
- **添加收藏**: 输入 URL → 点击解析 → 填写信息 → 添加
- **管理列表**: 搜索、归档、删除收藏
- **批量更新**: 一键更新所有 GitHub 仓库信息

### 方式二：命令行工具

```bash
# 添加收藏（交互式）
npm run add

# 批量更新 GitHub 信息
npm run batch-update

# 更新指定收藏
npm run update

# 删除收藏
npm run delete
```

### 预览博客

```bash
# 方式1: 通过管理后台
npm run admin
# 访问 http://localhost:3001/docs/

# 方式2: 独立启动
npm run dev
# 访问 http://localhost:3000
```

---

## 部署到 GitHub Pages

### 1. 创建 GitHub 仓库

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/你的用户名/github-stars.git
git push -u origin main
```

### 2. 配置 GitHub Pages

1. 进入仓库 Settings → Pages
2. Source 选择 `Deploy from a branch`
3. Branch 选择 `main`，文件夹选择 `/docs`
4. 点击 Save

### 3. 访问博客

等待几分钟后，访问：`https://你的用户名.github.io/github-stars/`

### 4. 更新内容

每次添加/修改收藏后：

```bash
git add docs/
git commit -m "Update collections"
git push
```

---

## 工作流程示例

### 添加一个 GitHub 仓库

1. 运行 `npm run admin`
2. 在「添加收藏」输入框粘贴 GitHub URL
3. 点击「解析」自动获取仓库信息
4. 补充中文名称、简介、分类、标签
5. 添加预览图片（URL 或本地文件）
6. 点击「添加收藏」
7. 提交到 GitHub: `git add . && git commit -m "Add xxx" && git push`

### 添加一篇技术文章

流程相同，系统会自动识别为文章类型，并尝试抓取标题、描述、预览图。

### 定期更新 Stars 数

```bash
# 设置 Token 避免限额
export GITHUB_TOKEN=xxx

# 运行批量更新
npm run batch-update

# 提交更新
git add docs/data/
git commit -m "Update stats"
git push
```

---

## 自定义配置

### 修改分类

编辑 `docs/data/categories.json`，添加或修改分类：

```json
{
  "categories": [
    { "id": "game", "name": "游戏开发", "icon": "🎮" },
    ...
  ]
}
```

### 修改主题样式

编辑 `docs/index.html` 中的 CSS 变量：

```css
:root {
  --bg: #0d1117;        /* 背景色 */
  --accent: #58a6ff;    /* 强调色 */
  --card-bg: #1c2128;   /* 卡片背景 */
}
```

### 自定义卡片宽度

修改 `.card` 的 `width` 属性：

```css
.card { width: 280px; }  /* 更窄的卡片 */
```

---

## 常见问题

**Q: 图片无法显示？**
A: 确保图片已正确下载到 `docs/assets/images/` 目录，并且路径以 `/assets/images/` 开头。

**Q: GitHub API 限额用完？**
A: 设置 `GITHUB_TOKEN` 环境变量，限额从 60次/小时 提升到 5000次/小时。

**Q: 如何备份数据？**
A: 整个 `docs/data/` 目录就是你的数据，定期备份或通过 Git 管理。

**Q: 支持私有仓库吗？**
A: 需要 Token 有 `repo` 权限才能访问私有仓库信息。
