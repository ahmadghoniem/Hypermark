#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;

function parseArguments(argv) {
  let root = process.cwd();
  let tag;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];

    if (argument === "--root" && value) {
      root = resolve(value);
      index += 1;
      continue;
    }
    if (argument === "--tag" && value) {
      tag = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown or incomplete argument: ${argument}`);
  }

  return { root, tag };
}

function readJsonVersion(root, relativePath) {
  const parsed = JSON.parse(readFileSync(resolve(root, relativePath), "utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${relativePath} must contain a JSON object`);
  }

  const version = Object.getOwnPropertyDescriptor(parsed, "version")?.value;
  if (typeof version !== "string") {
    throw new Error(`${relativePath} must contain a string version field`);
  }
  return version;
}

function checkReleaseVersion({ root, tag }) {
  const expectedVersion = readJsonVersion(root, "package.json");

  if (!VERSION_PATTERN.test(expectedVersion)) {
    throw new Error(`Invalid release version in package.json: ${expectedVersion}`);
  }

  if (tag !== undefined && tag !== `v${expectedVersion}`) {
    throw new Error(`Release tag ${tag} does not match manifest version v${expectedVersion}`);
  }

  return expectedVersion;
}

try {
  const version = checkReleaseVersion(parseArguments(process.argv.slice(2)));
  console.log(`Release version is consistent: v${version}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
