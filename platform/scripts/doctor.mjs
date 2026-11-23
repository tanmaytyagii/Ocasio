#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const platformDirectory = fileURLToPath(new URL('../', import.meta.url));
const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10);
let hasBlockingProblem = false;

function report(kind, message) {
  process.stdout.write(`[${kind}] ${message}\n`);
}

function runDocker(args) {
  return spawnSync('docker', args, {
    cwd: platformDirectory,
    shell: false,
    encoding: 'utf8',
    timeout: 8000,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

report('INFO', 'Ocasio local prerequisites; no credentials or environment values are printed.');
if (nodeMajor >= 22) {
  report('OK', `Node ${process.versions.node} meets the Node 22 minimum.`);
} else {
  hasBlockingProblem = true;
  report('BLOCKED', `Node ${process.versions.node} is below the Node 22 minimum.`);
}

const environmentFiles = ['.env', 'apps/api/.env', 'apps/web/.env.local'];
const presentFiles = environmentFiles.filter((name) => existsSync(resolve(platformDirectory, name)));
for (const name of presentFiles) report('OK', `Local configuration file exists: ${name}`);
if (presentFiles.length === 0) {
  report('CHECK', 'No recognised local environment file found. Follow the runbook or supply configuration through the process environment.');
}
report(
  process.env.DATABASE_URL ? 'OK' : 'INFO',
  process.env.DATABASE_URL
    ? 'DATABASE_URL is present in this process; its value is withheld.'
    : 'DATABASE_URL is not present in this process; this check does not load application environment files.',
);

const dockerClient = runDocker(['--version']);
if (dockerClient.error || dockerClient.status !== 0) {
  report('OPTIONAL', 'Docker is unavailable. Local Compose PostgreSQL needs Docker; an independently supplied PostgreSQL database does not.');
} else {
  report('OK', 'Docker client is available.');
  const dockerDaemon = runDocker(['info', '--format', '{{.ServerVersion}}']);
  if (!dockerDaemon.error && dockerDaemon.status === 0) {
    report('OK', 'Docker daemon is reachable.');
  } else {
    report('OPTIONAL', 'Docker daemon is not reachable. Start Docker for Compose, or configure an independent PostgreSQL database.');
  }
}

report('INFO', 'This check does not connect to PostgreSQL, apply migrations, start services, validate policies or prove production readiness.');
report(hasBlockingProblem ? 'BLOCKED' : 'DONE', hasBlockingProblem ? 'Resolve the Node prerequisite before continuing.' : 'Prerequisite inspection completed; review CHECK and OPTIONAL messages before starting the chosen database path.');
process.exitCode = hasBlockingProblem ? 1 : 0;
