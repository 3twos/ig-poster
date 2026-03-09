#!/usr/bin/env node

import { runCli } from "./index";

const argv = process.argv.slice(2);

runCli(argv).then((exitCode) => {
  process.exitCode = exitCode;
});
