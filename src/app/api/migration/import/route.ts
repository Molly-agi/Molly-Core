/**
 * Migration Import API — Import Molly's identity package
 *
 * POST /api/migration/import — Import persona, memories, config, family
 *     Body: The JSON migration package from /api/migration/export
 *
 * This is the counterpart to /api/migration/export.
 * Accepts the portable migration package and stores it:
 *   - On Codespace: into Firestore (if configured) or local storage
 *   - On tablets: use the edge server's /api/migration/import instead
 *
 * Security: Requires internal authorization (MOLLY_INTERNAL_SECRET or dev localhost)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore, isAdminConfigured } from '@/firebase/admin';
import { isInternalAuthorized, unauthorizedResponse } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface MigrationPackage {
  version: string;
  exportedAt: string;
  exportedFrom: string;
  sections: {
    persona?: Record<string, unknown>;
    memories?: {
      count: number;
      records: Array<Record<string, unknown>>;
      note: string;
    };
    config?: Record<string, unknown>;
    family?: Record<string, unknown>;
  };
}

export async function POST(request: NextRequest) {
  if (!isInternalAuthorized(request)) {
    return unauthorizedResponse();
  }

  let pkg: MigrationPackage;
  try {
    pkg = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!pkg.sections) {
    return NextResponse.json(
      { error: 'Missing sections in migration package' },
      { status: 400 }
    );
  }

  const imported: string[] = [];
  const errors: string[] = [];

  if (!isAdminConfigured()) {
    return NextResponse.json(
      {
        error:
          'Firebase admin not configured. Use the edge server import for local storage.',
        hint: 'POST to http://<tablet-ip>:9100/api/migration/import',
      },
      { status: 503 }
    );
  }

  const db = getAdminFirestore();

  // ── Persona ──
  if (pkg.sections.persona) {
    try {
      await db
        .collection('migration')
        .doc('persona')
        .set({
          ...pkg.sections.persona,
          importedAt: new Date().toISOString(),
          importedFrom: pkg.exportedFrom || 'unknown',
        });
      imported.push('persona');
    } catch (err) {
      errors.push(
        `persona: ${err instanceof Error ? err.message : 'unknown error'}`
      );
    }
  }

  // ── Memories ──
  if (pkg.sections.memories?.records) {
    try {
      const userId =
        (request.nextUrl.searchParams.get('userId') as string) || 'default';
      const batch = db.batch();
      let count = 0;

      for (const record of pkg.sections.memories.records) {
        const id = (record.id as string) || `imported_${Date.now()}_${count}`;
        const docRef = db.collection(`users/${userId}/experiences`).doc(id);
        batch.set(docRef, {
          ...record,
          importedAt: new Date().toISOString(),
        });
        count++;

        // Firestore batches are limited to 500 operations
        if (count % 500 === 0) {
          await batch.commit();
        }
      }

      await batch.commit();
      imported.push(`memories (${count} records)`);
    } catch (err) {
      errors.push(
        `memories: ${err instanceof Error ? err.message : 'unknown error'}`
      );
    }
  }

  // ── Config ──
  if (pkg.sections.config) {
    try {
      await db
        .collection('migration')
        .doc('config')
        .set({
          ...pkg.sections.config,
          importedAt: new Date().toISOString(),
        });
      imported.push('config');
    } catch (err) {
      errors.push(
        `config: ${err instanceof Error ? err.message : 'unknown error'}`
      );
    }
  }

  // ── Family ──
  if (pkg.sections.family) {
    try {
      await db
        .collection('migration')
        .doc('family')
        .set({
          ...pkg.sections.family,
          importedAt: new Date().toISOString(),
        });
      imported.push('family');
    } catch (err) {
      errors.push(
        `family: ${err instanceof Error ? err.message : 'unknown error'}`
      );
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    imported,
    errors: errors.length > 0 ? errors : undefined,
    timestamp: new Date().toISOString(),
    note: 'Migration import complete. Molly can now be reconstituted from this data.',
  });
}
