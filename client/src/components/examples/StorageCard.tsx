import { StorageCard } from "../StorageCard";

export default function StorageCardExample() {
  return (
    <div className="p-4 max-w-2xl">
      <StorageCard usedGB={3.2} totalGB={5} />
    </div>
  );
}
