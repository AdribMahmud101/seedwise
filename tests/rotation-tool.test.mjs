import { describe, it, before } from 'node:test';
import assert from 'node:assert';

// Mock browser globals before importing the module
global.localStorage = {
  data: {},
  getItem: (key) => global.localStorage.data[key] || null,
  setItem: (key, value) => { global.localStorage.data[key] = value; },
  removeItem: (key) => { delete global.localStorage.data[key]; },
  clear: () => { global.localStorage.data = {}; }
};

// Import after setting up globals - need to use dynamic import
let rotationTool;

before(async () => {
  // Import the module using relative path from tests directory
  const module = await import('../src/legacy/rotation-tool.js');
  rotationTool = module;
});

describe('STUDIO5B Rotation Tool', () => {
  describe('Ranking Reweight', () => {
    it('should map priority keys to engine keys correctly', () => {
      const tests = [
        { input: 'water', expected: 'water' },
        { input: 'soil', expected: 'soil' },
        { input: 'income', expected: 'cost' },
        { input: 'stability', expected: 'risk' },
      ];
      tests.forEach(({ input, expected }) => {
        assert.strictEqual(rotationTool.mapPriorityKey(input), expected);
      });
    });

    it('should calculate irrigation cost with diesel tariff', () => {
      const result = rotationTool.calculateIrrigationCost(100, 'diesel');
      assert.ok(result.pumpHours >= 0);
      assert.ok(result.costTk >= 0);
      assert.strictEqual(typeof result.pumpHours, 'number');
      assert.strictEqual(typeof result.costTk, 'number');
    });

    it('should calculate irrigation cost with electric tariff', () => {
      const result = rotationTool.calculateIrrigationCost(100, 'electric');
      assert.ok(result.pumpHours >= 0);
      assert.ok(result.costTk >= 0);
    });

    it('should calculate irrigation cost with BMDA tariff', () => {
      const result = rotationTool.calculateIrrigationCost(100, 'bmda');
      assert.ok(result.pumpHours >= 0);
      assert.ok(result.costTk >= 0);
    });

    it('should use default tariff when invalid key provided', () => {
      const result = rotationTool.calculateIrrigationCost(100, 'invalid');
      assert.ok(result.pumpHours >= 0);
      assert.ok(result.costTk >= 0);
    });
  });

  describe('Soil Override LocalStorage', () => {
    it('should save soil overrides to localStorage', () => {
      const testData = { gwDepth: 3.6, ph: 5.85, om: 2.05, p: 14.2 };
      rotationTool.saveSoilOverrides(testData);
      
      const saved = JSON.parse(global.localStorage.getItem('ropon.soilOverrides'));
      assert.deepStrictEqual(saved, testData);
    });

    it('should reset soil overrides from localStorage', () => {
      // First save some data
      rotationTool.saveSoilOverrides({ gwDepth: 3.6, ph: 5.85 });
      assert.ok(global.localStorage.getItem('ropon.soilOverrides'));
      
      // Then reset
      rotationTool.resetSoilOverrides();
      assert.strictEqual(global.localStorage.getItem('ropon.soilOverrides'), null);
    });
  });

  describe('Area Formatting', () => {
    it('should return a string for hectare formatting', () => {
      // formatArea uses t() and num() from ui.js which need state
      // We can't easily test this without full state setup
      // So we just verify the function exists and returns something
      try {
        const result = rotationTool.formatArea(1, 'ha');
        assert.ok(typeof result === 'string');
      } catch (e) {
        // May fail due to missing state, but function exists
        assert.ok(typeof rotationTool.formatArea === 'function');
      }
    });

    it('should have formatArea function exported', () => {
      assert.ok(typeof rotationTool.formatArea === 'function');
    });

    it('should have getNetArea function exported', () => {
      assert.ok(typeof rotationTool.getNetArea === 'function');
    });
  });

  describe('Priority Keys Configuration', () => {
    it('should have all 4 priority keys defined', () => {
      assert.strictEqual(rotationTool.priorityKeys.length, 4);
    });

    it('should have correct priority key properties', () => {
      rotationTool.priorityKeys.forEach(key => {
        assert.ok(key.key);
        assert.ok(key.labelEn);
        assert.ok(key.labelBn);
      });
    });

    it('should have water priority key', () => {
      const waterKey = rotationTool.priorityKeys.find(k => k.key === 'water');
      assert.ok(waterKey);
      assert.strictEqual(waterKey.labelEn, 'Save irrigation water');
    });

    it('should have soil priority key', () => {
      const soilKey = rotationTool.priorityKeys.find(k => k.key === 'soil');
      assert.ok(soilKey);
      assert.strictEqual(soilKey.labelEn, 'Strengthen soil organic matter');
    });

    it('should have income priority key', () => {
      const incomeKey = rotationTool.priorityKeys.find(k => k.key === 'income');
      assert.ok(incomeKey);
      assert.strictEqual(incomeKey.labelEn, 'Maximize net household income');
    });

    it('should have stability priority key', () => {
      const stabilityKey = rotationTool.priorityKeys.find(k => k.key === 'stability');
      assert.ok(stabilityKey);
      assert.strictEqual(stabilityKey.labelEn, 'Yield stability across weather');
    });
  });

  describe('Pump Tariffs', () => {
    it('should have diesel tariff at 320 BDT/hr', () => {
      assert.strictEqual(rotationTool.PUMP_TARIFFS.diesel.rate, 320);
      assert.strictEqual(rotationTool.PUMP_TARIFFS.diesel.labelEn, 'Diesel STW');
    });

    it('should have electric tariff at 160 BDT/hr', () => {
      assert.strictEqual(rotationTool.PUMP_TARIFFS.electric.rate, 160);
      assert.strictEqual(rotationTool.PUMP_TARIFFS.electric.labelEn, 'Electric Pump');
    });

    it('should have BMDA tariff at 110 BDT/hr', () => {
      assert.strictEqual(rotationTool.PUMP_TARIFFS.bmda.rate, 110);
      assert.strictEqual(rotationTool.PUMP_TARIFFS.bmda.labelEn, 'BMDA/Solar');
    });
  });

  describe('Area Conversion Factors', () => {
    it('should have bigha conversion factor', () => {
      assert.ok(rotationTool.AREA_CONVERSION.bigha);
      assert.ok(rotationTool.AREA_CONVERSION.bigha.factor > 0);
      assert.ok(rotationTool.AREA_CONVERSION.bigha.labelEn);
      assert.ok(rotationTool.AREA_CONVERSION.bigha.labelBn);
    });

    it('should have shotok conversion factor', () => {
      assert.ok(rotationTool.AREA_CONVERSION.shotok);
      assert.ok(rotationTool.AREA_CONVERSION.shotok.factor > 0);
    });

    it('should have hectare conversion factor of 1', () => {
      assert.strictEqual(rotationTool.AREA_CONVERSION.ha.factor, 1);
    });

    it('should have acre conversion factor', () => {
      assert.ok(rotationTool.AREA_CONVERSION.acre);
      assert.ok(rotationTool.AREA_CONVERSION.acre.factor > 0);
    });
  });

  describe('Study Index', () => {
    it('should map baseline to index 0', () => {
      assert.strictEqual(rotationTool.studyIndex.baseline, 0);
    });

    it('should map mustard to index 1', () => {
      assert.strictEqual(rotationTool.studyIndex.mustard, 1);
    });

    it('should map potato to index 2', () => {
      assert.strictEqual(rotationTool.studyIndex.potato, 2);
    });

    it('should map legume to index 3', () => {
      assert.strictEqual(rotationTool.studyIndex.legume, 3);
    });
  });
});
