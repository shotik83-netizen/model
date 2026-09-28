const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const code = fs.readFileSync('src/app.js', 'utf8');
const snapshot = code.match(/function configSnapshot\(\)\{[^\n]+\}/)?.[0];
const apply = code.match(/async function applyConfig\(o\)\{[^\n]+\}/)?.[0];
assert(snapshot && apply, 'Config API is present');

const config = JSON.parse(fs.readFileSync('config/config.json', 'utf8'));
assert.deepStrictEqual(config.contractors.map(c => c.id), ['c1', 'c2', 'c3', 'c_mugvjjiee42h']);
const state = {contractors: [], config: {}};
const context = {
  state,
  APP: config.application,
  validateConfig: x => x,
  clone: x => JSON.parse(JSON.stringify(x)),
  contractorFromUrl: async meta => meta.id === 'c3'
    ? Promise.reject(Error('File temporarily unavailable'))
    : {...meta, contracts: meta.id === 'c1' ? [{id: 'pilot'}] : []},
  normalize: () => {},
  sourceCache: {clear: () => {}},
  pendingContractors: {clear: () => {}},
};
vm.createContext(context);
vm.runInContext(snapshot + '\n' + apply + '\nthis.applyConfig=applyConfig;this.configSnapshot=configSnapshot;', context);

context.applyConfig(config).then(() => {
  assert.deepStrictEqual(Array.from(state.contractors, c => c.id), ['c1', 'c2', 'c3', 'c_mugvjjiee42h']);
  assert.match(state.contractors[2].loadError, /temporarily unavailable/);
  assert.deepStrictEqual(Array.from(context.configSnapshot().contractors, c => c.id), ['c1', 'c2', 'c3', 'c_mugvjjiee42h']);
  console.log('CONFIG ROUNDTRIP: OK');
}).catch(err => {console.error(err); process.exitCode = 1;});
