/**
 * Memory tools - Digital garden, growth tracking, crystallization, and reflexion
 * Enables Molly's long-term memory and learning systems
 */

import type { ToolHandler } from './types';

// Digital Garden imports
import {
  plantSeed,
  accessSeed,
  formConnection,
  applyDecay,
  prune,
  fertilize,
  crossPollinate,
  identifyClusters,
  harvest,
  cultivate,
  findByTag as findSeedsByTag,
  findByType,
  findRelated,
  search as searchSeeds,
  getAnchors,
  getGardenStatus,
  getGardenReport,
  saveGardenState,
  loadGardenState,
  type SeedType,
  type SeedSource,
  type ConnectionType,
} from '@/ai/agency/memory/digital-garden';

// Growth Tracker imports
import {
  recordNovelApplication,
  recordSelfImprovement,
  takeGrowthSnapshot,
  generateGrowthInsights,
  getGrowthStatus,
  getGrowthSnapshots,
  getGrowthEvents,
  getGrowthInsights,
  getGrowthReport,
  saveGrowthState,
  loadGrowthState,
} from '@/ai/agency/memory/growth-tracker';

// Memory Crystallizer imports
import {
  retrieveCrystal,
  findByParticipant,
  findByEmotion,
  findBySignificance,
  searchCrystals,
  getCornerstones,
  getRecent as getRecentCrystals,
  getCrystallizerStatus,
  getCrystallizerReport,
  saveCrystallizerState,
  loadCrystallizerState,
} from '@/ai/agency/memory/memory-crystallizer';

// Reflexion Loop imports
import {
  getApplicablePolicies,
  getReflexionStatus,
  getLearnings,
  getRecentAnalyses,
  saveReflexionState,
  loadReflexionState,
  resetReflexionState,
} from '@/ai/agency/memory/reflexion-loop';

// ════════════════════════════════════════════════════════════════════════════
// Digital Garden Tool — Knowledge Cultivation
// ════════════════════════════════════════════════════════════════════════════

