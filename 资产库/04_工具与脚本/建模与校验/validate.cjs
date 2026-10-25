// Khronos glTF Validator (read-only use of 模型/.tools/node_modules/gltf-validator, no network).
// Usage: node validate.cjs <glb>...  -> writes ../校验/gltf_validator.json
const fs = require('fs'); const path = require('path');
const validator = require(path.resolve(__dirname, '..', '..', '.tools/node_modules/gltf-validator'));
async function main() {
  const out = {};
  for (const f of process.argv.slice(2)) {
    const bytes = new Uint8Array(fs.readFileSync(f));
    const r = await validator.validateBytes(bytes, { uri: path.basename(f), maxIssues: 10000,
      externalResourceFunction: () => Promise.reject(new Error('no external resources')) });
    out[path.basename(f)] = { validatorVersion: validator.version(), errors: r.issues.numErrors, warnings: r.issues.numWarnings,
      infos: r.issues.numInfos, hints: r.issues.numHints, messages: r.issues.messages.slice(0, 100) };
  }
  fs.writeFileSync(path.join(__dirname, '..', '校验', 'gltf_validator.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { errors: v.errors, warnings: v.warnings, infos: v.infos, hints: v.hints }]))));
  if (Object.values(out).some(v => v.errors)) process.exitCode = 1;
}
main().catch(e => { console.error(e); process.exitCode = 1; });
