import { describe, it } from 'node:test';
import assert from 'node:assert';

// Pure helper functions extracted from planner3d.js for testing

/**
 * Easing function: cubic in-out
 */
function easeInOutCubic(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  if (t < 0.5) return 4 * t * t * t;
  return 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Linear interpolation
 */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Clamp value between min and max
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Generate planting positions for a field
 * @param {number} fieldWidth - width of field in meters
 * @param {number} fieldDepth - depth of field in meters
 * @param {number} rowSpacing - spacing between rows in meters
 * @param {number} plantSpacing - spacing between plants in a row in meters
 * @param {number} bundWidth - width of bund/ridge in meters
 * @param {boolean} useRidges - whether to use ridges
 * @returns {Array<{x: number, y: number, z: number}>} array of plant positions
 */
function generatePlantPositions(fieldWidth, fieldDepth, rowSpacing, plantSpacing, bundWidth = 0.3, useRidges = false) {
  const positions = [];
  const usableWidth = fieldWidth - bundWidth;
  const usableDepth = fieldDepth - bundWidth;

  if (usableWidth <= 0 || usableDepth <= 0 || rowSpacing <= 0 || plantSpacing <= 0) {
    return positions;
  }

  // Calculate number of rows
  const numRows = Math.max(1, Math.floor(usableDepth / rowSpacing));
  const rowStart = -fieldDepth / 2 + bundWidth / 2 + rowSpacing / 2;

  for (let r = 0; r < numRows; r++) {
    const y = rowStart + r * rowSpacing;
    // For ridges, offset every other row
    const rowOffset = useRidges && r % 2 === 1 ? plantSpacing / 2 : 0;
    
    const numPlants = Math.max(1, Math.floor(usableWidth / plantSpacing));
    const plantStart = -fieldWidth / 2 + bundWidth / 2 + rowOffset;

    for (let p = 0; p < numPlants; p++) {
      const x = plantStart + p * plantSpacing;
      positions.push({ x, y, z: 0 });
    }
  }

  return positions;
}

/**
 * Cap plant positions to a maximum count
 * @param {Array} positions - array of plant positions
 * @param {number} maxCount - maximum number of instances
 * @returns {Array} capped positions with dataset note
 */
function capPlantPositions(positions, maxCount) {
  if (positions.length <= maxCount) {
    return { positions, note: null };
  }
  // Sample every nth plant to stay under the cap
  const step = Math.ceil(positions.length / maxCount);
  const capped = [];
  for (let i = 0; i < positions.length; i += step) {
    capped.push(positions[i]);
  }
  const note = `showing every ${step}th plant`;
  return { positions: capped, note };
}

/**
 * Compute stagger order for smooth crop transitions (row-wise)
 */
function computeStaggerOrder(positions, rows) {
  const order = [];
  const plantsPerRow = Math.ceil(positions.length / rows);
  
  for (let r = 0; r < rows; r++) {
    const start = r * plantsPerRow;
    const end = Math.min(start + plantsPerRow, positions.length);
    for (let i = start; i < end; i++) {
      order.push(i);
    }
  }
  return order;
}

/**
 * Calculate LOD level based on instance count
 */
function selectLOD(instanceCount) {
  if (instanceCount <= 200) return 'high';
  if (instanceCount <= 500) return 'medium';
  if (instanceCount <= 1000) return 'low';
  return 'minimal';
}

// Tests

describe('PLAN3D pure layout helpers', () => {
  it('generatePlantPositions returns empty array for invalid inputs', () => {
    assert.deepStrictEqual(generatePlantPositions(0, 10, 0.5, 0.5), []);
    assert.deepStrictEqual(generatePlantPositions(10, 0, 0.5, 0.5), []);
    assert.deepStrictEqual(generatePlantPositions(10, 10, 0, 0.5), []);
    assert.deepStrictEqual(generatePlantPositions(10, 10, 0.5, 0), []);
  });

  it('generatePlantPositions creates correct grid for simple field', () => {
    const positions = generatePlantPositions(10, 10, 5, 5);
    // 10x10 field with 5m spacing: usable area is 10 - 0.3 = 9.7m
    // numRows = floor(9.7 / 5) = 1, numPlants per row = floor(9.7 / 5) = 1
    // So we get 1 plant
    assert.strictEqual(positions.length, 1);
    // Check positions are centered
    assert.ok(positions[0].x < 0);
    assert.ok(positions[0].y < 0);
  });

  it('generatePlantPositions respects bund width', () => {
    const positionsNoBund = generatePlantPositions(10, 10, 5, 5, 0);
    const positionsWithBund = generatePlantPositions(10, 10, 5, 5, 0.3);
    // With bund, fewer plants should fit
    assert.ok(positionsWithBund.length <= positionsNoBund.length);
  });

  it('generatePlantPositions creates ridge offset pattern', () => {
    const positions = generatePlantPositions(20, 10, 5, 5, 0, true);
    // Check that odd rows have offset
    if (positions.length >= 4) {
      const row0Plant0 = positions[0];
      const row1Plant0 = positions[2]; // First plant of row 1
      // Row 1 should be offset from row 0
      assert.notStrictEqual(row0Plant0.x, row1Plant0.x);
    }
  });

  it('generatePlantPositions reduces row count when row spacing increases', () => {
    const positionsWide = generatePlantPositions(20, 20, 2, 2);
    const positionsNarrow = generatePlantPositions(20, 20, 4, 2);
    assert.ok(positionsNarrow.length < positionsWide.length);
  });

  it('generatePlantPositions reduces positions within rows when plant spacing increases', () => {
    const positionsDense = generatePlantPositions(20, 20, 5, 1);
    const positionsSparse = generatePlantPositions(20, 20, 5, 2);
    assert.ok(positionsSparse.length < positionsDense.length);
  });
});

describe('PLAN3D pure tween helpers', () => {
  it('easeInOutCubic returns 0 at t=0 and 1 at t=1', () => {
    assert.strictEqual(easeInOutCubic(0), 0);
    assert.strictEqual(easeInOutCubic(1), 1);
  });

  it('easeInOutCubic is symmetric', () => {
    const t = 0.3;
    const val1 = easeInOutCubic(t);
    const val2 = 1 - easeInOutCubic(1 - t);
    assert.ok(Math.abs(val1 - val2) < 1e-10, `easeInOutCubic(${t}) = ${val1}, expected ${val2}`);
  });

  it('easeInOutCubic values are in [0,1] for t in [0,1]', () => {
    for (let t = 0; t <= 1; t += 0.1) {
      const val = easeInOutCubic(t);
      assert.ok(val >= 0 && val <= 1, `easeInOutCubic(${t}) = ${val} out of range`);
    }
  });

  it('lerp interpolates correctly', () => {
    assert.strictEqual(lerp(0, 10, 0), 0);
    assert.strictEqual(lerp(0, 10, 1), 10);
    assert.strictEqual(lerp(0, 10, 0.5), 5);
    assert.strictEqual(lerp(-5, 5, 0.5), 0);
  });

  it('clamp restricts values to range', () => {
    assert.strictEqual(clamp(5, 0, 10), 5);
    assert.strictEqual(clamp(-5, 0, 10), 0);
    assert.strictEqual(clamp(15, 0, 10), 10);
  });

  it('computeStaggerOrder creates row-wise order', () => {
    const positions = [
      { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 },
      { x: 0, y: 2, z: 0 }, { x: 1, y: 2, z: 0 }
    ];
    const order = computeStaggerOrder(positions, 3);
    // First two should be row 0, next two row 1, last two row 2
    assert.strictEqual(order[0], 0);
    assert.strictEqual(order[1], 1);
    assert.strictEqual(order[2], 2);
    assert.strictEqual(order[3], 3);
    assert.strictEqual(order[4], 4);
    assert.strictEqual(order[5], 5);
  });
});

describe('PLAN3D pure cap helpers', () => {
  it('capPlantPositions returns all positions when under cap', () => {
    const positions = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
    const result = capPlantPositions(positions, 10);
    assert.strictEqual(result.positions.length, 2);
    assert.strictEqual(result.note, null);
  });

  it('capPlantPositions reduces positions when over cap', () => {
    const positions = Array.from({ length: 100 }, (_, i) => ({ x: i, y: 0 }));
    const result = capPlantPositions(positions, 10);
    assert.strictEqual(result.positions.length, 10);
    assert.ok(result.note?.includes('every') && result.note?.includes('th plant'));
  });

  it('capPlantPositions handles exact cap', () => {
    const positions = Array.from({ length: 50 }, (_, i) => ({ x: i, y: 0 }));
    const result = capPlantPositions(positions, 50);
    assert.strictEqual(result.positions.length, 50);
    assert.strictEqual(result.note, null);
  });

  it('capPlantPositions samples evenly', () => {
    const positions = Array.from({ length: 100 }, (_, i) => ({ x: i, y: 0 }));
    const result = capPlantPositions(positions, 10);
    // Should sample every 10th plant (0, 10, 20, ..., 90)
    for (let i = 0; i < result.positions.length; i++) {
      assert.strictEqual(result.positions[i].x, i * 10);
    }
  });

  it('capPlantPositions handles edge case with cap=1', () => {
    const positions = Array.from({ length: 100 }, (_, i) => ({ x: i, y: 0 }));
    const result = capPlantPositions(positions, 1);
    assert.strictEqual(result.positions.length, 1);
    assert.strictEqual(result.positions[0].x, 0);
  });

  it('capPlantPositions handles empty input', () => {
    const result = capPlantPositions([], 10);
    assert.strictEqual(result.positions.length, 0);
    assert.strictEqual(result.note, null);
  });
});

describe('PLAN3D LOD selection', () => {
  it('selectLOD returns high for <= 200 instances', () => {
    assert.strictEqual(selectLOD(200), 'high');
    assert.strictEqual(selectLOD(100), 'high');
    assert.strictEqual(selectLOD(1), 'high');
  });

  it('selectLOD returns medium for 201-500 instances', () => {
    assert.strictEqual(selectLOD(201), 'medium');
    assert.strictEqual(selectLOD(300), 'medium');
    assert.strictEqual(selectLOD(500), 'medium');
  });

  it('selectLOD returns low for 501-1000 instances', () => {
    assert.strictEqual(selectLOD(501), 'low');
    assert.strictEqual(selectLOD(700), 'low');
    assert.strictEqual(selectLOD(1000), 'low');
  });

  it('selectLOD returns minimal for > 1000 instances', () => {
    assert.strictEqual(selectLOD(1001), 'minimal');
    assert.strictEqual(selectLOD(5000), 'minimal');
  });
});
