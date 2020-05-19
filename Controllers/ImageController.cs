using iMage.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Win32;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Text.Json;
using static AntiDupl.NET.CoreDll;

namespace iMage.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class ImageController : ControllerBase
    {
        private static Bitmap ResizeImage(Bitmap source, int targetWidth, int targetHeight)
        {
            // Upscaled too large, resize back down
            var maxWidth = Math.Min(targetWidth, source.Width);
            var maxHeight = Math.Min(targetHeight, source.Height);

            var rnd = Math.Max(maxWidth / (decimal)source.Width, maxHeight / (decimal)source.Height);
            var w = (int)Math.Round(source.Width * rnd);
            var h = (int)Math.Round(source.Height * rnd);

            var temp = new Bitmap(w, h);
            using (var g = Graphics.FromImage(temp))
            {
                g.HighQuality().DrawImage(source, 0, 0, w, h);
            }
            return temp;
        }

        private static Bitmap Crop(Bitmap image, int targetWidth, int targetHeight, int x, int y)
        {
            var cropped = new Bitmap(targetWidth, targetHeight);
            using (var g = Graphics.FromImage(cropped))
            {
                g.HighQuality().DrawImage(image, -x, -y);
            }
            return cropped;
        }

        [HttpPost]
        [Route("check")]
        public IEnumerable<ImageMatch> Check(ImageDataRequest req)
        {
            using var image = req.GetBitmap(out var md5);
            var name = $"{md5}_{image.Width}x{image.Height}.png";
            var sourcePath = Path.Combine(Paths.Sources, name);
            if (System.IO.File.Exists(sourcePath))
            {
                return new[] { new ImageMatch(Path.GetRelativePath(Paths.Images, sourcePath), 100, "Keep existing") };
            }
            var tempFile = Path.Combine(Paths.Temp, name);
            image.Save(tempFile);
            try
            {
                var matches = AntiDupl.Check(tempFile);
                var mapped = matches.Select(m =>
                {
                    var firstIsTemp = Path.GetFullPath(m.first.path) == tempFile;
                    var match = firstIsTemp ? m.second : m.first;
                    var hint = "None";
                    switch (m.hint)
                    {
                        case HintType.DeleteFirst:
                            if (firstIsTemp)
                            {
                                hint = "Keep existing";
                            }
                            else
                            {
                                hint = "Overwrite existing";
                            }
                            break;
                        case HintType.DeleteSecond:
                            if (firstIsTemp)
                            {
                                hint = "Overwrite existing";
                            }
                            else
                            {
                                hint = "Keep existing";
                            }
                            break;
                    }
                    return new ImageMatch(Path.GetRelativePath(Paths.Images, Path.GetFullPath(match.path)), 100 - m.difference, hint);
                });

                return mapped;
            }
            finally
            {
                System.IO.File.Delete(tempFile);
            }
        }

        [HttpPost]
        [Route("save")]
        public Dictionary<string, bool> Save(SaveRequest save)
        {
            string name;
            string sourcePath;

            int sourceW;
            int sourceH;

            // Save source image
            using (var image = save.GetBitmap(out name))
            {
                sourceW = image.Width;
                sourceH = image.Height;
                sourcePath = Path.Combine(Paths.Sources, $"{name}_{image.Width}x{image.Height}.png");
                image.Save(sourcePath);
            }

            // Store metadata
            System.IO.File.WriteAllText(Path.ChangeExtension(sourcePath, "json"), JsonSerializer.Serialize(save.Metadata, new JsonSerializerOptions
            {
                WriteIndented = true
            }));

            var processedPath = Path.Combine(Paths.Processed, $"{name}_{save.Target.Width}x{save.Target.Height}.png");
            if (!save.Bounds.IsEmpty)
            {
                var scaleX = save.Target.Width / (double)save.Bounds.Width;
                var scaleY = save.Target.Height / (double)save.Bounds.Height;

                var wx2scale = Math.Max(scaleX, scaleY);
                var wx2w = sourceW * wx2scale;
                var wx2h = sourceH * wx2scale;

                // Upscale image using w2x
                Waifu2x.Resize(sourcePath, processedPath, wx2scale);

                Bitmap enlarged = null;
                var bytes = System.IO.File.ReadAllBytes(processedPath);
                try
                {
                    using (var ms = new MemoryStream(bytes))
                    {
                        enlarged = Image.FromStream(ms) as Bitmap;

                        // wx2 scaling oversized it, shrink it back down
                        if (enlarged.Width != (int)wx2w)
                        {
                            using var tmp = enlarged;
                            enlarged = ResizeImage(enlarged, (int)wx2w, (int)wx2h);
                        }
                    }

                    // Crop!
                    using var cropped = Crop(enlarged, save.Target.Width, save.Target.Height, (int)(save.Bounds.X * wx2scale), (int)(save.Bounds.Y * wx2scale));
                    cropped.Save(processedPath);
                }
                finally
                {
                    if (enlarged != null)
                    {
                        enlarged.Dispose();
                    }
                }
            }
            else
            {
                Waifu2x.Resize(sourcePath, processedPath, save.Target.Width, save.Target.Height);
            }

            if (save.OpenForEdit)
            {
                Process.Start(Paths.Editor, Path.GetFullPath(processedPath));
            }
            return new Dictionary<string, bool> { { "success", true } };
        }
    }
}