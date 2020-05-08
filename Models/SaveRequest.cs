using System.Drawing;

namespace iMage.Models
{
    public class SaveRequest : ImageDataRequest
    {
        public Rectangle Bounds { get; set; }
        public Size Target { get; set; }
        public bool OpenForEdit { get; set; }
        public Metadata Metadata { get; set; }
    }
}
