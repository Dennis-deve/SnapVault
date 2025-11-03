import { MediaGrid } from "../MediaGrid";

export default function MediaGridExample() {
  const mockItems = Array.from({ length: 9 }, (_, i) => ({
    id: `${i + 1}`,
    filename: `IMG_${1000 + i}.jpg`,
    type: i % 3 === 0 ? "video/mp4" : "image/jpeg",
  }));

  return (
    <div className="p-4">
      <MediaGrid
        items={mockItems}
        onItemClick={(item) => console.log("Item clicked:", item.filename)}
      />
    </div>
  );
}
