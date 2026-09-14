import { readFile, readdir } from 'node:fs/promises';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
let directCount = 0;
for (const section of ['dependencies', 'devDependencies']) {
  for (const [name, version] of Object.entries(pkg[section])) {
    if (
      !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version) ||
      version !== lock.packages[''][section][name] ||
      version !== lock.packages[`node_modules/${name}`]?.version
    )
      throw new Error(`Dependency must use the exact locked version: ${name}`);
    directCount++;
  }
}
for (const [name, entry] of Object.entries(lock.packages)) {
  if (!name) continue;
  const url = new URL(entry.resolved);
  if (
    url.origin !== 'https://registry.npmjs.org' ||
    url.username ||
    url.password ||
    !entry.integrity
  )
    throw new Error(`Unapproved dependency source or missing integrity: ${name}`);
}

const workflow = await readFile('.github/workflows/pages.yml', 'utf8');
for (const [, action] of workflow.matchAll(/\buses:\s*(\S+)/g)) {
  if (!/^actions\/[\w-]+@[a-f0-9]{40}$/.test(action))
    throw new Error(`Action must use an approved owner and full commit SHA: ${action}`);
}
const ignores = (await readFile('.gitignore', 'utf8')).split(/\r?\n/);
if (!ignores.includes('/agents.md')) throw new Error('Local agents.md notes must stay ignored.');

// Vite copies public/ verbatim. Stop deployment if local notes, credentials,
// screenshots, source maps, or other unexpected files enter the published tree.
const allowed = [
  /^(?:index\.html|manifest\.webmanifest|sw\.js|CNAME|\.nojekyll)$/,
  /^assets\/(?:index|App|barcode\.worker|workbox-window\.prod\.es5)-[\w-]+\.(?:js|css)$/,
  /^assets\/costco-[\w-]+\.png$/,
  /^icons\/(?:pocket\.svg|icon-(?:192|512)\.png|maskable-512\.png)$/,
  /^logos\/(?:costco\.png|starbucks\.svg)$/,
  /^vendor\/zxing_full\.wasm$/,
  /^vendor\/tesseract\/(?:worker\.min\.js|eng\.traineddata\.gz)$/,
  /^vendor\/tesseract\/tesseract-core(?:-simd|-relaxedsimd)?-lstm\.wasm(?:\.js)?$/,
];
let fileCount = 0;
async function inspect(path = '') {
  for (const entry of await readdir(`dist/${path}`, { withFileTypes: true })) {
    const relative = path + entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Published symlink is not allowed: ${relative}`);
    if (entry.isDirectory()) await inspect(`${relative}/`);
    else {
      if (!entry.isFile() || !allowed.some((pattern) => pattern.test(relative)))
        throw new Error(`Unexpected published file: ${relative}`);
      fileCount++;
    }
  }
}
await inspect();
const html = await readFile('dist/index.html', 'utf8');
if (!html.includes('Content-Security-Policy') || !html.includes("form-action 'none'"))
  throw new Error('Production HTML must retain its content security policy.');
console.log(
  `Release checks passed: ${directCount} exact direct dependencies, immutable action references, and ${fileCount} approved static files.`,
);
