import "dotenv/config";
import pg from "pg";

// Metadata only: stop before DDL if a pending migration conflicts with live schema.
const releases = [
  { name: "20261117090000_project_task_workspace", columns: { checklist_items: ["assigneeId", "taskStatus", "nextCheckDate", "dueDate", "waitingOn", "version"] }, tables: [] },
  { name: "20261117110000_project_scope_and_mail_read", columns: { inbox_mail: ["readAt"], projects: ["workScope", "eventType", "eventDate", "workspaceVersion"] }, tables: [] },
  { name: "20261118090000_project_contact_tracking", columns: {}, tables: ["project_contact_states", "project_contact_logs"] },
];
const stage = process.argv[2];
if (!['before', 'after'].includes(stage) || !process.env.DATABASE_URL) {
  console.error("Workspace migration check requires before/after and DATABASE_URL.");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, statement_timeout: 15000 });
try {
  const history = await pool.query('SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" WHERE migration_name = ANY($1)', [releases.map(item => item.name)]);
  const columns = await pool.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ANY($1)", [["checklist_items", "inbox_mail", "projects"]]);
  const tables = await pool.query("SELECT c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND c.relname = ANY($1)", [["project_contact_states", "project_contact_logs"]]);
  for (const release of releases) {
    const records = history.rows.filter(row => row.migration_name === release.name && !row.rolled_back_at);
    if (records.some(row => !row.finished_at)) throw new Error(`Unfinished migration: ${release.name}`);
    const applied = records.some(row => row.finished_at);
    if (stage === "after" && !applied) throw new Error(`Missing migration: ${release.name}`);
    for (const [table, names] of Object.entries(release.columns)) {
      for (const name of names) {
        const exists = columns.rows.some(row => row.table_name === table && row.column_name === name);
        if (exists !== applied) throw new Error(`Schema/history mismatch: ${table}.${name}`);
      }
    }
    for (const table of release.tables) {
      const actual = tables.rows.find(row => row.relname === table);
      if (Boolean(actual) !== applied || (applied && !actual?.relrowsecurity)) throw new Error(`Schema/RLS mismatch: ${table}`);
    }
  }
  console.log(`Workspace migration ${stage} check passed (${history.rows.filter(row => row.finished_at && !row.rolled_back_at).length}/${releases.length} applied).`);
} catch (error) {
  // Do not print driver errors, SQL arguments, connection strings, or credentials.
  const safe = error instanceof Error && /^(Unfinished migration|Missing migration|Schema\/history mismatch|Schema\/RLS mismatch): [a-zA-Z0-9_.]+$/.test(error.message);
  console.error(safe ? error.message : "Workspace migration metadata check failed; existing live deployment remains unchanged.");
  process.exitCode = 1;
} finally {
  await pool.end();
}
