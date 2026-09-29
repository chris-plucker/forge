import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'generate-sdk-map.ts');

test('generate-sdk-map: uses the generated namespace and a configured root client name', (t) => {
  const generated = mkdtempSync(join(tmpdir(), 'generate-sdk-map-'));
  t.after(() => rmSync(generated, { recursive: true, force: true }));
  mkdirSync(join(generated, 'api'));
  writeFileSync(join(generated, 'api/index.ts'), 'export interface GetThingRequest { id: string }\n');
  writeFileSync(
    join(generated, 'Client.ts'),
    `import * as Example from "./api/index.js";
declare function handleNonStatusCodeError(...args: unknown[]): never;
export class ExampleSdk {
  public getThing(request: Example.GetThingRequest): Promise<Example.Thing> {
    return this.__getThing(request);
  }
  private async __getThing(request: Example.GetThingRequest): Promise<Example.Thing> {
    return handleNonStatusCodeError(request, undefined, "GET", "/things/{id}");
  }
}
`,
  );
  writeFileSync(
    join(generated, 'index.ts'),
    'export { ExampleSdk } from "./Client.js";\nexport * as Example from "./api/index.js";\n',
  );
  const spec = join(generated, 'openapi.json');
  writeFileSync(spec, JSON.stringify({ paths: { '/things/{id}': { get: { operationId: 'getThing' } } } }));

  execFileSync(process.execPath, ['--import', 'tsx', SCRIPT], {
    env: {
      ...process.env,
      FORGE_SDK_GENERATED: generated,
      FORGE_SDK_FERN_SPEC: spec,
      FORGE_SDK_SOURCE_SPEC: spec,
      FORGE_SDK_ROOT_CLIENT: 'ExampleSdk',
    },
    stdio: 'pipe',
  });

  assert.deepEqual(JSON.parse(readFileSync(join(generated, 'sdk-map.json'), 'utf8')), {
    getThing: {
      accessor: [],
      method: 'getThing',
      httpMethod: 'GET',
      path: '/things/{id}',
      requestType: 'GetThingRequest',
      responseType: 'Thing',
      requiredRequestProperties: ['id'],
    },
  });
  const operationTypes = readFileSync(join(generated, 'sdk-operation-types.ts'), 'utf8');
  assert.match(operationTypes, /^import type \{ Example \} from '\.\/index\.js';/);
  assert.match(operationTypes, /"getThing": Example\.GetThingRequest;/);
});
