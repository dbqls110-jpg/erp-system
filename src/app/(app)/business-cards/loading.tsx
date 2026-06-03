export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-28 bg-ash-gray rounded-lg" />
      <div className="h-10 bg-ash-gray rounded-lg" />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-36 bg-ash-gray rounded-xl" />
        ))}
      </div>
    </div>
  );
}
