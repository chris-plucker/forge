import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const MERGE_SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'merge-fern-typescript-shards.mjs');

function writeShard(root: string, files: Record<string, string>): string {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

function merge(shards: Array<Record<string, string>>): string {
  const work = mkdtempSync(join(tmpdir(), 'merge-fern-shards-'));
  const out = join(work, 'out');
  const shardDirs = shards.map((files, index) => writeShard(join(work, `shard-${index}`), files));
  execFileSync(process.execPath, [MERGE_SCRIPT, out, ...shardDirs], { stdio: 'pipe' });
  return out;
}

test('merge: rebuilds the resource barrel from every shard in resource order', (t) => {
  const out = merge([
    {
      'index.ts': 'export * from "./Client";\n',
      'api/index.ts': 'export * from "./resources";\n',
      'api/resources/index.ts': 'export * as zones from "./zones";\n',
      'api/resources/zones/index.ts': 'export {};\n',
      'core/index.ts': 'export * from "./exports";\n',
      'core/exports.ts': 'export {};\n',
    },
    {
      'index.ts': 'export * from "./Client";\n',
      'api/index.ts': 'export * from "./resources";\n',
      'api/resources/index.ts': 'export * as accounts from "./accounts";\n',
      'api/resources/accounts/index.ts': 'export {};\n',
    },
  ]);
  t.after(() => rmSync(dirname(out), { recursive: true, force: true }));

  assert.equal(
    readFileSync(join(out, 'api/resources/index.ts'), 'utf8'),
    'export * as accounts from "./accounts/index.js";\nexport * as zones from "./zones/index.js";\n',
  );
});

test('merge: specs without tags produce no resources directory', (t) => {
  const out = merge([
    {
      'index.ts': 'export * from "./Client";\n',
      'Client.ts': 'export class ExampleClient {}\n',
      'api/index.ts': 'export * from "./types";\n',
      'api/types/index.ts': 'export {};\n',
    },
    {
      'index.ts': 'export * from "./errors";\n',
      'errors/index.ts': 'export {};\n',
      'api/index.ts': 'export * from "./client";\n',
      'api/client/index.ts': 'export {};\n',
    },
  ]);
  t.after(() => rmSync(dirname(out), { recursive: true, force: true }));

  assert.equal(existsSync(join(out, 'api/resources')), false);
  assert.equal(
    readFileSync(join(out, 'api/index.ts'), 'utf8'),
    'export * from "./types/index.js";\nexport * from "./client/index.js";\n',
  );
  assert.equal(existsSync(join(out, 'core')), false);
});
