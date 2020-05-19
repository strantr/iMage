using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
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
                Run(args);
            }
            catch (Exception exx)
            {
                File.AppendAllText("error.log", "[" + DateTime.Now.ToString() + "] " + exx.ToString());
                Environment.Exit(-1);
            }
        }

        private static void Run(string[] args)
        {
            var slideshow = new Wallpaper.Slideshow();
            _ = CreateHostBuilder(args).Build().RunAsync();

            var items = new List<ToolStripItem>();

            var notification = new NotifyIcon
            {
                Icon = new Icon(Path.Combine(Paths.Root, "ico.ico")),
                Text = "iMage",
                ContextMenuStrip = new ContextMenuStrip()
                {
                    Renderer = new NonHighlightedButtonRenderer()
                },
            };

            var title = new ToolStripButton("iMage")
            {
                AutoSize = false
            };
            title.Font = new Font(title.Font, FontStyle.Bold);
            title.TextAlign = ContentAlignment.MiddleCenter;
            title.ForeColor = Color.DodgerBlue;

            notification.ContextMenuStrip.Items.Add(title);
            notification.ContextMenuStrip.Items.Add(new ToolStripSeparator());
            notification.ContextMenuStrip.Items.Add("Next Wallpaper", null, (s, e) => slideshow.Next());
            notification.ContextMenuStrip.Items.Add(new ToolStripSeparator());
            notification.ContextMenuStrip.Items.Add("Exit", null, (s, e) => Environment.Exit(0));
            notification.Visible = true;

            notification.ContextMenuStrip.Opening += (s, e) =>
            {
                foreach (var sz in items)
                {
                    notification.ContextMenuStrip.Items.Remove(sz);
                }
                items.Clear();
                var screens = Screen.AllScreens.OrderBy(s => s.Bounds.X).ToArray();
                for (var i = 0; i < screens.Length; i++)
                {
                    var screen = screens[i];
                    var count = slideshow.Wallpapers.ContainsKey(screen.Bounds.Size) ? slideshow.Wallpapers[screen.Bounds.Size] : 0;
                    var item = new ToolStripMenuItem($"Screen {(i + 1)} ({screen.Bounds.Width}x{screen.Bounds.Height}) [{count}]");
                    item.DropDownItems.Add("Edit current", null, (s, e) =>
                    {
                        Process.Start(Paths.Editor, slideshow.Current[screen]);
                    });
                    item.DropDownItems.Add("Browse to current", null, (s, e) =>
                    {
                        var filePath = Path.GetFullPath(slideshow.Current[screen]);
                        Process.Start("explorer.exe", $"/select,\"{filePath}\"");
                    });
                    notification.ContextMenuStrip.Items.Insert(1 + i, item);
                    items.Add(item);
                }

                title.Width = notification.ContextMenuStrip.Width / 2;
            };

            Application.EnableVisualStyles();
            Application.Run();
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

    class NonHighlightedButtonRenderer : ToolStripProfessionalRenderer
    {
        protected override void OnRenderButtonBackground(ToolStripItemRenderEventArgs e)
        {
            if (!e.Item.Selected)
            {
                base.OnRenderButtonBackground(e);
            }
        }
    }
}
