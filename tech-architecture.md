# GitHub 开源库收藏展示系统 - 技术架构

## 一、整体架构

```
github-stars/
├── docs/                          # GitHub Pages 部署目录
│   ├── index.html                 # 首页
│   ├── detail.html                # 详情页模板
│   ├── assets/
│   │   ├── css/
│   │   │   └── style.css
│   │   ├── js/
│   │   │   ├── app.js            # 主逻辑
│   │   │   ├── search.js         # 搜索功能
│   │   │   └── gallery.js        # 图片画廊
│   │   └── images/               # 收藏的预览图
│   │       └── {repo-id}/
│   └── data/
│       ├── collections.json      # 所有收藏的索引数据
│       ├── categories.json       # 分类配置
│       └── items/                # 每个收藏的详细信息
│           └── {repo-id}.json
├── admin/                         # 本地管理工具
│   ├── index.html                # Web管理界面
│   ├── server.js                 # 本地服务器
│   └── scripts/
│       ├── add.js                # 添加收藏
│       ├── update.js             # 更新收藏
│       ├── delete.js             # 删除收藏
│       ├── batch-update.js       # 批量更新GitHub信息
│       └── utils/
│           ├── github-api.js     # GitHub API 工具
│           ├── image-handler.js  # 图片处理
│           └── markdown.js       # Markdown 生成
├── package.json
└── README.md
```

## 二、数据结构设计

### 1. collections.json（索引文件）
```json
{
  "lastUpdated": "2025-01-22T10:00:00Z",
  "total": 100,
  "items": [
    {
      "id": "microsoft-vscode",
      "type": "repo",
      "name": "VS Code",
      "nameEn": "Visual Studio Code",
      "summary": "微软出品的轻量级代码编辑器",
      "url": "https://github.com/microsoft/vscode",
      "thumbnail": "/assets/images/microsoft-vscode/thumb.png",
      "category": "tools",
      "tags": ["editor", "typescript", "electron"],
      "stars": 165000,
      "forks": 29000,
      "language": "TypeScript",
      "lastUpdate": "2025-01-20",
      "archived": false,
      "createdAt": "2025-01-15"
    }
  ]
}
```

### 2. 单个收藏详情（items/{id}.json）
```json
{
  "id": "microsoft-vscode",
  "type": "repo",
  "name": "VS Code",
  "nameEn": "Visual Studio Code",
  "url": "https://github.com/microsoft/vscode",
  "homepage": "https://code.visualstudio.com",
  "summary": "微软出品的轻量级代码编辑器",
  "description": "详细的中文介绍...",
  "notes": "个人备注信息",
  "images": [
    "/assets/images/microsoft-vscode/1.png",
    "/assets/images/microsoft-vscode/2.png"
  ],
  "category": "tools",
  "tags": ["editor", "typescript", "electron"],
  "github": {
    "stars": 165000,
    "forks": 29000,
    "language": "TypeScript",
    "license": "MIT",
    "lastUpdate": "2025-01-20",
    "topics": ["editor", "vscode"]
  },
  "archived": false,
  "createdAt": "2025-01-15",
  "updatedAt": "2025-01-22"
}
```

### 3. categories.json（分类配置）
```json
{
  "categories": [
    { "id": "frontend", "name": "前端", "icon": "🌐" },
    { "id": "backend", "name": "后端", "icon": "⚙️" },
    { "id": "mobile", "name": "移动端", "icon": "📱" },
    { "id": "database", "name": "数据库", "icon": "🗄️" },
    { "id": "tools", "name": "工具", "icon": "🔧" },
    { "id": "article", "name": "技术文章", "icon": "📝" }
  ],
  "tags": [
    { "id": "network", "name": "网络库", "category": "backend" },
    { "id": "ui", "name": "UI库", "category": "frontend" },
    { "id": "editor", "name": "编辑器", "category": "tools" }
  ]
}
```

## 三、核心功能实现方案

### 静态博客（前端）
| 功能 | 实现方式 |
|------|----------|
| 分类筛选 | JavaScript 过滤 JSON 数据 |
| Tag筛选 | 多选过滤，URL参数同步 |
| 关键字搜索 | 前端全文搜索（Fuse.js） |
| 图片横向滚动 | CSS overflow-x + wheel 事件 |
| 图片大图 | Lightbox 组件 |
| 详情页 | 根据URL参数加载JSON |

### 管理工具（Node.js）
| 功能 | 实现方式 |
|------|----------|
| 添加收藏 | GitHub API + 图片下载 + JSON生成 |
| 批量更新 | 遍历JSON + GitHub API |
| 更新/删除 | 修改JSON文件 |
| 图片处理 | Sharp库压缩 + 生成缩略图 |

## 四、技术栈

### 前端
- 纯 HTML/CSS/JavaScript（无框架依赖）
- Fuse.js（模糊搜索）
- Viewer.js（图片预览）
- 可选：Alpine.js（轻量响应式）

### 管理工具
- Node.js 18+
- Express（本地Web服务）
- Octokit（GitHub API）
- Sharp（图片处理）
- Inquirer（CLI交互）

## 五、部署方式

1. 将 `docs/` 目录部署到 GitHub Pages
2. 管理工具在本地运行
3. 通过 Git 提交更新内容
