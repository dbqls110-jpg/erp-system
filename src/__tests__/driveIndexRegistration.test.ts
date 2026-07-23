import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { prisma, driveClient, makeDriveClientAsOwner } = vi.hoisted(() => {
  const driveClient = {
    files: {
      get: vi.fn(),
      list: vi.fn(),
    },
  };
  return {
    driveClient,
    makeDriveClientAsOwner: vi.fn(),
    prisma: {
      $queryRaw: vi.fn(),
      driveIndexFolder: {
        findMany: vi.fn(),
        count: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
      },
      driveIndexFile: {
        findMany: vi.fn(),
      },
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/googleClient", () => ({
  makeDriveClientAsOwner,
  makeSheetsClientAsOwner: vi.fn(),
}));

import { syncDriveIndex } from "@/lib/driveIndex";

describe("Drive index configured-root recovery", () => {
  const originalRootId = process.env.GOOGLE_DRIVE_HERMES_ROOT_FOLDER_ID;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_DRIVE_HERMES_ROOT_FOLDER_ID = "configured-root-id";
    prisma.$queryRaw.mockResolvedValue([{ tableName: "drive_index_folders" }]);
    prisma.driveIndexFolder.findMany.mockResolvedValue([]);
    prisma.driveIndexFolder.count.mockResolvedValue(0);
    prisma.driveIndexFolder.upsert.mockResolvedValue({
      id: "db-folder-id",
      driveFolderId: "configured-root-id",
      name: "ERP 자료",
      webViewLink: "https://drive.google.com/drive/folders/configured-root-id",
      active: true,
      allowedRoles: ["admin", "user"],
      lastScannedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.driveIndexFolder.update.mockResolvedValue({});
    prisma.driveIndexFile.findMany.mockResolvedValue([]);
    driveClient.files.get.mockResolvedValue({
      data: {
        id: "configured-root-id",
        name: "ERP 자료",
        mimeType: "application/vnd.google-apps.folder",
        webViewLink: "https://drive.google.com/drive/folders/configured-root-id",
        trashed: false,
      },
    });
    driveClient.files.list.mockResolvedValue({ data: { files: [] } });
    makeDriveClientAsOwner.mockResolvedValue(driveClient);
  });

  afterEach(() => {
    if (originalRootId === undefined) {
      delete process.env.GOOGLE_DRIVE_HERMES_ROOT_FOLDER_ID;
    } else {
      process.env.GOOGLE_DRIVE_HERMES_ROOT_FOLDER_ID = originalRootId;
    }
  });

  it("registers and scans the configured root when the table is empty", async () => {
    const result = await syncDriveIndex();

    expect(result.folders).toBe(1);
    expect(result.scanned).toBe(0);
    expect(prisma.driveIndexFolder.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { driveFolderId: "configured-root-id" },
      create: expect.objectContaining({
        driveFolderId: "configured-root-id",
        allowedRoles: ["admin", "user"],
      }),
    }));
    expect(driveClient.files.list).toHaveBeenCalled();
  });
});
