export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-32 bg-ash-gray rounded-lg" />
      <div className="h-10 bg-ash-gray rounded-lg" />
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-10 bg-ash-gray rounded-lg" />
        ))}
      </div>
    </div>
  );
}
