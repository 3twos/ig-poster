#!/usr/bin/env node

import { EXIT_CODES } from "./errors";
import { runCli } from "./index";

const argv = process.argv.slice(2);

runCli(argv).then((exitCode) => {
  process.exitCode = exitCode;
}).catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Unexpected CLI failure"}\n`,
  );
  process.exitCode = EXIT_CODES.transport;
});
