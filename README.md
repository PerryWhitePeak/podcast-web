# 孙学 × 薄肌理论前端

当前前端包含 Stage 9N 与 Stage 9N-Q：邮箱验证码登录、免费额度与邀请码、三类回答模式、术语规范化交互、可核验引用、按引用定位的单实例音频播放器，以及 SSE 流式回答。

前端使用 React 19、TypeScript 7 和 Vite 8。浏览器只展示 API 返回的回答、引用和时间信息，不在前端伪造模型结果或替代服务端鉴权。

## 本地开发

后端默认由 Vite 将 `/api` 代理到 `http://127.0.0.1:8000`：

```powershell
cd D:\PROJECTS\podcast\frontend
npm ci
npm run dev
```

本地 Docker 的同源 `/api` 行为保持不变。`VITE_API_PROXY_TARGET` 只控制开发服务器代理，不进入生产 API 配置。

## 检查与构建

```powershell
npm run audit:public
npm run typecheck
npm test
npm run build
npm run verify:dist
npm run test:e2e:pages
```

`test:e2e:pages` 会用 `/podcast-web/` 子路径构建，并通过一个模拟 GitHub Pages 404 行为的静态服务器验证首页、`/agent`、`/transcript`、直达刷新、移动端和后端未连接状态。它不调用真实模型或邮件服务。

## 公开环境变量

复制 `.env.example` 时只能填写公开配置：

- `VITE_API_BASE_URL`：未来云端 FastAPI 的 HTTPS 根地址。GitHub Pages 未设置时，不发送 API、音频、登录或额度请求，并显示服务暂不可用。
- `VITE_BASE_PATH`：用户主页/自定义域名为 `/`；仓库页面为 `/仓库名/`。工作流会按仓库自动计算，也允许 Repository Variable 覆盖。
- `VITE_PUBLIC_DEPLOYMENT`：GitHub Actions 自动设为 `github-pages`，用于禁止未配置 API 时误请求 Pages 本身。
- `VITE_API_PROXY_TARGET`：仅用于本地 Vite 代理。

所有 `VITE_` 值都会进入浏览器构建产物，绝不能存放 API Key、SMTP 密码、数据库连接串或其他秘密。

## GitHub Pages

部署工作流位于 `.github/workflows/deploy-pages.yml`。详细的建库、Pages 设置、公开素材门槛和云端 API 联调要求见 [GITHUB_PAGES_DEPLOYMENT.md](GITHUB_PAGES_DEPLOYMENT.md)。

构建会生成与 `index.html` 相同的可执行 `404.html`。当 GitHub Pages 对 `/agent` 或 `/transcript` 返回 404 文档时，页面仍在原 URL 启动，并由前端读取 Vite base 后解析正确路由；这不是跳回首页的静态错误页。

## 证据与媒体边界

- `content/完整逐字稿github.md` 是权威文件的字节一致发布副本，SHA-256 为 `9e85ab9867fa38df5684d4c47c8fed22377ccba32655e78b1d6ce23bc14fdedf`。
- 完整音频不进入 GitHub Pages；播放器统一从 API Base 的 `/api/media/audio` 加载。
- 只有后端返回 `accurate`、有效起止时间、`playback_available=true` 和音频 URL 的引用才能精确播放。
- `needs_review` 与 `unmatched` 继续禁止精确跳转；前端没有放宽引用真实性校验。
