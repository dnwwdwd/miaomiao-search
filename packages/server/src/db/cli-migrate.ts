import { loadConfig } from "../config.js";
import { openDatabase } from "./client.js";
import { migrate } from "./migrate.js";

const config = loadConfig();
const database = openDatabase(config.databasePath);
try {
  migrate(database.sqlite);
  process.stdout.write(`Migrated ${config.databasePath}\n`);
} finally {
  database.close();
}
