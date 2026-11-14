
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
        var selfTest = args.Contains("--selftest", StringComparer.OrdinalIgnoreCase);
        var outPath = args
            .FirstOrDefault(a => a.StartsWith("--out=", StringComparison.OrdinalIgnoreCase))?
            .Substring("--out=".Length)
            ?? Path.Combine(Path.GetTempPath(), "oec-selftest.json");

        Application.Run(new HostForm(selfTest, outPath));
    }
}
