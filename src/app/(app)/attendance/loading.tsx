export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-32 bg-ash-gray rounded-lg" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 bg-ash-gray rounded-xl" />
        ))}
      </div>
      <div className="h-40 bg-ash-gray rounded-xl" />
      <div className="h-64 bg-ash-gray rounded-xl" />
    </div>
  );
}
