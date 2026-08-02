#!/usr/bin/env node
/**
 * Juice Stop — one-command setup.
 *
 *   node scripts/bootstrap.mjs              install, configure, seed, then run both servers
 *   node scripts/bootstrap.mjs --setup-only stop before starting the servers
 *
 * Written in plain Node with no dependencies, because it has to run *before* anything is
 * installed. Node and git are the only things a new contributor needs; pnpm is provisioned here.
 *
 * Every step is idempotent. Re-running this on a working checkout reinstalls, re-applies
 * migrations and starts the servers without destroying anything — in particular it will not
 * re-seed a database that already exists, because the seed truncates and any orders placed while
 * testing would go with it.
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SETUP_ONLY = process.argv.includes('--setup-only');
const TOTAL_STEPS = 6;

/** The pinned pnpm, read from `packageManager` so this script can never drift from it. */
const PINNED_PNPM = (() => {
  try {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    return typeof pkg.packageManager === 'string' ? pkg.packageManager : 'pnpm@11';
  } catch {
    return 'pnpm@11';
  }
})();

/* ── Output ─────────────────────────────────────────────────────────────────────────────────── */

const useColour = process.stdout.isTTY === true && process.env.NO_COLOR === undefined;
const paint = (code, s) => (useColour ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = (s) => paint('1', s);
const dim = (s) => paint('2', s);
const orange = (s) => paint('38;5;208', s);
const green = (s) => paint('32', s);
const red = (s) => paint('31', s);

let stepNumber = 0;
const step = (label) => console.log(`\n${orange(`[${++stepNumber}/${TOTAL_STEPS}]`)} ${bold(label)}`);
const ok = (s) => console.log(`      ${green('✓')} ${s}`);
const note = (s) => console.log(`      ${dim(s)}`);

function die(message, ...hints) {
  console.error(`\n${red('✗')} ${bold(message)}`);
  for (const hint of hints) console.error(`  ${hint}`);
  console.error('');
  process.exit(1);
}

/* ── Process helpers ────────────────────────────────────────────────────────────────────────── */

// shell:true so Windows resolves pnpm.cmd / corepack.cmd. Nothing here interpolates user input,
// so there is no injection surface to worry about.
const run = (command, args, opts = {}) =>
  spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', shell: true, ...opts });

const capture = (command, args) => {
  const r = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8', shell: true });
  return r.status === 0 ? (r.stdout ?? '').trim() : null;
};

function mustSucceed(label, command, args) {
  const r = run(command, args);
  if (r.status !== 0) {
    die(`${label} failed.`, `Command: ${command} ${args.join(' ')}`, 'The output above has the reason.');
  }
}

/* ── Steps ──────────────────────────────────────────────────────────────────────────────────── */

function checkNode() {
  step('Checking Node');
  const major = Number(process.versions.node.split('.')[0]);
  // Not advisory: .npmrc sets engine-strict, so pnpm itself refuses to install below this.
  if (Number.isNaN(major) || major < 24) {
    die(
      `Node 24 or newer is required — this is Node ${process.versions.node}.`,
      'Install it from https://nodejs.org (LTS), or with a version manager:',
      dim('  nvm install 24 && nvm use 24        (nvm / nvm-windows)'),
      dim('  fnm install 24 && fnm use 24        (fnm)'),
      'Then re-run this command.',
    );
  }
  ok(`Node ${process.versions.node}`);
}

function ensurePnpm() {
  step('Checking pnpm');

  const major = (v) => (v === null ? 0 : Number(v.split('.')[0]));

  let version = capture('pnpm', ['--version']);
  if (major(version) >= 11) {
    ok(`pnpm ${version}`);
    return;
  }

  // Corepack ships with Node and reads `packageManager` from package.json, so it installs the
  // exact pinned version rather than whatever is newest today.
  note(version === null ? 'pnpm not found — installing via corepack…' : `pnpm ${version} is too old — upgrading…`);
  run('corepack', ['enable']);
  run('corepack', ['prepare', PINNED_PNPM, '--activate']);

  version = capture('pnpm', ['--version']);
  if (major(version) >= 11) {
    ok(`pnpm ${version} (via corepack)`);
    return;
  }

  note('corepack could not provision pnpm — falling back to npm…');
  run('npm', ['install', '-g', 'pnpm@11']);

  version = capture('pnpm', ['--version']);
  if (major(version) >= 11) {
    ok(`pnpm ${version} (via npm)`);
    return;
  }

  die(
    'Could not install pnpm automatically.',
    'Install it yourself, then re-run this command:',
    dim('  npm install -g pnpm@11'),
  );
}

function ensureEnv() {
  step('Configuring environment');
  const env = join(ROOT, '.env');
  if (existsSync(env)) {
    ok('.env already present — left untouched');
    return;
  }
  copyFileSync(join(ROOT, '.env.example'), env);
  ok('.env created from .env.example');
  note('Dev defaults work as-is. No external accounts, keys or services needed.');
}

function installDependencies() {
  step('Installing dependencies');
  note('First run pulls the whole toolchain — a few minutes is normal.');
  mustSucceed('Install', 'pnpm', ['install']);
  ok('Workspace installed');
}

function buildLibraries() {
  step('Building workspace libraries');
  // core and menu resolve to ./dist, which is gitignored — a fresh clone has no build output at
  // all. `pnpm dev` starts every watcher concurrently, so without this the API can boot before
  // tsc has emitted core/dist and die on a missing module. The seed needs menu/dist and the
  // generated Prisma client for the same reason.
  mustSucceed('Library build', 'pnpm', [
    '--filter', '@juice-stop/core',
    '--filter', '@juice-stop/menu',
    '--filter', '@juice-stop/db',
    'build',
  ]);
  ok('core, menu and db built (Prisma client generated)');
}

function prepareDatabase() {
  step('Preparing the database');

  // SQLite is a single file. Whether it already exists is the only signal that matters, and it has
  // to be read *before* migrate creates it.
  const dbFile = join(ROOT, 'packages', 'db', 'prisma', 'dev.db');
  const isFirstRun = !existsSync(dbFile);

  mustSucceed('Migration', 'pnpm', ['--filter', '@juice-stop/db', 'migrate:deploy']);
  ok('Schema up to date');

  if (isFirstRun) {
    mustSucceed('Seed', 'pnpm', ['db:seed']);
    ok('Seeded — 197 items, 26 categories, settings, a demo customer');
  } else {
    ok('Existing database kept');
    // Seeding truncates every table, so doing it automatically would delete orders placed while
    // testing. Re-seeding stays an explicit choice.
    note('Skipped seeding. Run `pnpm db:seed` to reset the catalogue.');
  }
}

function startServers() {
  step('Starting both servers');
  console.log(`
  ${bold('Customer app')}   ${orange('http://localhost:3100')}
  ${bold('Kitchen board')}  ${orange('http://localhost:3100/kitchen')}
  ${bold('API')}            ${orange('http://localhost:3000/api/v1')}

  ${dim('Browsing works 24/7. Ordering is open 19:00–04:00 IST by design — outside those')}
  ${dim('hours the menu is fully browsable and the buttons explain why they are disabled.')}
  ${dim('To try the whole flow at any hour, widen STORE_OPEN_TIME / STORE_CLOSE_TIME in .env.')}

  ${dim('Ctrl-C stops both.')}
`);
  const r = run('pnpm', ['dev']);
  process.exit(r.status ?? 0);
}

/* ── Main ───────────────────────────────────────────────────────────────────────────────────── */

console.log(`\n${orange('Juice Stop')} ${dim('— setting up')}`);

checkNode();
ensurePnpm();
ensureEnv();
installDependencies();
buildLibraries();
prepareDatabase();

if (SETUP_ONLY) {
  console.log(`\n${green('✓')} ${bold('Ready.')} Start both servers with ${orange('pnpm dev')}\n`);
  process.exit(0);
}

startServers();
