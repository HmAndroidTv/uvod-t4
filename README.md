# 优视频 (Uvod) 私有专属高速云端 API 服务 (CatVod T4)

专为 **HMTV 潘多拉影视 / FongMi / TVBox** 打造的优视频专属云端解析微服务。
彻底解决电视盒子因 ARM CPU 性能不足而在本地运行 JS 计算 RSA/AES 导致的卡顿问题。

- **C++ 级硬件加速**：运行在云端高速机房（Vercel / Deno），加解密速度低于 1 毫秒；
- **CatVod T4 原生标准**：零修改直连 TVBox/FongMi `type: 4`；
- **100% 独立于 Cloudflare**：拥有专属私有域名，不占用任何 Cloudflare 请求额度，永久免费。

---

## 🚀 部署指南（任选一种即可，完全免费）

### 方案 A：使用 Deno Deploy 部署（推荐，30秒搞定，无需 Git 命令）

Deno Deploy 是由 Deno 官方提供的全球边缘无服务器平台（基于 Google Cloud 全球机房），每月提供 **100 万次免费请求**。

1. **登录平台**：打开 [https://dash.deno.com](https://dash.deno.com)（直接点击 "Sign in with GitHub" 登录即可）；
2. **新建项目**：点击页面右上角 **"New Project"** -> 选择 **"Playground"**；
3. **复制代码**：打开本项目中的 [`deno.js`](./deno.js) 文件，复制里面的**全部代码**；
4. **粘贴部署**：粘贴到 Deno Deploy 网页左侧的代码编辑器中，点击右上角 **"Save & Deploy"**；
5. **获取专属域名**：部署成功后，页面上方会显示您的专属域名，例如：
   ```text
   https://uvod-api-xxxx.deno.dev
   ```

---

### 方案 B：使用 Vercel 部署（经典云平台）

Vercel 每月提供 **100 万次免费无状态执行**。

#### 途径 1：通过 GitHub 仓库自动关联（推荐）
1. 在 GitHub 上新建一个空仓库，例如命名为 `uvod-t4`；
2. 在本地进入本项目目录并推送到 GitHub：
   ```bash
   cd /home/junde-lin/Documents/antigravity/uvod-t4-service
   git init
   git add .
   git commit -m "feat: initial commit for uvod t4 service"
   git branch -M main
   git remote add origin git@github.com:amazonjdshop/uvod-t4.git
   git push -u origin main
   ```
3. 打开 [https://vercel.com/new](https://vercel.com/new)，选择刚刚创建的 `uvod-t4` 仓库，点击 **"Deploy"**；
4. 部署完成后即获得专属域名：`https://uvod-t4-xxxx.vercel.app`。

---

## 📺 电视端订阅配置 (dianbo2.m3u8 / dianbo3.m3u8)

获得专属域名后，在 `dianbo2.m3u8` 和 `dianbo3.m3u8` 的站点列表中配置：

```json
{
  "key": "20261101优视频_t4",
  "name": "🇺🇸 湾区·粤语原声专线2",
  "type": 4,
  "api": "https://your-domain.vercel.app",
  "searchable": 1,
  "quickSearch": 1,
  "filterable": 1
}
```
*(注：将上面的 `https://your-domain.vercel.app` 替换为您在 Vercel 或 Deno Deploy 获得的真实专属域名即可！)*
