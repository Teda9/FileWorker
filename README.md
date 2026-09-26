<h1 align="center">FileWorker</h1>

FileWorker 是一个轻量级的文件管理和在线剪贴板，基于 Cloudflare Pages 和 R2。

## ✏️部署

更新无需重新部署，在 fork 的仓库里同步上游即可，cloudflare 会自动更新。 

1. Fork 本仓库
2. 部署 Pages

   Cloudflare DashBoard -> Workers & Pages -> Create application -> Pages ->

   Connect to Git -> 选择 Fork 的仓库 ->

   设置 `Build command`: `npm run build`

   设置 `Build output directory`: `dist`

   点击 `Save and Deploy`

3. 创建 R2 存储桶

   Cloudflare DashBoard -> R2 -> Create Bucket
   记住创建的桶名，后面环境变量处会使用

5. 获取 R2 存储桶的信息

   Cloudflare DashBoard -> R2 -> Manage R2 API Tokens -> Create API token

   选择 Object Read & Write 或者 Admin Read & Write。

   创建后记录 `Access Key ID`、`Secret Access Key`。
   以及存储桶的`Endpoint`（格式为：`https://{account_id}.r2.cloudflarestorage.com`）

   这些信息不会再次显示。

6. 设置环境变量

   Cloudflare DashBoard -> {Your Worker} -> Settings -> Environment Variables -> (Production)Add variables

   添加以下环境变量：

   1. S3 地区，对于 R2 存储桶可以直接设置为 `auto`

      > REGION=auto

   2. 存储桶名称，这里不是固定的，是上一步中创建存储桶的桶名

      > BUCKET=store

   3. 存储桶的 Endpoint

      > ENDPOINT=https://{account_id}.r2.cloudflarestorage.com

   4. Access Key ID

      > ACCESS_KEY_ID=31415926535897932384626433832795

   5. Secret Access Key

      > SECRET_ACCESS_KEY=3141592653589793238462643383279502884197169399375105820974944592

   6. 访问密码（自己设置）
      > PASSWORD=your-own-password

7. 重新部署

   Cloudflare DashBoard -> {Your Worker} -> Deployments -> All deployments -> Retry deployment

更新后的登录仍使用原来的 `PASSWORD`，无需新增环境变量。旧版登录 Cookie 会失效，更新后重新登录一次即可。新上传默认选择私有；需要公开分享时可在上传前手动切换。管理页也可以生成 1 小时、24 小时或 7 天有效的签名分享链接，私有文件不用改成公开。

文件管理和剪贴板管理已分开，支持全库搜索和 20、50、100、200、500 项分页；新保存的对象会分别放入 R2 的 `files/` 与 `clips/` 前缀，已有平铺对象和原访问链接仍可使用。主页会显示最近保存的 5 项。PWA 可添加到手机主屏幕，支持系统分享菜单发送文字或文件到 FileWorker。

文件下载支持单段 Range 请求和 ETag / Last-Modified 条件请求。危险的 HTML、SVG、XML、JavaScript 文件会作为附件下载。R2 对象的公开内容缓存 1 小时，私有内容不缓存。上传的最大大小可通过可选环境变量 `MAX_UPLOAD_SIZE_MB` 设置；未设置时由 Cloudflare 部署计划的请求限制决定。

### 可选：改用 Cloudflare 原生 R2 Binding

现有 S3 凭据方式继续可用，不需要迁移。若想减少 R2 API 凭据，可在 Pages 项目的 Functions 设置中新增名为 `R2_BUCKET` 的 R2 Bucket Binding，并指向当前存储桶；保留 `BUCKET` 名称，再添加 `SESSION_SECRET`（建议至少 32 位随机字符串），然后重新部署。登录密码 `PASSWORD` 仍需保留。确认运行正常后，才可以移除 `ENDPOINT`、`REGION`、`ACCESS_KEY_ID` 和 `SECRET_ACCESS_KEY`。如果 `SESSION_SECRET` 改成不同于原 `SECRET_ACCESS_KEY` 的值，旧登录会话和已生成的分享链接会失效；需要重新登录并重新生成分享链接。

R2 是文件和剪贴板内容的实际存储位置。删除或同名覆盖无法在应用内撤销，重要内容建议定期从 R2 复制一份到其他位置。

## 💡使用

![index](README/index.png)

![clip](README/clip.png)

![file](README/file.png)

![manage](README/manage.png)

## 🎉赞助

CDN acceleration and security protection for this project are sponsored by [Tencent EdgeOne](https://edgeone.ai/?from=github).

![edgeone](https://edgeone.ai/media/34fe3a45-492d-4ea4-ae5d-ea1087ca7b4b.png)
