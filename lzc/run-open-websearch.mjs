import { startLocalDaemon } from "open-websearch/build/adapters/http/localDaemon.js";
import { createOpenWebSearchRuntime } from "open-websearch/build/runtime/createRuntime.js";

const host = process.env.OPEN_WEBSEARCH_DAEMON_HOST ?? "127.0.0.1";
const port = Number(process.env.OPEN_WEBSEARCH_DAEMON_PORT ?? "3210");
const version = process.env.OPEN_WEBSEARCH_DAEMON_VERSION ?? "2.1.11";
const runtime = createOpenWebSearchRuntime();
const daemon = await startLocalDaemon(runtime, { host, port, version });

let closing = false;
const shutdown = () => {
  if (closing) return;
  closing = true;
  void daemon.close()
    .catch((error) => {
      console.error(`Failed to close Open-WebSearch daemon: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    })
    .finally(() => process.exit());
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
console.log(`Local open-websearch daemon running at ${daemon.baseUrl}`);
await new Promise(() => {});
