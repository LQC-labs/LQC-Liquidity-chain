import { readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptsDirectory = fileURLToPath(new URL("./", import.meta.url));

async function listModules(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const modules = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      modules.push(...(await listModules(path)));
    } else if (entry.isFile() && extname(entry.name) === ".mjs") {
      modules.push(path);
    }
  }

  return modules.sort();
}

const modules = await listModules(scriptsDirectory);
let failed = false;

for (const modulePath of modules) {
  const result = spawnSync(process.execPath, ["--check", modulePath], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    failed = true;
    process.stderr.write(`Syntax check failed: ${relative(process.cwd(), modulePath)}\n`);
    process.stderr.write(result.stderr || result.stdout);
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log(`Syntax checked ${modules.length} script modules.`);
}
