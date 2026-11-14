# Open Electronic Classroom · 桌面外壳（WebView2）

把 `../web-console` 的控制台页面装进一个 Windows 桌面窗口。一个窗口 + 一个 WebView2，没有别的逻辑。

## 技术要求

| 项 | 版本 |
| --- | --- |
| .NET SDK | 8.0 或更高 |
| 目标框架 | `net8.0-windows`（WinForms） |
| NuGet | `Microsoft.Web.WebView2` 1.0.2903.40 |
| 运行时 | Microsoft Edge WebView2 Runtime（Win10/11 一般已自带） |

## 构建与运行

```bash
cd Teacher/desktop
dotnet build -c Release
dotnet run -c Release
```

产物里会自带页面：`bin/Release/net8.0-windows/web/web-console/*`，`web/icon/first/app-icon.png`，
以及窗口图标 `app-icon.ico`。

## 打包分发

```bash
dotnet publish -c Release -r win-x64 --self-contained false
```

把 `publish` 目录整个发出去即可（需要目标机器装了 WebView2 运行时）。

## 构建自检

```bash
dotnet run -c Release -- --selftest --out=selftest.json
```

启动后加载页面、执行一段探针脚本（标题、机器数、当前视图、关键控件是否存在），
写入文件后自动退出，退出码为 0。用于确认页面在 WebView2 里真的跑起来了：

```
navigation=True
"{"title":"Open Electronic Classroom · 机房控制面板","machines":12,"view":"监看墙","ready":true}"
```

## 实现要点

- 页面通过虚拟域名访问：`SetVirtualHostNameToFolderMapping("oec.local", <输出目录>/web)`
  然后导航到 `https://oec.local/web-console/index.html`。
  用 `http(s)` 上下文而不是 `file://`，localStorage、ES 模块、相对路径的行为都和浏览器一致。
- 保持页面的相对路径：输出目录里是 `web/web-console/` 与 `web/icon/`，
  页面里写的是 `../icon/first/app-icon.png`，拷贝时按原结构落地，不用改页面。
- 桌面观感：关闭浏览器默认右键菜单、状态栏、缩放控件与 DevTools；禁止弹出新窗口；
  `NavigationStarting` 里拦掉所有非 `oec.local` 的跳转。
- WebView2 的用户数据放在 `%LOCALAPPDATA%\Open-electronic-classroom\WebView2`，
  卸载时删这个目录即可清干净。
- 初始化失败（没装运行时）会弹窗提示并退出，不会留下空白窗口。

## 文件

| 文件 | 说明 |
| --- | --- |
| `Program.cs` | 入口，启用视觉样式与 PerMonitorV2 DPI |
| `HostForm.cs` | 窗口 + WebView2 初始化、虚拟域名映射、导航拦截 |
| `OecDesktop.csproj` | 依赖与静态资源拷贝规则 |
| `app.manifest` | PerMonitorV2 DPI、Windows 10/11 兼容声明 |
