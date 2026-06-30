jest.mock('../../memory/crystal-health-logger', () => ({
  logLoad: jest.fn(),
  logEviction: jest.fn(),
  logUnload: jest.fn(),
}));

import {
  classifyLayer,
  metadataToWeightCrystal,
  type TitanWeightCrystal,
  type LayerCategory,
} from '../weight-crystal-adapter';
import { CrystalLibraryManager } from '../../memory/crystal-library-eviction';

describe('weight-crystal-adapter', () => {
  describe('classifyLayer', () => {
    const cases: [string, LayerCategory][] = [
      ['model.embed_tokens', 'embedding'],
      ['wte.weight', 'embedding'],
      ['lm_head.weight', 'output'],
      ['model.layers.0.self_attn.q_proj', 'attention'],
      ['model.layers.0.self_attn.k_proj', 'attention'],
      ['model.layers.0.self_attn.v_proj', 'attention'],
      ['model.layers.0.self_attn.o_proj', 'attention'],
      ['model.layers.0.mlp.gate_proj', 'mlp'],
      ['model.layers.0.mlp.up_proj', 'mlp'],
      ['model.layers.0.mlp.down_proj', 'mlp'],
      ['model.layers.0.input_layernorm', 'norm'],
      ['model.norm', 'norm'],
      ['some_random_layer', 'unknown'],
    ];

    it.each(cases)('%s → %s', (name, expected) => {
      expect(classifyLayer(name)).toBe(expected);
    });
  });

  describe('metadataToWeightCrystal', () => {
    it('produces correct crystal for attention layer', () => {
      const crystal = metadataToWeightCrystal(
        {
          layerName: 'model.layers.5.self_attn.q_proj',
          rows: 4096,
          cols: 4096,
          targetRank: 64,
          scaleB: 0.023,
          compressedAt: 1700000000000,
        },
        '/tmp/titan'
      );

      expect(crystal.id).toBe('model.layers.5.self_attn.q_proj');
      expect(crystal.significance).toBe(0.85);
      expect(crystal.isCornerstone).toBe(false);
      expect(crystal.moduleType).toBe('weight');
      expect(crystal.storagePath).toBe('/tmp/titan');
    });

    it('marks embedding layers as cornerstone', () => {
      const crystal = metadataToWeightCrystal(
        {
          layerName: 'model.embed_tokens',
          rows: 32000,
          cols: 4096,
          targetRank: 128,
          scaleB: 0.01,
          compressedAt: 1700000000000,
        },
        '/tmp/titan'
      );

      expect(crystal.isCornerstone).toBe(true);
      expect(crystal.significance).toBe(0.95);
    });

    it('marks output layers as cornerstone', () => {
      const crystal = metadataToWeightCrystal(
        {
          layerName: 'lm_head.weight',
          rows: 32000,
          cols: 4096,
          targetRank: 128,
          scaleB: 0.015,
          compressedAt: 1700000000000,
        },
        '/tmp/titan'
      );

      expect(crystal.isCornerstone).toBe(true);
    });
  });

  describe('CrystalLibraryManager integration', () => {
    it('manages weight crystals in hot/warm tiers', () => {
      const mgr = new CrystalLibraryManager<TitanWeightCrystal>(3);

      const embed: TitanWeightCrystal = {
        id: 'model.embed_tokens',
        significance: 0.95,
        isCornerstone: true,
        moduleType: 'weight',
        storagePath: '/tmp/t',
        rows: 32000,
        cols: 4096,
        targetRank: 128,
        scaleB: 0.01,
        compressedAt: Date.now(),
      };

      const attn: TitanWeightCrystal = {
        id: 'model.layers.0.self_attn.q_proj',
        significance: 0.85,
        isCornerstone: false,
        moduleType: 'weight',
        storagePath: '/tmp/t',
        rows: 4096,
        cols: 4096,
        targetRank: 64,
        scaleB: 0.02,
        compressedAt: Date.now(),
      };

      const mlp: TitanWeightCrystal = {
        id: 'model.layers.0.mlp.gate_proj',
        significance: 0.7,
        isCornerstone: false,
        moduleType: 'weight',
        storagePath: '/tmp/t',
        rows: 4096,
        cols: 11008,
        targetRank: 64,
        scaleB: 0.03,
        compressedAt: Date.now(),
      };

      const norm: TitanWeightCrystal = {
        id: 'model.layers.0.input_layernorm',
        significance: 0.5,
        isCornerstone: false,
        moduleType: 'weight',
        storagePath: '/tmp/t',
        rows: 1,
        cols: 4096,
        targetRank: 1,
        scaleB: 0.005,
        compressedAt: Date.now(),
      };

      mgr.loadToHot(embed);
      mgr.loadToHot(attn);
      mgr.loadToHot(mlp);

      expect(mgr.hotSize).toBe(3);

      // Loading a 4th should evict lowest significance (norm won't load, mlp stays)
      // Actually loading norm — it should evict mlp (lowest retention of non-cornerstones)
      const event = mgr.loadToHot(norm);
      expect(event).not.toBeNull();
      // Cornerstone embed is protected
      expect(mgr.isHot('model.embed_tokens')).toBe(true);
      // One of the non-cornerstones got evicted
      expect(event!.demotedToWarm).toBe(true);
    });

    it('cornerstone weight layers survive eviction pressure', () => {
      const mgr = new CrystalLibraryManager<TitanWeightCrystal>(2);
      const now = Date.now();

      const embed: TitanWeightCrystal = {
        id: 'embed',
        significance: 0.95,
        isCornerstone: true,
        moduleType: 'weight',
        storagePath: '/tmp/t',
        rows: 32000,
        cols: 4096,
        targetRank: 128,
        scaleB: 0.01,
        compressedAt: now,
      };

      const mlp: TitanWeightCrystal = {
        id: 'mlp.0',
        significance: 0.7,
        isCornerstone: false,
        moduleType: 'weight',
        storagePath: '/tmp/t',
        rows: 4096,
        cols: 11008,
        targetRank: 64,
        scaleB: 0.03,
        compressedAt: now,
      };

      mgr.loadToHot(embed, now - 1_000_000_000); // loaded very long ago
      mgr.loadToHot(mlp, now);

      // Hot full. New crystal should evict mlp, not the old cornerstone embed
      const newLayer: TitanWeightCrystal = {
        id: 'attn.0',
        significance: 0.85,
        isCornerstone: false,
        moduleType: 'weight',
        storagePath: '/tmp/t',
        rows: 4096,
        cols: 4096,
        targetRank: 64,
        scaleB: 0.02,
        compressedAt: now,
      };

      const event = mgr.loadToHot(newLayer, now);
      expect(event!.evictedId).toBe('mlp.0');
      expect(mgr.isHot('embed')).toBe(true);
    });
  });
});
