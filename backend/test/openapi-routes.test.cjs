const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const METHODS = ['get', 'post', 'patch', 'put', 'delete'];

function frontendOperations() {
  const source = fs.readFileSync(path.resolve(__dirname,
    '../../frontend/app/api/openapi.frontend.yaml'), 'utf8');
  const operations = new Set();
  let currentPath = null;
  for (const line of source.split(/\r?\n/)) {
    const route = line.match(/^  (\/[^:]+):\s*$/);
    if (route) {
      currentPath = route[1];
      continue;
    }
    const method = line.match(/^    (get|post|patch|put|delete):\s*$/);
    if (currentPath && method) operations.add(`${method[1].toUpperCase()} ${currentPath}`);
  }
  return operations;
}

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(target)
      : entry.name.endsWith('.controller.ts') ? [target] : [];
  });
}

function backendOperations() {
  const operations = new Set();
  const root = path.resolve(__dirname, '../src');
  for (const file of sourceFiles(root)) {
    const source = fs.readFileSync(file, 'utf8');
    const controller = source.match(/@Controller\((?:'([^']*)'|"([^"]*)")?\)/);
    assert.ok(controller, `Controller prefix not found in ${file}`);
    const prefix = controller[1] ?? controller[2] ?? '';
    const decorators = /@(Get|Post|Patch|Put|Delete)\((?:'([^']*)'|"([^"]*)")?\)/g;
    for (const match of source.matchAll(decorators)) {
      const method = match[1].toUpperCase();
      const suffix = match[2] ?? match[3] ?? '';
      const joined = `/${[prefix, suffix].filter(Boolean).join('/')}`
        .replace(/\/+/g, '/')
        .replace(/:([A-Za-z0-9_]+)/g, '{$1}');
      operations.add(`${method} ${joined}`);
    }
  }
  return operations;
}

test('NestJS routes cover every frontend OpenAPI operation exactly', () => {
  const frontend = frontendOperations();
  const backend = backendOperations();
  const missing = [...frontend].filter((operation) => !backend.has(operation)).sort();
  const internal = new Set(['GET /health', 'GET /health/ready']);
  const unexpected = [...backend]
    .filter((operation) => !frontend.has(operation) && !internal.has(operation)).sort();
  assert.deepEqual(missing, [], `Missing backend operations:\n${missing.join('\n')}`);
  assert.deepEqual(unexpected, [],
    `Backend operations absent from frontend OpenAPI:\n${unexpected.join('\n')}`);
});
