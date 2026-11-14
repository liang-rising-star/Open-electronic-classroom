
namespace OecDesktop;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);

        // --selftest [--out=<path>]：加载完成后跑一段脚本并写结果，用于构建验证
        // --server=<url>：改为连接 Python 后端（默认用随包静态页面）
        var selfTest = args.Contains("--selftest", StringComparer.OrdinalIgnoreCase);
        var outPath = args
            .FirstOrDefault(a => a.StartsWith("--out=", StringComparison.OrdinalIgnoreCase))?
            .Substring("--out=".Length)
            ?? Path.Combine(Path.GetTempPath(), "oec-selftest.json");
        var server = args
            .FirstOrDefault(a => a.StartsWith("--server=", StringComparison.OrdinalIgnoreCase))?
            .Substring("--server=".Length);

        Application.Run(new HostForm(selfTest, outPath, server));
    }
}
