import { describe, expect, it } from "vitest";

import {
  canViewLinkedProjects,
  projectWhereForViewer,
  withLinkedProjectMenu,
} from "@/lib/projectVisibility";

const partnerViewer = {
  id: "user-1",
  role: "partner",
  partnerId: "partner-1",
  customerId: null,
  venueId: null,
};

describe("project visibility", () => {
  it("adds the project menu only for linked partner/customer users", () => {
    expect([...withLinkedProjectMenu(new Set(["dashboard"]), partnerViewer)]).toEqual([
      "dashboard",
      "projects",
    ]);
    expect(canViewLinkedProjects({ ...partnerViewer, partnerId: null })).toBe(false);
    expect(canViewLinkedProjects({ ...partnerViewer, partnerId: null, customerId: "customer-1" })).toBe(true);
  });

  it("scopes linked external users to their project relation", () => {
    expect(projectWhereForViewer(partnerViewer)).toEqual({
      OR: [{ partners: { some: { partnerId: "partner-1" } } }],
    });
  });

  it("returns no projects for an unlinked external account", () => {
    expect(projectWhereForViewer({ ...partnerViewer, partnerId: null })).toEqual({
      id: { in: [] },
    });
    expect(projectWhereForViewer({ ...partnerViewer, role: "member", partnerId: null })).toEqual({});
  });
});
