export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-32 bg-ash-gray rounded-lg" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-ash-gray rounded-xl" />
        ))}
      </div>
      <div className="h-48 bg-ash-gray rounded-xl" />
      <div className="h-48 bg-ash-gray rounded-xl" />
    </div>
  );
}
