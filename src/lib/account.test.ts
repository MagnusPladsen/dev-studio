import { describe, expect, it, vi } from "vitest";
import { clearDeviceStorage, deleteOwnAccount, type AccountClient } from "./account";

function fakeClient(error: { message: string } | null) {
  const client = {
    rpc: vi.fn(async () => ({ error })),
    auth: { signOut: vi.fn(async () => ({ error: null })) },
  };
  return client satisfies AccountClient;
}

describe("deleteOwnAccount", () => {
  it("calls the database function, then forgets the session in this browser only", async () => {
    const client = fakeClient(null);
    expect(await deleteOwnAccount(client)).toBeNull();
    expect(client.rpc).toHaveBeenCalledWith("delete_own_account");
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("stays signed in and reports the error when the deletion fails", async () => {
    const client = fakeClient({ message: "permission denied" });
    expect(await deleteOwnAccount(client)).toBe("permission denied");
    expect(client.auth.signOut).not.toHaveBeenCalled();
  });
});

describe("clearDeviceStorage", () => {
  it("removes this app's projects and settings and leaves other sites' keys", () => {
    const values = new Map([
      ["gds:projects", "[]"],
      ["gds:p1:notes", "[]"],
      ["gds-analytics-consent", "granted"],
      ["gds-tutorials-seen", "{}"],
      ["sb-abc-auth-token", "token"],
      ["other", "1"],
    ]);
    const store = {
      get length() {
        return values.size;
      },
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => void values.delete(key),
    } as Storage;

    expect(clearDeviceStorage(store)).toBe(4);
    expect([...values.keys()]).toEqual(["sb-abc-auth-token", "other"]);
  });
});
