using AntiDupl.NET;
using System;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;

namespace iMage
{
    public static class AntiDupl
    {
        [DllImport("kernel32.dll", CharSet = CharSet.Ansi, EntryPoint = "LoadLibraryA")]
        private static extern IntPtr LoadLibrary(string moduleName);

        private static readonly CoreLib core;
        private static readonly Options options;
        private static readonly CoreOptions coreOptions;

        static AntiDupl()
        {
            // Since we are in a different directory to normal, AntiDupl.NET can't find the native DLL so preload it here.
            LoadLibrary(Path.Combine(Paths.AntiDuplDir, (IntPtr.Size == 8) ? "AntiDupl64.dll" : "AntiDupl32.dll"));

            Resources.UserPath = Paths.AntiDuplData;
            core = new CoreLib(Resources.UserPath);
            options = Options.Load();
            coreOptions = CoreOptions.Load(options.coreOptionsFileName, core, options.onePath);

            var search = coreOptions.searchPath;
            if (search.Length != 1 || !search.Any(v => Path.GetFullPath(v.path) == Paths.Sources))
            {
                coreOptions.compareOptions.algorithmComparing = CoreDll.AlgorithmComparing.SSIM;
                coreOptions.compareOptions.thresholdDifference = 15;
                coreOptions.searchPath = new[] {
                    new CorePathWithSubFolder(Paths.Sources, true)
                };
                coreOptions.Save(options.coreOptionsFileName);
            }

            core.Load(CoreDll.FileType.MistakeDataBase, Options.GetMistakeDataBaseFileName(), true);
            core.Load(CoreDll.FileType.Result, options.GetResultsFileName(), true);
        }

        public static CoreResult[] Check(string image)
        {
            coreOptions.searchPath = new[] {
                new CorePathWithSubFolder(Paths.Sources, true),
                new CorePathWithSubFolder(image, false)
            };

            coreOptions.Set(core, options.onePath);
            core.Clear(CoreDll.FileType.Result);
            core.Clear(CoreDll.FileType.Temporary);
            core.Load(CoreDll.FileType.ImageDataBase, coreOptions.GetImageDataBasePath(), false);
            core.Search();
            core.ApplyToResult(CoreDll.GlobalActionType.SetGroup);
            core.ApplyToResult(CoreDll.GlobalActionType.SetHint);
            core.Save(CoreDll.FileType.ImageDataBase, coreOptions.GetImageDataBasePath());
            core.Clear(CoreDll.FileType.ImageDataBase);
            core.SortResult((CoreDll.SortType)options.resultsOptions.sortTypeDefault, options.resultsOptions.increasingDefault);

            var count = core.GetResultSize();
            if (count == 0)
            {
                return new CoreResult[] { };
            }
            var images = core.GetResult(0, count);

            return images.Where(match => Path.GetFullPath(match.first.path) == image || Path.GetFullPath(match.second.path) == image).ToArray();
        }
    }
}
