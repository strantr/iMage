using Microsoft.Extensions.Hosting;
using Microsoft.Win32;
using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;

namespace iMage
{
    public static class Paths
    {
        public static readonly string Root = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
        public static string Preferences => Path.Combine(Root, "preferences.json");
        public static string Images => Path.Combine(Root, "images");
        public static string Sources => Path.Combine(Images, "sources");
        public static string Processed => Path.Combine(Images, "processed");
        public static string Temp => Path.Combine(Images, "temp");
        public static string Tools => Path.Combine(Root, "Tools");
        public static string AntiDuplDir => Path.Combine(Tools, "AntiDupl.NET");
        public static string AntiDuplData => Path.Combine(AntiDuplDir, "user");
        public static string AntiDuplExe => Path.Combine(AntiDuplDir, "AntiDupl.NET.exe");
        public static string Waifu2xDir => Path.Combine(Tools, "waifu2x-DeadSix27");
        public static string Waifu2xExe => Path.Combine(Waifu2xDir, "waifu2x-converter-cpp.exe");
        public static string ClientApp
        {
            get
            {
                var environment = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT");
                if (environment == Environments.Development)
                {
                    return Path.GetFullPath("clientapp");
                }
                else
                {
                    return Path.Combine(Root, "clientapp");
                }
            }
        }
        public static string Editor => Registry.GetValue(@"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths", "Photoshop.exe", @"C:\Program Files\Adobe\Adobe Photoshop 2020\Photoshop.exe").ToString();

        static Paths()
        {
            Directory.CreateDirectory(Sources);
            Directory.CreateDirectory(Processed);
            Directory.CreateDirectory(Temp);

            if (!Directory.Exists(AntiDuplDir))
            {
                throw new FileNotFoundException("Missing AntiDupl.NET directory.");
            }
            if (!File.Exists(AntiDuplExe))
            {
                throw new FileNotFoundException("Missing AntiDupl.NET executable.");
            }

            if (!Directory.Exists(Waifu2xDir))
            {
                throw new FileNotFoundException("Missing Waifu2x directory.");
            }
            if (!File.Exists(Waifu2xExe))
            {
                throw new FileNotFoundException("Missing Waifu2x executable.");
            }
        }
    }
}
