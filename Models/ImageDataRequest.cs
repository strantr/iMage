using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;

namespace iMage.Models
{
    public class ImageDataRequest
    {
        public string ImageData { get; set; }

        public Bitmap GetBitmap(out string md5)
        {
            var offset = ImageData.IndexOf(',') + 1;
            var data = Convert.FromBase64String(ImageData[offset..^0]);
            var ms = new MemoryStream(data);
            md5 = GetMD5(data);
            return new Bitmap(ms);
        }

        private static string GetMD5(byte[] data)
        {
            using var md5 = new MD5CryptoServiceProvider();
            var hash = md5.ComputeHash(data);
            var sb = new StringBuilder();
            foreach (var b in hash)
            {
                sb.Append(b.ToString("x2").ToLower());
            }
            return sb.ToString();
        }
    }
}
