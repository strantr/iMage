using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Newtonsoft.Json;
using System;
using System.Collections.Generic;
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
#if DEBUG
            CreateHostBuilder(args).Build().Run();
#else
            _ = CreateHostBuilder(args).Build().RunAsync();
#endif

            var sizes = new List<ToolStripItem>();

            var notification = new NotifyIcon
            {
                Icon = new Icon(Path.Combine(Paths.Root, "ico.ico")),
                Text = "iMage",
                ContextMenuStrip = new ContextMenuStrip()
                {
                    Renderer = new NonHighlightedButtonRenderer()
                },
            };

            var title = new ToolStripButton("iMage");
            title.AutoSize = false;
            title.Font = new Font(title.Font, FontStyle.Bold);
            title.TextAlign = ContentAlignment.MiddleCenter;
            title.ForeColor = Color.DodgerBlue;

            notification.ContextMenuStrip.Items.Add(title);
            notification.ContextMenuStrip.Items.Add(new ToolStripSeparator());
            notification.ContextMenuStrip.Items.Add("Next Wallpaper", null, (s, e) => slideshow.Next(true));
            notification.ContextMenuStrip.Items.Add(new ToolStripSeparator());
            notification.ContextMenuStrip.Items.Add("Exit", null, (s, e) => Environment.Exit(0));
            notification.Visible = true;

            notification.ContextMenuStrip.Opening += (s, e) =>
            {
                foreach(var sz in sizes)
                {
                    notification.ContextMenuStrip.Items.Remove(sz);
                }
                sizes.Clear();
                foreach(var sz in slideshow.Wallpapers.OrderBy(sz => sz.Key.Width * sz.Key.Height))
                {
                    var item = new ToolStripMenuItem($"{sz.Key.Width}x{sz.Key.Height}: {sz.Value}");
                    item.Enabled = false;
                    notification.ContextMenuStrip.Items.Insert(1, item);
                    sizes.Add(item);
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
