import {readFileSync} from 'node:fs';
import {spaceOccupationMap} from '../../src/domain/occupation-map-spacing';
const batches = JSON.parse(readFileSync(0, 'utf8')) as {code: string; x: number; y: number}[][];
process.stdout.write(JSON.stringify(batches.map(nodes => {
  const spaced = spaceOccupationMap(nodes);
  return nodes.map(node => {const p = spaced.get(node.code)!; return [p.displayX, p.displayY];});
})));
