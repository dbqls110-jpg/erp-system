const syncUrl = "https://erp-system-lojo.onrender.com/api/agent/inbox/sync";

const worker = {
  async scheduled(event, env) {
    const key = env.ERP_PRIVATE_INBOX_CRON_SECRET;
    if (typeof key !== "string" || !/^[a-f0-9]{64}$/.test(key)) {
      throw new Error("Mail sync credential is not configured.");
    }

    let response;
    try {
      response = await fetch(syncUrl, {
        method: "POST",
        headers: { "x-erp-inbox-cron": key },
        redirect: "error",
        signal: AbortSignal.timeout(180_000),
      });
    } catch {
      throw new Error("Mail sync request failed.");
    }
    if (!response.ok) throw new Error(`Mail sync returned HTTP ${response.status}.`);

    const result = await response.json().catch(() => null);
    if (result?.ok !== true || result.failed !== 0
      || ![result.checked, result.synced, result.skipped].every(value => Number.isSafeInteger(value) && value >= 0)
      || result.checked !== result.synced + result.skipped) {
      throw new Error("Invalid mail sync response.");
    }
    console.info({ event: "private-inbox-sync", scheduledTime: event.scheduledTime,
      checked: result.checked, synced: result.synced, skipped: result.skipped, failed: result.failed });
  },
};

export default worker;