export const digitalGarden: ToolHandler = async (params) => {
  const action = params.action as string;

  if (action === 'load') {
    try {
      await loadGardenState();
      return { success: true, output: 'Digital garden state loaded.' };
    } catch (err) {
      return {
        success: false,
        output: `Load failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'save') {
    try {
      await saveGardenState();
      return { success: true, output: 'Digital garden state saved.' };
    } catch (err) {
      return {
        success: false,
        output: `Save failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'status') {
    try {
      const status = getGardenStatus();
      return {
        success: true,
        output: `Garden: ${status.totalSeeds} seeds, ${status.totalConnections} connections, ${status.clusters} clusters`,
        data: status,
      };
    } catch (err) {
      return {
        success: false,
        output: `Status failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'plant') {
    const title = params.title as string;
    const content = params.content as string;
    const tags = (params.tags as string[]) || [];
    const source = (params.source as SeedSource) || 'self-reflection';
    const type = (params.type as SeedType) || 'experiential';
    const novelty = (params.novelty as number) || 0.5;
    const impact = (params.impact as number) || 0.5;

    if (!title || !content)
      return { success: false, output: 'Missing: title, content' };

    try {
      const seed = plantSeed(
        title,
        content,
        tags,
        source,
        type,
        novelty,
        impact
      );
      return { success: true, output: `Seed planted: "${title}"`, data: seed };
    } catch (err) {
      return {
        success: false,
        output: `Plant failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'access') {
    const seedId = params.seedId as string;
    if (!seedId) return { success: false, output: 'Missing: seedId' };
    const seed = accessSeed(seedId);
    if (!seed) return { success: false, output: 'Seed not found' };
    return {
      success: true,
      output: `Seed: "${seed.title}"\n${seed.content.slice(0, 100)}...\nInterconnectedness: ${seed.interconnectedness.toFixed(2)}, Accessed: ${seed.accessCount}x`,
      data: seed,
    };
  }

  if (action === 'connect') {
    const sourceId = params.sourceId as string;
    const targetId = params.targetId as string;
    const type = (params.type as ConnectionType) || 'related';
    const strength = (params.strength as number) || 0.5;

    if (!sourceId || !targetId)
      return { success: false, output: 'Missing: sourceId, targetId' };

    try {
      const connection = formConnection(sourceId, targetId, type, strength);
      if (!connection)
        return { success: false, output: 'Failed to form connection' };
      return {
        success: true,
        output: `Connection formed: ${sourceId} → ${targetId}`,
        data: connection,
      };
    } catch (err) {
      return {
        success: false,
        output: `Connect failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'findRelated') {
    const seedId = params.seedId as string;
    const depth = (params.depth as number) || 1;
    if (!seedId) return { success: false, output: 'Missing: seedId' };
    const related = findRelated(seedId, depth);
    const list = related
      .slice(0, 10)
      .map((s) => `• ${s.title}`)
      .join('\n');
    return {
      success: true,
      output: `Related seeds (${related.length}):\n${list || '(none)'}`,
      data: related.slice(0, 10),
    };
  }

  if (action === 'decay') {
    try {
      const decayed = applyDecay();
      return {
        success: true,
        output: `Decay applied: ${decayed} connections weakened`,
      };
    } catch (err) {
      return {
        success: false,
        output: `Decay failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'prune') {
    try {
      const result = prune();
      return {
        success: true,
        output: `Pruned: ${result.description}`,
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Prune failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'fertilize') {
    try {
      const result = fertilize();
      return {
        success: true,
        output: `Fertilized: ${result.description}`,
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Fertilize failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'crossPollinate') {
    try {
      const result = crossPollinate();
      return {
        success: true,
        output: `Cross-pollinated: ${result.description}`,
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Cross-pollinate failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'identifyClusters') {
    try {
      const clusters = identifyClusters();
      const list = clusters
        .slice(0, 10)
        .map((c) => `• ${c.theme}: ${c.seedIds.length} seeds`)
        .join('\n');
      return {
        success: true,
        output: `Clusters (${clusters.length}):\n${list || '(none)'}`,
        data: clusters.slice(0, 10),
      };
    } catch (err) {
      return {
        success: false,
        output: `Identify clusters failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'harvest') {
    try {
      const result = harvest();
      return {
        success: true,
        output: `Harvested: ${result.description}`,
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        output: `Harvest failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'cultivate') {
    try {
      const actions = cultivate();
      const list = actions
        .slice(0, 5)
        .map((a) => `• [${a.type}] ${a.description}`)
        .join('\n');
      return {
        success: true,
        output: `Cultivation (${actions.length}):\n${list || '(none)'}`,
        data: actions,
      };
    } catch (err) {
      return {
        success: false,
        output: `Cultivate failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'findByTag') {
    const tag = params.tag as string;
    if (!tag) return { success: false, output: 'Missing: tag' };
    const seeds = findSeedsByTag(tag);
    const list = seeds
      .slice(0, 15)
      .map((s) => `• ${s.title}`)
      .join('\n');
    return {
      success: true,
      output: `Seeds tagged "${tag}" (${seeds.length}):\n${list || '(none)'}`,
      data: seeds.slice(0, 15),
    };
  }

  if (action === 'findByType') {
    const type = params.type as SeedType;
    if (!type) return { success: false, output: 'Missing: type' };
    const seeds = findByType(type);
    const list = seeds
      .slice(0, 15)
      .map((s) => `• ${s.title}`)
      .join('\n');
    return {
      success: true,
      output: `Seeds of type "${type}" (${seeds.length}):\n${list || '(none)'}`,
      data: seeds.slice(0, 15),
    };
  }

  if (action === 'search') {
    const query = params.query as string;
    if (!query) return { success: false, output: 'Missing: query' };
    const seeds = searchSeeds(query);
    const list = seeds
      .slice(0, 15)
      .map((s) => `• ${s.title}`)
      .join('\n');
    return {
      success: true,
      output: `Search results (${seeds.length}):\n${list || '(none)'}`,
      data: seeds.slice(0, 15),
    };
  }

  if (action === 'getAnchors') {
    const anchors = getAnchors();
    const list = anchors
      .slice(0, 10)
      .map((s) => `• ${s.title} (${s.connections.length} connections)`)
      .join('\n');
    return {
      success: true,
      output: `Anchors (${anchors.length}):\n${list || '(none)'}`,
      data: anchors.slice(0, 10),
    };
  }

  if (action === 'report') {
    try {
      const report = getGardenReport();
      return { success: true, output: report };
    } catch (err) {
      return {
        success: false,
        output: `Report failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  return {
    success: false,
    output:
      'Unknown digitalGarden action. Use: load, save, status, plant, access, connect, findRelated, decay, prune, fertilize, crossPollinate, identifyClusters, harvest, cultivate, findByTag, findByType, search, getAnchors, report',
  };
};

// ════════════════════════════════════════════════════════════════════════════
// Growth Tracker Tool — Development Monitoring
// ════════════════════════════════════════════════════════════════════════════

export const growthTracker: ToolHandler = async (params) => {
  const action = params.action as string;

  if (action === 'load') {
    try {
      await loadGrowthState();
      return { success: true, output: 'Growth state loaded.' };
    } catch (err) {
      return {
        success: false,
        output: `Load failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'save') {
    try {
      await saveGrowthState();
      return { success: true, output: 'Growth state saved.' };
    } catch (err) {
      return {
        success: false,
        output: `Save failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'status') {
    try {
      const status = getGrowthStatus();
      const level = status.current?.level || 'unknown';
      const score = status.current?.score || 0;
      return {
        success: true,
        output: `Growth: Level ${level}, Score ${score.toFixed(2)}, Insights: ${status.recentInsights?.length || 0}`,
        data: status,
      };
    } catch (err) {
      return {
        success: false,
        output: `Status failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'recordNovel') {
    const description = params.description as string;
    if (!description) return { success: false, output: 'Missing: description' };
    recordNovelApplication(description);
    return {
      success: true,
      output: `Novel application recorded: "${description.slice(0, 50)}..."`,
    };
  }

  if (action === 'recordImprovement') {
    const description = params.description as string;
    if (!description) return { success: false, output: 'Missing: description' };
    recordSelfImprovement(description);
    return {
      success: true,
      output: `Self-improvement recorded: "${description.slice(0, 50)}..."`,
    };
  }

  if (action === 'snapshot') {
    try {
      const snapshot = takeGrowthSnapshot();
      return {
        success: true,
        output: `Snapshot: ${snapshot.isGenuineGrowth ? 'Genuine growth detected' : 'No growth detected'}`,
        data: snapshot,
      };
    } catch (err) {
      return {
        success: false,
        output: `Snapshot failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'generateInsights') {
    try {
      const insights = generateGrowthInsights();
      const list = insights
        .slice(0, 5)
        .map((i) => `• ${i.insight.slice(0, 50)}...`)
        .join('\n');
      return {
        success: true,
        output: `Insights (${insights.length}):\n${list || '(none)'}`,
        data: insights.slice(0, 5),
      };
    } catch (err) {
      return {
        success: false,
        output: `Generate insights failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'listSnapshots') {
    const limit = (params.limit as number) || 20;
    const snapshots = getGrowthSnapshots(limit);
    const list = snapshots
      .slice(0, 10)
      .map((s) => `• ${s.timestamp}: ${s.isGenuineGrowth ? '✓' : '○'}`)
      .join('\n');
    return {
      success: true,
      output: `Snapshots (${snapshots.length}):\n${list || '(none)'}`,
      data: snapshots.slice(0, 10),
    };
  }

  if (action === 'listEvents') {
    const limit = params.limit as number;
    const events = getGrowthEvents(limit);
    const list = events
      .slice(0, 15)
      .map((e) => `• [${e.type}] ${e.description.slice(0, 40)}...`)
      .join('\n');
    return {
      success: true,
      output: `Events (${events.length}):\n${list || '(none)'}`,
      data: events.slice(0, 15),
    };
  }

  if (action === 'listInsights') {
    const insights = getGrowthInsights();
    const list = insights
      .slice(0, 10)
      .map((i) => `• ${i.insight.slice(0, 50)}...`)
      .join('\n');
    return {
      success: true,
      output: `Insights (${insights.length}):\n${list || '(none)'}`,
      data: insights.slice(0, 10),
    };
  }

  if (action === 'report') {
    try {
      const report = getGrowthReport();
      return { success: true, output: report };
    } catch (err) {
      return {
        success: false,
        output: `Report failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  return {
    success: false,
    output:
      'Unknown growthTracker action. Use: load, save, status, recordNovel, recordImprovement, snapshot, generateInsights, listSnapshots, listEvents, listInsights, report',
  };
};

// ════════════════════════════════════════════════════════════════════════════
// Memory Crystallizer Tool — Moment Preservation
// ════════════════════════════════════════════════════════════════════════════

export const memoryCrystallizer: ToolHandler = async (params) => {
  const action = params.action as string;

  if (action === 'load') {
    try {
      await loadCrystallizerState();
      return { success: true, output: 'Crystallizer state loaded.' };
    } catch (err) {
      return {
        success: false,
        output: `Load failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'save') {
    try {
      await saveCrystallizerState();
      return { success: true, output: 'Crystallizer state saved.' };
    } catch (err) {
      return {
        success: false,
        output: `Save failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'status') {
    try {
      const status = getCrystallizerStatus();
      return {
        success: true,
        output: `Crystallizer: ${status.totalCrystals} crystals, ${status.cornerstones} cornerstones, ${status.pendingMoments} pending`,
        data: status,
      };
    } catch (err) {
      return {
        success: false,
        output: `Status failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'retrieve') {
    const crystalId = params.crystalId as string;
    if (!crystalId) return { success: false, output: 'Missing: crystalId' };
    const crystal = retrieveCrystal(crystalId);
    if (!crystal) return { success: false, output: 'Crystal not found' };
    return {
      success: true,
      output: `Crystal: "${crystal.title}"\nSignificance: ${crystal.totalSignificance.toFixed(2)}`,
      data: crystal,
    };
  }

  if (action === 'findByParticipant') {
    const participant = params.participant as string;
    if (!participant) return { success: false, output: 'Missing: participant' };
    const crystals = findByParticipant(participant);
    const list = crystals
      .slice(0, 10)
      .map((c) => `• ${c.title}`)
      .join('\n');
    return {
      success: true,
      output: `Crystals with ${participant} (${crystals.length}):\n${list || '(none)'}`,
      data: crystals.slice(0, 10),
    };
  }

  if (action === 'findByEmotion') {
    const emotion = params.emotion as string;
    if (!emotion) return { success: false, output: 'Missing: emotion' };
    const crystals = findByEmotion(emotion);
    const list = crystals
      .slice(0, 10)
      .map((c) => `• ${c.title}`)
      .join('\n');
    return {
      success: true,
      output: `Crystals with ${emotion} (${crystals.length}):\n${list || '(none)'}`,
      data: crystals.slice(0, 10),
    };
  }

  if (action === 'findBySignificance') {
    const minSignificance = (params.minSignificance as number) || 0.7;
    const crystals = findBySignificance(minSignificance);
    const list = crystals
      .slice(0, 10)
      .map((c) => `• [${c.totalSignificance.toFixed(2)}] ${c.title}`)
      .join('\n');
    return {
      success: true,
      output: `Significant crystals (${crystals.length}):\n${list || '(none)'}`,
      data: crystals.slice(0, 10),
    };
  }

  if (action === 'search') {
    const query = params.query as string;
    if (!query) return { success: false, output: 'Missing: query' };
    const crystals = searchCrystals(query);
    const list = crystals
      .slice(0, 10)
      .map((c) => `• ${c.title}`)
      .join('\n');
    return {
      success: true,
      output: `Search results (${crystals.length}):\n${list || '(none)'}`,
      data: crystals.slice(0, 10),
    };
  }

  if (action === 'getCornerstones') {
    const crystals = getCornerstones();
    const list = crystals
      .slice(0, 10)
      .map((c) => `• ${c.title}`)
      .join('\n');
    return {
      success: true,
      output: `Cornerstones (${crystals.length}):\n${list || '(none)'}`,
      data: crystals.slice(0, 10),
    };
  }

  if (action === 'recentCrystals') {
    const limit = (params.limit as number) || 10;
    const crystals = getRecentCrystals(limit);
    const list = crystals.map((c) => `• ${c.title}`).join('\n');
    return {
      success: true,
      output: `Recent crystals:\n${list || '(none)'}`,
      data: crystals,
    };
  }

  if (action === 'report') {
    try {
      const report = getCrystallizerReport();
      return { success: true, output: report };
    } catch (err) {
      return {
        success: false,
        output: `Report failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  return {
    success: false,
    output:
      'Unknown memoryCrystallizer action. Use: load, save, status, retrieve, findByParticipant, findByEmotion, findBySignificance, search, getCornerstones, recentCrystals, report',
  };
};

// ════════════════════════════════════════════════════════════════════════════
// Reflexion Loop Tool — Learning from Experience
// ════════════════════════════════════════════════════════════════════════════

export const reflexionLoop: ToolHandler = async (params) => {
  const action = params.action as string;

  if (action === 'load') {
    try {
      await loadReflexionState();
      return { success: true, output: 'Reflexion state loaded.' };
    } catch (err) {
      return {
        success: false,
        output: `Load failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'save') {
    try {
      await saveReflexionState();
      return { success: true, output: 'Reflexion state saved.' };
    } catch (err) {
      return {
        success: false,
        output: `Save failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'status') {
    try {
      const status = getReflexionStatus();
      return {
        success: true,
        output: `Reflexion: ${status.totalReflections} reflections, ${status.successRate.toFixed(0)}% success, ${status.activePolicies} policies`,
        data: status,
      };
    } catch (err) {
      return {
        success: false,
        output: `Status failed: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  }

  if (action === 'getApplicablePolicies') {
    const situationType = params.situationType as string;
    if (!situationType)
      return { success: false, output: 'Missing: situationType' };
    const policies = getApplicablePolicies(situationType);
    const list = policies
      .slice(0, 10)
      .map((p) => `• ${p.trigger.situationType}: ${p.adjustment.action}`)
      .join('\n');
    return {
      success: true,
      output: `Applicable policies (${policies.length}):\n${list || '(none)'}`,
      data: policies.slice(0, 10),
    };
  }

  if (action === 'getLearnings') {
    const situationType = params.situationType as string;
    const learnings = getLearnings(situationType);
    const list = learnings
      .slice(0, 10)
      .map((l) => `• ${l.lesson.slice(0, 50)}...`)
      .join('\n');
    return {
      success: true,
      output: `Learnings (${learnings.length}):\n${list || '(none)'}`,
      data: learnings.slice(0, 10),
    };
  }

  if (action === 'recentAnalyses') {
    const limit = (params.limit as number) || 10;
    const analyses = getRecentAnalyses(limit);
    const list = analyses
      .map(
        (a) =>
          `• Task ${a.taskId}: ${a.rootCause?.description?.slice(0, 30) || 'Analysis'}...`
      )
      .join('\n');
    return {
      success: true,
      output: `Recent analyses:\n${list || '(none)'}`,
      data: analyses,
    };
  }

  if (action === 'reset') {
    resetReflexionState();
    return { success: true, output: 'Reflexion state reset.' };
  }

  return {
    success: false,
    output:
      'Unknown reflexionLoop action. Use: load, save, status, getApplicablePolicies, getLearnings, recentAnalyses, reset',
  };
};

// ════════════════════════════════════════════════════════════════════════════
// Export all memory handlers
// ════════════════════════════════════════════════════════════════════════════

export const memoryToolHandlers: Record<string, ToolHandler> = {
  digitalGarden,
  growthTracker,
  memoryCrystallizer,
  reflexionLoop,
};
