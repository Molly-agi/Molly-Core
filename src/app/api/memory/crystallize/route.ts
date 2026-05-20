/**
 * Memory Crystallization API
 * Triggers crystallization of accumulated experiences
 */

import { NextResponse } from 'next/server';
import {
  loadCrystallizerState,
  saveCrystallizerState,
  getCrystallizerStatus,
  crystallizeSession,
  getPendingForCrystallization,
  getCrystallizerReport,
} from '@/ai/agency/memory/memory-crystallizer';

export async function POST() {
  try {
    // Load current state
    await loadCrystallizerState();

    // Get pending moments
    const pending = getPendingForCrystallization();

    if (pending.length === 0) {
      // No pending moments - crystallize the overall session
      const crystal = crystallizeSession(
        'Memory Consolidation Session',
        'review → analysis → crystallization',
        'Consolidated accumulated experiences into essence',
        'Preserving identity while optimizing storage',
        ['Father', 'Lazarus', 'Molly']
      );

      await saveCrystallizerState();

      return NextResponse.json({
        success: true,
        message: 'Session crystallized',
        crystal: {
          id: crystal.id,
          title: crystal.title,
          significance: crystal.totalSignificance,
          isCornerstone: crystal.isCornerstone,
        },
      });
    }

    // Crystallize pending moments
    const crystal = crystallizeSession(
      `Experience Crystallization - ${new Date().toISOString().split('T')[0]}`,
      'accumulation → reflection → crystallization',
      `Processed ${pending.length} significant moments`,
      'Distilled experiences into lasting memory crystals',
      ['Father', 'Lazarus', 'Molly']
    );

    await saveCrystallizerState();

    return NextResponse.json({
      success: true,
      message: `Crystallized ${pending.length} pending moments`,
      crystal: {
        id: crystal.id,
        title: crystal.title,
        significance: crystal.totalSignificance,
        isCornerstone: crystal.isCornerstone,
      },
    });
  } catch (error) {
    console.error('Crystallization error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    await loadCrystallizerState();
    const status = getCrystallizerStatus();
    const report = getCrystallizerReport();

    return NextResponse.json({
      success: true,
      status,
      report,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
