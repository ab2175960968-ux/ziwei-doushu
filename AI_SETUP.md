# AI 命盘解读配置

排盘算法在本地运行，不需要 AI Key。AI 命盘解读和合盘功能通过服务端 API 调用 DeepSeek。

## 1. 创建 API Key

前往 https://platform.deepseek.com/ 注册并创建 API Key。不要把密钥发到聊天、提交到 GitHub，或放进任何 `NEXT_PUBLIC_*` 变量。

## 2. 本地运行

在项目根目录创建 `.env.local`：

```dotenv
DEEPSEEK_API_KEY=你的真实API密钥
DEEPSEEK_MODEL=deepseek-flash
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

然后运行：

```bash
npm install
npm run dev
```

打开 http://localhost:3000/chart，填写出生信息生成命盘。AI 解读会调用 `/api/interpret`；合盘页面会调用 `/api/heming`。

## 3. 部署到 Vercel

1. 登录 https://vercel.com/，选择 Add New → Project。
2. 导入 GitHub 仓库 `ab2175960968-ux/ziwei-doushu`。
3. 在 Settings → Environment Variables 添加 `DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL=deepseek-flash` 和 `NEXT_PUBLIC_SITE_URL`。
4. 选择 Production（Preview 可按需启用），保存后重新部署。

## 4. 安全说明

API Key 仅由服务端读取。当前接口做了请求体、命盘结构和对话长度校验；公开给多人使用前，建议继续增加登录鉴权、速率限制和用量预算保护。AI 输出仅供传统文化学习与娱乐参考，不替代医疗、财务或法律专业意见。请阅读上游 README、LICENSE 与 DATASET-LICENSE，遵守各自许可。
