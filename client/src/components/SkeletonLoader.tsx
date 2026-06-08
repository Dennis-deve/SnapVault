import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { FolderOpen, ImageIcon } from "lucide-react";

/**
 * Animated Shimmer Wave effect overlay
 */
const ShimmerWave = () => (
  <motion.div
    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full"
    animate={{ x: ["50%", "250%"] }}
    transition={{
      repeat: Infinity,
      duration: 1.6,
      ease: "easeInOut",
    }}
  />
);

/**
 * AlbumGridSkeleton: Matches the responsive grid of albums in Dashboard page
 */
export function AlbumGridSkeleton() {
  // We generate a set of array indices to map skeleton items
  const itemsArray = Array.from({ length: 6 });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {/* Create Album Placeholder Skeleton */}
      <Card className="aspect-square border border-dashed border-white/10 bg-black/10 flex flex-col items-center justify-center p-6 text-center rounded-2xl relative overflow-hidden">
        <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3 animate-pulse">
          <FolderOpen className="h-6 w-6 text-gray-400 opacity-40" />
        </div>
        <div className="h-4 w-28 bg-white/5 rounded-md animate-pulse mb-1" />
        <div className="h-3 w-36 bg-white/5 rounded-md animate-pulse" />
        <ShimmerWave />
      </Card>

      {/* Album Card Skeletons */}
      {itemsArray.map((_, index) => (
        <motion.div
          key={`album-skeleton-${index}`}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: index * 0.08 }}
        >
          <Card className="overflow-hidden bg-black/20 border border-white/10 rounded-2xl relative">
            {/* Aspect Square Image Block */}
            <div className="aspect-square bg-gradient-to-br from-white/5 to-white/10 flex items-center justify-center relative overflow-hidden">
              <FolderOpen className="h-12 w-12 text-white/5" />
              <ShimmerWave />
            </div>

            {/* Title & Item Count lines */}
            <div className="p-4 space-y-3">
              <div className="h-4 w-3/4 bg-white/10 rounded-md animate-pulse" />
              <div className="h-3.5 w-1/4 bg-white/5 rounded-md animate-pulse" />
            </div>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}

/**
 * MediaGridSkeleton: Matches the grid pattern of media items inside Album view details
 */
export function MediaGridSkeleton() {
  const itemsArray = Array.from({ length: 15 });

  return (
    <div className="grid gap-2 md:gap-3 grid-cols-3 md:grid-cols-5">
      {itemsArray.map((_, index) => (
        <motion.div
          key={`media-skeleton-${index}`}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, delay: index * 0.04 }}
          className="aspect-square bg-gradient-to-tr from-white/5 to-white/10 border border-white/5 rounded-xl overflow-hidden relative"
        >
          {/* Inner ambient glow icon */}
          <div className="absolute inset-0 flex items-center justify-center">
            <ImageIcon className="h-8 w-8 text-white/5" />
          </div>
          <ShimmerWave />
        </motion.div>
      ))}
    </div>
  );
}
