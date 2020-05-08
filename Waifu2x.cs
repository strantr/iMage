using System;
using System.Diagnostics;
using System.IO;

namespace iMage
{
    public static class Waifu2x
    {
        public static void Resize(string inputPath, string outputPath, double scale)
        {
            inputPath = Path.GetFullPath(inputPath);
            outputPath = Path.GetFullPath(outputPath);
            scale = Math.Ceiling(scale * 10) / 10;

            if (scale == 1)
            {
                File.Copy(inputPath, outputPath);
                return;
            }

            var args = $"-i \"{inputPath}\" -o \"{outputPath}\" --noise-level 1 --mode noise-scale --scale-ratio {scale}";
            var p = Process.Start(new ProcessStartInfo
            {
                Arguments = args,
                CreateNoWindow = true,
                FileName = Paths.Waifu2xExe,
                WorkingDirectory = Paths.Waifu2xDir,
                WindowStyle = ProcessWindowStyle.Hidden,
                UseShellExecute = false
            });
            p.WaitForExit();
            if (!File.Exists(outputPath))
            {
                throw new FileNotFoundException("Unable to generate image: " + p.StandardOutput.ReadToEnd() + "\n" + p.StandardError.ReadToEnd());
            }
        }

        public static void Resize(string inputPath, string outputPath, int width, int height)
        {
            double scale;
            using (var bmp = System.Drawing.Image.FromFile(inputPath))
            {
                var w = bmp.Width;
                var h = bmp.Height;

                var scaleW = Math.Max((double)width / w, 1);
                var scaleH = Math.Max((double)height / h, 1);
                scale = Math.Max(scaleW, scaleH);
            }

            Resize(inputPath, outputPath, scale);
        }
    }
}