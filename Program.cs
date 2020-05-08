using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Newtonsoft.Json;
using System;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Threading;
using System.Windows.Forms;

namespace iMage
{
    public class Program
    {
        [STAThread]
        public static void Main(string[] args)
        {
            try
            {
                var t = new Thread(delegate ()
                {
                    try
                    {
                        CreateHostBuilder(args).Build().Run();
                    }
                    catch (Exception ex)
                    {
                        File.AppendAllText("error.log", "[" + DateTime.Now.ToString() + "] " + ex.ToString());
                        Environment.Exit(-2);
                    }
                })
                {
                    IsBackground = true
                };
                t.Start();

                var notification = new NotifyIcon
                {
                    Icon = new Icon(Path.Combine(Paths.Root, "ico.ico")),
                    Text = "iMage",
                    ContextMenuStrip = new ContextMenuStrip(),
                };
                notification.ContextMenuStrip.Items.Add("Exit", null, (s, e) => Environment.Exit(0));
                notification.Visible = true;
                Application.EnableVisualStyles();
                Application.Run();

            }
            catch (Exception exx)
            {
                File.AppendAllText("error.log", "[" + DateTime.Now.ToString() + "] " + exx.ToString());
                Environment.Exit(-1);
            }
        }

        public static IHostBuilder CreateHostBuilder(string[] args) =>
            Host.CreateDefaultBuilder(args)
                .ConfigureWebHostDefaults(webBuilder =>
                {
                    webBuilder.UseStartup<Startup>();
                    webBuilder.ConfigureAppConfiguration(config =>
                    {
                        var preferencesFile = Paths.Preferences;
                        if (!File.Exists(preferencesFile))
                        {
                            var screens = Screen.AllScreens.OrderBy(s => s.Primary).ThenBy(s => s.BitsPerPixel);
                            File.WriteAllText(preferencesFile, JsonConvert.SerializeObject(new
                            {
                                Preferences = new Models.Preferences
                                {
                                    Sizes = screens.Select(s => new Size(s.Bounds.Width, s.Bounds.Height)).ToArray()
                                }
                            }));
                        }
                        config.AddJsonFile(preferencesFile, optional: true, reloadOnChange: true);
                    });
                });
    }
}
