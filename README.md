# Open Electronic Classroom

开源电子教室 —— 面向中小学机房与平板教室的课堂管理软件。

## 当前进度

教师端控制台已经跑通：网页实现 + Python 后端 + Windows 桌面外壳（WebView2）。

```
Teacher/
  web-console/     机房控制台页面（HTML / CSS / JS，零依赖，无构建步骤）
  server/          教师端后端（Python 标准库，JSON API + SSE 实时推送）
  desktop/         .NET 8 WinForms + WebView2 外壳，把页面装进桌面窗口
  icon/            应用图标
Student/           学生端（待实现）
```

## 快速开始

**只看页面**：直接双击 `Teacher/web-console/index.html`（无后端，纯前端演示）。

**带后端**：

```bash
cd Teacher/server
python app.py            # 打开 http://127.0.0.1:8800/web-console/index.html
```

页面在 http(s) 下会自动连后端，机器状态、投屏、策略、日志都以服务端为准，并通过 SSE 实时推送。

**跑桌面版**：

```bash
cd Teacher/desktop
dotnet run -c Release                                   # 用随包静态页面
dotnet run -c Release -- --server=http://127.0.0.1:8800  # 连 Python 后端
```

需要 .NET 8 SDK 与 WebView2 运行时（Win10/11 一般自带）；后端只需要 Python 3.9+。

## 教师端能力

- 三种视图：监看墙（画面缩略）、座位图（机位卡片）、列表（表格）
- 投屏 / 文件发放 / 打开网址 / 启动程序 / 远程控制 / 学生演示 / 锁屏 / 黑屏肃静 / 开关机
- 按排、按状态筛选，按机号 / 使用者 / IP 搜索
- 选择：单击、Ctrl 加减选、Shift 连选、拖拽框选（实时高亮）、右键上下文菜单
- 管控：锁定外设、禁止安装、上网限制、访问白名单
- 所有设置类改动都是草稿式，点保存才生效；操作日志实时记录
- 后端为唯一真相：多窗口同时打开时，任一处操作都会通过 SSE 同步到其他窗口

## 开发约定

- 提交信息遵循 Conventional Commits（`feat:` / `fix:` / `chore:` …）
- 页面零依赖、零构建，改完刷新即生效
- 构建产物、依赖目录、临时素材不进仓库（见 `.gitignore`）

## 许可证

[MIT](LICENSE)
