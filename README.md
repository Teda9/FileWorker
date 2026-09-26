# FileWorker

FileWorker 是一个给个人使用的轻量文件中转和在线文字剪贴板。文件与文字分别管理，内容保存在自己的 Cloudflare R2 存储桶中；应用通过 Cloudflare Pages Functions 提供登录、上传、读取和管理接口。

界面支持中文和英文，适合部署为自己的私有服务。项目使用单一访问密码，不提供多用户账户或细粒度权限管理。

## 功能

### 文件

- 拖放或一次选择多个文件上传，默认设为私有。
- 显示上传状态和进度；失败的文件可以单独重试。
- 覆盖同名内容前会提示确认；文件名会与剪贴板文字名检查冲突。
- 在文件管理中搜索名称或访问链接、选择每页数量（20、50、100、200、500）、翻页、打开、复制链接、重命名和删除。
- 可为私有文件或文字内容生成 1 小时、24 小时或 7 天有效的分享链接，并显示二维码。

### 文字剪贴板

- 保存、打开、搜索、重命名和删除文字内容；可直接编辑已有文字。
- 编辑器支持纯文本、Markdown、JSON、Shell、YAML、JavaScript 和 Python；JSON 可以格式化，Markdown 可以预览标题、表格等内容。
- 编辑内容会在当前浏览器自动保存为草稿，重新打开时可恢复。草稿保存在浏览器本地，不会代替保存到 R2。
- 文件管理与剪贴板管理是两个独立页面，各自有搜索、分页和每页数量设置。

### 分享与手机使用

- 公开内容可由任何拿到链接的人访问，响应允许缓存 1 小时；私有内容需要登录，响应不缓存，也可以单独生成限时分享链接。
- 可安装为 PWA。在支持系统分享目标的浏览器中，可以从其他应用把文字或文件分享给 FileWorker。
- PWA 只缓存应用页面外壳和静态资源，文件、剪贴板内容及接口仍需联网访问；这不是离线文件存储。
- 首页提供上传、保存文字的快捷入口，并显示最近保存的 5 项。

## 部署

推荐使用 Cloudflare Pages 的 Git 集成。连接 GitHub 仓库后，推送到生产分支会触发构建和部署。

### 1. 创建 Pages 项目

在 Cloudflare Pages 中连接本仓库，设置：

| 设置 | 值 |
| --- | --- |
| 构建命令 | `npm run build` |
| 构建输出目录 | `dist` |

### 2. 创建 R2 存储桶和 API 凭据

在 Cloudflare R2 中创建一个桶，然后创建 S3 API Token。建议只授予该桶的 **Object Read & Write** 权限。记录 Access Key ID、Secret Access Key 和账户 ID；Secret Access Key 创建后不会再次显示。

R2 的 S3 endpoint 格式为 `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`。

### 3. 设置 Pages 环境变量

在 Pages 项目的 **Settings → Variables and Secrets** 中，为 **Production** 环境添加以下变量。密码和密钥应设为 Secret，不要写进仓库。

