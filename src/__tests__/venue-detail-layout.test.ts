import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

const venueSource = readFileSync(new URL("../app/(app)/venues/VenueDetailDialog.tsx", import.meta.url), "utf8");
const dialogSource = readFileSync(new URL("../components/ui/dialog.tsx", import.meta.url), "utf8");

describe("venue detail dialog layout", () => {
  it("overrides the shared dialog's desktop width limit, not only its mobile limit", () => {
    const venueClasses = venueSource.match(/<DialogContent className="([^"]+)"/)?.[1];
    const defaultClasses = dialogSource.match(/"(fixed top-1\/2 left-1\/2[^"\n]+)"/)?.[1];
    expect(venueClasses).toBeTruthy();
    expect(defaultClasses).toBeTruthy();

    const merged = cn(defaultClasses, venueClasses).split(/\s+/);
    expect(merged).toContain("sm:max-w-none");
    expect(merged).not.toContain("sm:max-w-sm");
    expect(merged).toContain("max-w-none");
  });
});
