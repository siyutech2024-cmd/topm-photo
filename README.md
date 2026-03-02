# TOPM Photo — AI 产品图片生成平台

> 上传产品实拍图，Gemini AI 自动生成专业电商展示图、场景图和九宫格拼图。
> **数据存储在 Supabase 云端数据库 + Storage，支持 Vercel 部署。**

---

## 🚀 部署方式

### 方式一：Vercel + Supabase 线上部署（推荐）

#### 1️⃣ 配置 Supabase

1. 打开 [Supabase Dashboard](https://supabase.com/dashboard)，创建新项目
2. 进入 **SQL Editor**，运行 `supabase/init.sql` 脚本
3. 进入 **Storage**，创建名为 `product-images` 的 Public Bucket
4. 在 Storage Policies 中允许 `SELECT/INSERT/UPDATE/DELETE`
5. 在 **Settings → API** 中复制 `Project URL` 和 `anon public` Key

#### 2️⃣ 部署到 Vercel

1. Fork 或推送本仓库到 GitHub
2. 打开 [Vercel Dashboard](https://vercel.com)，导入项目
3. 设置 **Framework Preset** 为 `Vite`
4. 添加环境变量：

| 变量名 | 说明 |
|--------|------|
| `VITE_SUPABASE_URL` | Supabase Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase Anon Key |
| `GEMINI_API_KEY` | Google Gemini API Key（服务端） |

5. 点击 **Deploy** 🚀

---

### 方式二：本地开发

#### 1. 安装 Node.js

下载 [Node.js LTS](https://nodejs.org)（v20+），验证安装：

```bash
node -v    # → v20.x.x
npm -v     # → 10.x.x
```

#### 2. 克隆并安装

```bash
git clone https://github.com/siyutech2024-cmd/topm-photo.git
cd topm-photo
cp .env.example .env
# 编辑 .env 填入 Supabase 和 Gemini 配置
npm install
```

#### 3. 启动

```bash
npm run dev
```

打开浏览器访问 **http://localhost:5174/** 🎉

---

## 📖 使用流程

| 步骤 | 操作 |
|------|------|
| ① 创建产品 | 点击「创建产品」，上传 4 张实拍图 |
| ② AI 生成 | 系统自动生成多风格展示图 + 九宫格拼图 |
| ③ 管理导出 | 在「产品管理」中查看、ZIP 下载、Excel 导出 |

## 💾 数据说明

- 所有产品数据和图片存储在 **Supabase 云端**
- 多设备同步，数据不会因清除浏览器缓存而丢失

---

## 🏗️ 技术栈

| 技术 | 用途 |
|------|------|
| Vite + React + TypeScript | 前端框架 |
| Supabase PostgreSQL | 数据库（产品数据） |
| Supabase Storage | 图片存储 |
| Gemini AI | 产品图生成 + 信息提取 |
| Vercel | 部署 + Serverless API |

## ❓ 常见问题

| 问题 | 解决方案 |
|------|---------| 
| `npm install` 报错 | 运行 `npm cache clean --force` 后重试 |
| 页面空白 | 检查 `.env` 中 Supabase 配置是否正确 |
| AI 生成失败 | 确认 API Key 正确，网络可访问 Google 服务 |
| 端口占用 | 修改 `vite.config.ts` 中的 `port` 配置 |
