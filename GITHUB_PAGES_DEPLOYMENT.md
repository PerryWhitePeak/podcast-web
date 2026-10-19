# GitHub Pages 部署说明

## 当前状态

此目录已经可以作为独立前端仓库的根目录。当前本机没有可用 Git 仓库元数据；GitHub CLI 账户 `PerryYang10` 的本地令牌也已失效，因此尚未创建仓库、推送或上线。

推荐仓库名为 `podcast-web`，发布分支为 `main`。首次公开发布前必须由项目所有者明确确认仓库名称、公开可见性，以及逐字稿和三张人物图片的公网发布授权。

## 公开仓库范围

只提交本目录中未被 `.gitignore` 排除的文件。不要把父目录中的 `rag`、`audio`、`editorial`、`output`、`.env`、数据库、索引、运行日志或测试结果复制进仓库。

发布素材包括：

- `content/完整逐字稿github.md`
- `public/interview-duo.png`
- `public/sun-yuchen.png`
- `public/shao-ailun.png`

上述内容必须完成权利确认后才能公开推送。`npm run audit:public` 会检查常见密钥、私钥、数据库、音频和私有环境文件，但不能替代版权与隐私审查。

## 首次建库（获得明确授权后）

在 `frontend` 目录中创建全新仓库可以避免把 Podcast 工程的其他文件或未知历史带入公开仓库：

```powershell
git init -b main
git add .
git status --short
git diff --cached --stat
git diff --cached -- . ':!content/完整逐字稿github.md'
git commit -m "Prepare Podcast frontend for GitHub Pages"
gh auth login -h github.com
gh repo create podcast-web --public --source . --remote origin --push
```

不要在未确认公开发布前执行最后一条命令。若改用已有仓库，应先检查其完整 Git 历史是否包含秘密；仅新增 `.gitignore` 不能清除历史泄漏。

## Pages 与 Actions 设置

1. 在仓库 Settings → Pages 中将 Source 设为 **GitHub Actions**。
2. 工作流在 push 到 `main` 或手动触发时运行。
3. 构建任务只有 `contents: read`；部署任务才获得 `pages: write` 与 `id-token: write`。
4. 工作流使用锁文件执行 `npm ci`，然后进行公开源审计、类型检查、Vitest、Pages Playwright、生产构建与产物审计。
5. 并发组为 `pages`，新部署会取消旧的进行中部署。

工作流默认规则：

- `<用户名>.github.io` 仓库使用 `/`。
- 其他仓库使用 `/<仓库名>/`。
- 自定义域名或特殊路径可创建 Repository Variable `VITE_BASE_PATH` 覆盖，值必须是 `/` 或 `/路径/`。
- 创建 Repository Variable `VITE_API_BASE_URL` 后会连接云端 API；值必须是无内嵌凭据的绝对 HTTPS URL。

## 云端 API 联调要求

GitHub Pages 与 API 通常跨域。后端上线时需要由后端完成以下配置，前端 UI 不能替代：

- CORS 只允许实际 Pages HTTPS Origin，不使用带凭据的 `*`。
- 允许凭据、所需方法与 `Content-Type`、`X-CSRF-Token`、`X-Request-ID` 请求头。
- 会话 Cookie 使用 `Secure`、`HttpOnly`，跨站场景采用合适的 `SameSite=None`；同时保持服务端 CSRF 校验。
- SSE 端点允许跨域 `POST` 流式响应且不被代理缓冲。
- 音频端点支持 `Range`、`206 Partial Content`、`Content-Range`，并允许凭据化媒体请求。
- API 不得依赖 GitHub Pages 对 `/api` 的同源反向代理。

修改 Repository Variable 后重新运行 Pages 工作流。未设置 API 时是预期离线状态：静态页面可用，Agent/登录/额度界面保留，但不会发请求、扣额度或生成假回答。

## 上线后验收

工作流成功不等于公网验收完成。需要用 Actions 输出的 HTTPS 地址实际检查：

- 首页图片、CSS、JS 和导航。
- 直接打开并刷新 `/agent` 与 `/transcript`。
- 邮箱登录弹层、邀请码与额度 UI。
- 后端未配置时没有 `/api` 或音频请求。
- 后端配置后，Cookie 登录、SSE、引用卡片和音频 Range 定位。
- 桌面与手机无横向溢出，聊天页未点击引用时没有常驻音频播放器。

相关官方说明：[Vite GitHub Pages 部署](https://main.vite.dev/guide/static-deploy#github-pages)、[GitHub Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。
