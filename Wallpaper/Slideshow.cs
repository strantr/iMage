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

        public Slideshow()
        {
            var wallpaper = (IDesktopWallpaper)(new DesktopWallpaperClass());
            var wallpaperQueue = new Dictionary<Size, Queue<string>>();
            var known = new HashSet<string>();
            timer = new Timer(_ =>
            {
                foreach (var img in Directory.GetFiles(Paths.Processed))
                {
                    if (known.Add(img))
                    {
                        // New image
                        var pos = img.LastIndexOf('_');
                        var sz = img.Substring(pos + 1, img.Length - 5 - pos).Split('x');
                        var res = new Size(int.Parse(sz[0]), int.Parse(sz[1]));
                        if (wallpaperQueue.ContainsKey(res))
                        {
                            wallpaperQueue[res].Enqueue(img);
                        }
                        else
                        {
                            wallpaperQueue.Add(res, new Queue<string>(new[] { img }));
                        }
                    }
                }

                for (uint i = 0; i < wallpaper.GetMonitorDevicePathCount(); i++)
                {
                    var id = wallpaper.GetMonitorDevicePathAt(i);
                    var bounds = wallpaper.GetMonitorRECT(id);
                    var res = new Size(bounds.Right - bounds.Left, bounds.Bottom - bounds.Top);
                    if (wallpaperQueue.ContainsKey(res))
                    {
                        var queue = wallpaperQueue[res];
                        var img = queue.Dequeue();
                        queue.Enqueue(img);
                        wallpaper.SetWallpaper(wallpaper.GetMonitorDevicePathAt(i), img);
                        wallpaper.SetPosition(DesktopWallpaperPosition.Fill);
                    }
                }
            }, null, 0, 60000);
        }

        public void Dispose() => this.timer.Dispose();
    }
}
