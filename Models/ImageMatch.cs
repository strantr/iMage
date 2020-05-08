using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace iMage.Models
{
    public class ImageMatch
    {
        public string Match { get; set; }
        public double Similarity { get; set; }
        public string Recommendation { get; set; }

        public ImageMatch(string match, double similarity, string recommendation)
        {
            Match = match;
            Similarity = similarity;
            Recommendation = recommendation;
        }
    }
}
