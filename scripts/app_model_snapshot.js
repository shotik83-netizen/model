// Run the same calculation core and cost definitions as the browser, without a DOM.
// Reads one normalized version on stdin and emits only numeric monthly outputs.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
const match = source.match(/const COST_DEFS=(\[[\s\S]*?\]);\s*const PERCENT_RATE_METHODS=/);
if (!match) throw new Error('COST_DEFS missing from app.js');
const costDefs = vm.runInNewContext(match[1]);
const core = require('../src/calculation-core.js');
const version = JSON.parse(fs.readFileSync(0, 'utf8'));
const result = core.calculateModel(version, costDefs);
process.stdout.write(JSON.stringify(result));
