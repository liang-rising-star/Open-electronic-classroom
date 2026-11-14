using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace OecDesktop;

/// <summary>
/// 机房教师端外壳：一个窗口 + 一个 WebView2，页面通过虚拟域名 oec.local 加载，
/// 这样 http(s) 上下文里的 localStorage、ES 模块等行为与浏览器一致，且不受 file:// 限制。
/// </summary>
internal sealed class HostForm : Form
{
    private const string VirtualHost = "oec.local";
    private const string StartPage = "https://oec.local/web-console/index.html";

    private readonly WebView2 _webView = new();
    private readonly bool _selfTest;
    private readonly string _selfTestOut;
    private readonly string? _server;

    public HostForm(bool selfTest = false, string? selfTestOut = null, string? server = null)
    {
        _selfTest = selfTest;
        _selfTestOut = selfTestOut ?? "oec-selftest.json";
        _server = string.IsNullOrWhiteSpace(server) ? null : server.TrimEnd('/');
        Text = "Open Electronic Classroom · 机房教师端";
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(1280, 800);
        MinimumSize = new Size(1080, 700);
        BackColor = Color.FromArgb(0xE8, 0xEC, 0xF2);
        DoubleBuffered = true;

        var iconPath = Path.Combine(AppContext.BaseDirectory, "app-icon.ico");
        if (File.Exists(iconPath))
        {
            Icon = new Icon(iconPath);
        }

        _webView.Dock = DockStyle.Fill;
        _webView.DefaultBackgroundColor = Color.FromArgb(0xE8, 0xEC, 0xF2);
        Controls.Add(_webView);

        Load += async (_, _) => await InitializeWebViewAsync();
    }

    private static string WebRoot => Path.Combine(AppContext.BaseDirectory, "web");

    private async Task InitializeWebViewAsync()
    {
        try
        {
            var userData = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Open-electronic-classroom",
                "WebView2");

            var environment = await CoreWebView2Environment.CreateAsync(null, userData);
            await _webView.EnsureCoreWebView2Async(environment);

            var core = _webView.CoreWebView2;

            // 默认用随包静态页面；给了 --server 就以 Python 后端为准（页面会走 /api）
            string origin;
            string startPage;
            if (_server is null)
            {
                core.SetVirtualHostNameToFolderMapping(
                    VirtualHost, WebRoot, CoreWebView2HostResourceAccessKind.Allow);
                origin = $"https://{VirtualHost}/";
                startPage = StartPage;
            }
            else
            {
                origin = _server + "/";
                startPage = origin + "web-console/index.html";
            }

            // 桌面软件观感：去掉浏览器自己的右键菜单、状态栏与缩放控件
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.IsZoomControlEnabled = false;
            core.Settings.AreDevToolsEnabled = false;

            // 页面内不做外部跳转，链接一律留在本窗口外拦截
            core.NewWindowRequested += (_, e) => e.Handled = true;
            core.NavigationStarting += (_, e) =>
            {
                if (!e.Uri.StartsWith(origin, StringComparison.OrdinalIgnoreCase))
                {
                    e.Cancel = true;
                }
            };

            core.Navigate(startPage);

            if (_selfTest)
            {
                core.NavigationCompleted += async (_, e) =>
                {
                    var probe = await core.ExecuteScriptAsync(
                        "JSON.stringify({title:document.title," +
                        " machines:document.querySelectorAll('[data-id]').length," +
                        " view:document.getElementById('stageTitle')?.textContent," +
                        " ready:!!document.getElementById('castToggle')})");
                    File.WriteAllText(_selfTestOut, $"navigation={e.IsSuccess}\n{probe}\n");
                    Close();
                };
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                $"无法启动 WebView2：{ex.Message}\n\n请确认已安装 Microsoft Edge WebView2 运行时。",
                "Open Electronic Classroom",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            Close();
        }
    }
}
