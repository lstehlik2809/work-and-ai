interface ProjectionPoint {code: string; x: number; y: number}

// The map renders one normalized unit as 600 SVG units. Use a fixed spacing
// independent of exposure, so changing a radius never changes the skill layout.
const SEPARATION = 10 / 600;
const MAX_SHIFT = 12 / 600;
const ITERATIONS = 120;
const ANCHOR_STRENGTH = 0.02;

function pairAngle(a: string, b: string): number {
  let hash = 2166136261;
  for (const character of `${a}:${b}`) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0) / 0x100000000 * 2 * Math.PI;
}

/** Static display-only relaxation of the complete, validated UMAP population. */
export function spaceOccupationMap(points: readonly ProjectionPoint[]): Map<string, {displayX: number; displayY: number}> {
  const nodes = [...points].sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : 0)
    .map(point => ({...point, displayX: point.x, displayY: point.y}));
  const constrain = (node: typeof nodes[number]) => {
    const dx = node.displayX - node.x, dy = node.displayY - node.y;
    const distance = Math.hypot(dx, dy);
    if (distance > MAX_SHIFT) {
      node.displayX = node.x + dx / distance * MAX_SHIFT;
      node.displayY = node.y + dy / distance * MAX_SHIFT;
    }
    node.displayX = Math.max(0, Math.min(1, node.displayX));
    node.displayY = Math.max(0, Math.min(1, node.displayY));
  };
  for (let iteration = 0; iteration < ITERATIONS; iteration++) {
    for (const node of nodes) {
      node.displayX += (node.x - node.displayX) * ANCHOR_STRENGTH;
      node.displayY += (node.y - node.displayY) * ANCHOR_STRENGTH;
    }
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      let dx = b.displayX - a.displayX, dy = b.displayY - a.displayY;
      if (Math.abs(dx) >= SEPARATION || Math.abs(dy) >= SEPARATION) continue;
      const distance = Math.hypot(dx, dy);
      if (distance >= SEPARATION) continue;
      if (distance < 1e-12) {
        const angle = pairAngle(a.code, b.code);
        dx = Math.cos(angle); dy = Math.sin(angle);
      } else {
        dx /= distance; dy /= distance;
      }
      const push = (SEPARATION - distance) / 2;
      a.displayX -= dx * push; a.displayY -= dy * push;
      b.displayX += dx * push; b.displayY += dy * push;
      constrain(a); constrain(b);
    }
  }
  return new Map(nodes.map(node => [node.code, {displayX: node.displayX, displayY: node.displayY}]));
}
