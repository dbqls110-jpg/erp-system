export default function Loading() {
  return (
    <div className="space-y-6 max-w-3xl animate-pulse">
      <div className="h-4 w-40 bg-muted rounded" />
      <div className="h-10 w-64 bg-muted rounded-lg" />
      <div className="h-12 bg-muted rounded-xl" />
      <div className="h-48 bg-muted rounded-xl" />
      <div className="h-48 bg-muted rounded-xl" />
    </div>
  );
}
