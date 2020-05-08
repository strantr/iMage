using iMage.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Win32;
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

            // Upscale image using w2x
            var processedPath = Path.Combine(Paths.Processed, $"{name}_{save.Target.Width}x{save.Target.Height}.png");
            if (!save.Bounds.IsEmpty)
            {
                var scale = save.Target.Width / (double)save.Bounds.Width;
                Waifu2x.Resize(sourcePath, processedPath, scale);

                // Crop
                var bytes = System.IO.File.ReadAllBytes(processedPath);
                using var ms = new MemoryStream(bytes);
                using var enlarged = Image.FromStream(ms);
                scale = enlarged.Width / (double)sourceW;
                using var cropped = new Bitmap(save.Target.Width, save.Target.Height);
                using (var g = Graphics.FromImage(cropped))
                {
                    g.HighQuality().DrawImage(enlarged, (int)(save.Bounds.X * -scale), (int)(save.Bounds.Y * -scale));
                }
                cropped.Save(processedPath);
            }
            else
            {
                Waifu2x.Resize(sourcePath, processedPath, save.Target.Width, save.Target.Height);
            }

            if (save.OpenForEdit)
            {
                var ps = Registry.GetValue(@"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths", "Photoshop.exe", @"C:\Program Files\Adobe\Adobe Photoshop 2020\Photoshop.exe").ToString();
                Process.Start(ps, Path.GetFullPath(processedPath));
            }
            return new Dictionary<string, bool> { { "success", true } };
        }
    }
}