| 变量 | 必需 | 说明 |
| --- | --- | --- |
| `PASSWORD` | 是 | FileWorker 的登录密码。所有使用者共用此密码。 |
| `BUCKET` | 是 | 第 2 步创建的 R2 桶名。 |
| `REGION` | 否 | R2 使用 `auto`；不设置时应用也会默认使用 `auto`。 |
| `ENDPOINT` | 是 | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`。 |
| `ACCESS_KEY_ID` | 是 | R2 S3 API Token 的 Access Key ID。 |
| `SECRET_ACCESS_KEY` | 是 | 对应的 Secret Access Key。 |
| `SESSION_SECRET` | 否，建议设置 | 独立的随机签名密钥。若未设置，应用会使用 `SECRET_ACCESS_KEY` 签署登录会话和限时分享链接。 |
| `MAX_UPLOAD_SIZE_MB` | 否 | 应用层的单文件大小上限，单位 MB。留空时受 Cloudflare 部署计划的请求大小限制。 |

保存变量后重新部署。之后通过 Pages 项目分配的域名或自定义域名访问并使用 `PASSWORD` 登录。升级到 HttpOnly 登录会话后，旧登录状态会失效，需要重新登录一次。

升级时不需要搬动旧数据：新文件和文字分别使用 `files/`、`clips/` 前缀保存；已有的旧格式对象和原访问链接仍可使用。

### 可选：使用原生 R2 Bucket Binding

也可以在 Pages 项目中新增 R2 Bucket Binding，变量名必须为 `R2_BUCKET`，并选择已有存储桶。此方式不需要应用通过 S3 endpoint 访问 R2。

如果采用此方式并移除 `SECRET_ACCESS_KEY`，请保留 `PASSWORD`、`BUCKET`，并设置独立的 `SESSION_SECRET`，否则登录会话和限时链接无法签名。绑定或变量变更后都需要重新部署。不要同时把应用切换到另一个空桶；原有内容仍保存在原 R2 桶内。

Cloudflare 官方说明：[Pages Git 集成](https://developers.cloudflare.com/pages/get-started/git-integration/)、[Pages 构建配置](https://developers.cloudflare.com/pages/configuration/build-configuration/)、[Pages 绑定](https://developers.cloudflare.com/pages/functions/bindings/)、[R2 S3 API 凭据](https://developers.cloudflare.com/r2/api/tokens/)。

## 使用说明

1. 登录后，从首页选择“文件”上传文件，或选择“剪贴板”编辑并保存文字。
2. 新上传文件和新建文字默认是私有的。私有内容仅登录后可访问；限时链接可转发给他人，在设定时限内打开。
3. “公开”表示任何拿到链接的人都能访问。若把公开内容改为私有，原公开链接将不再可用；之后可以为它生成新的限时分享链接。
4. 文件列表和文字列表分开管理。文件不提供内容编辑；文字内容可在剪贴板页面编辑，单个内容超过 2 MB 时不能在编辑器中打开。
5. 删除和同名覆盖无法在 FileWorker 内撤销。R2 是实际存储位置，重要内容请另行备份。

## 浏览器与兼容性

构建配置会生成现代浏览器版本及兼容版本，兼容目标包括 Chrome/Android Chrome 60 及以上、Firefox 60 及以上。这是构建目标，不代表所有旧版 WebView、系统浏览器或国产浏览器都经过验证；旧 Android 设备尚未完成实机测试。浏览器对 Service Worker 或系统分享目标支持不足时，PWA 安装和系统分享入口可能不可用。

## 本地开发

需要 Node.js 和 npm。项目使用 `package-lock.json` 锁定依赖：

```sh
npm ci
npm run dev
```

常用命令：

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动 Vite 前端开发服务器。 |
| `npm run build` | 执行 TypeScript/Vue 类型检查并构建前端。 |
| `npm run preview` | 构建后通过 Wrangler Pages 本地预览；完整调用 Pages Functions 需要配置本地环境变量或 R2 绑定。 |

不要把本地密钥文件或生产凭据提交到 Git。

## 界面截图

<img width="1031" height="518" alt="image" src="https://github.com/user-attachments/assets/73cd69ae-a608-49ae-919d-649ec6cecbba" />

<img width="975" height="846" alt="image" src="https://github.com/user-attachments/assets/3a48a02b-7c4f-4d98-ab2c-72ce3612fd5d" />

<img width="1026" height="538" alt="image" src="https://github.com/user-attachments/assets/a39f65ab-c8a3-48cc-92e5-106d905c9da6" />

<img width="1012" height="328" alt="image" src="https://github.com/user-attachments/assets/b7f1118d-6071-4109-a0e8-7d7fe5b21687" />

<img width="1000" height="328" alt="image" src="https://github.com/user-attachments/assets/3396d05b-6f32-4370-8fce-4e1eef483c4b" />

