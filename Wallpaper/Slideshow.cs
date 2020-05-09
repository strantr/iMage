using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace iMage.Wallpaper
{
    public class Slideshow : IDisposable
    {
        private readonly Timer timer;
        private readonly IDesktopWallpaper wallpaper = (IDesktopWallpaper)new DesktopWallpaperClass();
        private readonly Dictionary<Size, Queue<string>> wallpaperQueue = new Dictionary<Size, Queue<string>>();
        private readonly HashSet<string> known = new HashSet<string>();
        private readonly int interval = 1 * 60 * 1000;
        private readonly Random random = new Random();
        private uint screenIndex = 0;

        public void Next(bool manuallyTriggered = false)
        {
            foreach (var img in Directory.GetFiles(Paths.Processed, "*.png").OrderBy(_ => random.Next()))
            {
                if (known.Add(img))
                {
                    try
                    {
                        // New image
                        var pos = img.LastIndexOf('_');
                        var sz = img.Substring(pos + 1, img.Length - 5 - pos).Split('x');
                        var resolution = new Size(int.Parse(sz[0]), int.Parse(sz[1]));
                        if (wallpaperQueue.ContainsKey(resolution))
                        {
                            wallpaperQueue[resolution].Enqueue(img);
                        }
                        else
                        {
                            wallpaperQueue.Add(resolution, new Queue<string>(new[] { img }));
                        }
                    }
                    catch (Exception)
                    {
                        // Ignore invalid files
                        known.Remove(img);
                    }
                }
            }

            var screenCount = wallpaper.GetMonitorDevicePathCount();
            if (screenIndex >= screenCount)
            {
                screenIndex = 0;
            }
            var id = wallpaper.GetMonitorDevicePathAt(screenIndex);
            var bounds = wallpaper.GetMonitorRECT(id);
            var res = new Size(bounds.Right - bounds.Left, bounds.Bottom - bounds.Top);
            if (wallpaperQueue.ContainsKey(res))
            {
                var queue = wallpaperQueue[res];
                string img = null;
                while (img == null && queue.Count > 0)
                {
                    img = queue.Dequeue();
                    // Remove deleted files
                    if (!File.Exists(img))
                    {
                        known.Remove(img);
                        img = null;
                    }
                }
                queue.Enqueue(img);
                wallpaper.SetWallpaper(wallpaper.GetMonitorDevicePathAt(screenIndex), img);
                wallpaper.SetPosition(DesktopWallpaperPosition.Fill);
                ++screenIndex;
            }
            if (manuallyTriggered)
            {
                timer.Change(interval, interval);
            }
        }

        public Slideshow()
        {
            timer = new Timer(_ =>
            {
                Next();
            }, null, 0, interval);
        }

        public void Dispose() => this.timer.Dispose();
    }
}
