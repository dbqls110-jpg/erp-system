"use client";

import Link from "next/link";

interface Props {
  userId: string;
  name: string;
}

export function LeaveHistoryButton({ userId, name }: Props) {
  return (
    <Link
      href={`/leave/${userId}`}
      className="font-medium text-foreground hover:text-primary transition-colors underline-offset-2 hover:underline"
    >
      {name}
    </Link>
  );
}
