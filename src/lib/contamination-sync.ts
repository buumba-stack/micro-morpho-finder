/**
 * Account-database sync for the contamination memory.
 *
 * Local storage is the source of truth while offline. When a signed-in session
 * exists, unsynced rows are pushed and the account copy is pulled back so the
 * memory follows the user across machines. Any failure is non-fatal: the app
 * keeps running on the local copy.
 */

import { getAuthClient } from "@/hooks/useAuth";
import type { AppearanceFeatures } from "@/lib/blank-library";
import {
  type AnalysisBatch,
  type ContaminantFamily,
  type ContaminantObservation,
  type ContaminantScope,
  type ContaminantType,
  type FamilyStatus,
  type MemoryState,
  type ParticleDecision,
  type ParticleDecisionRow,
  type ParticlePredictionRow,
  type SourceType,
} from "@/lib/contamination-memory";

type Features = AppearanceFeatures & Record<string, number>;

function asFeatures(value: unknown): Features {
  return (value && typeof value === "object" ? value : {}) as Features;
}

export interface SyncResult {
  userId: string | null;
  state: MemoryState | null;
  error: string | null;
}

/** Pushes unsynced rows, then replaces local rows with the account copy. */
export async function syncMemory(local: MemoryState): Promise<SyncResult> {
  const client = await getAuthClient();
  if (!client) return { userId: null, state: null, error: "offline" };

  let userId: string | null = null;
  try {
    const { data } = await client.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    return { userId: null, state: null, error: "offline" };
  }
  if (!userId) return { userId: null, state: null, error: null };

  try {
    // ---- push (order matters for the foreign keys) ----
    const batches = local.batches.filter((r) => !r.synced);
    if (batches.length) {
      const { error } = await client.from("analysis_batches").upsert(
        batches.map((b) => ({
          id: b.id,
          user_id: userId!,
          name: b.name,
          analysis_date: b.analysis_date,
          tissue: b.tissue,
          protocol: b.protocol,
          solution: b.solution,
          microscope: b.microscope,
          objective: b.objective,
          acquisition_profile: b.acquisition_profile,
          um_per_px: b.um_per_px,
          threshold: b.threshold,
          status: b.status,
          created_at: b.created_at,
        })),
      );
      if (error) throw error;
    }

    const families = local.families.filter((r) => !r.synced);
    if (families.length) {
      const { error } = await client.from("contaminant_families").upsert(
        families.map((f) => ({
          id: f.id,
          user_id: userId!,
          name: f.name,
          contaminant_type: f.contaminant_type,
          scope: f.scope,
          batch_id: f.batch_id,
          tissue: f.tissue,
          protocol: f.protocol,
          status: f.status,
          notes: f.notes,
          created_at: f.created_at,
        })),
      );
      if (error) throw error;
    }

    const observations = local.observations.filter((r) => !r.synced);
    if (observations.length) {
      const { error } = await client.from("contaminant_observations").upsert(
        observations.map((o) => ({
          id: o.id,
          user_id: userId!,
          family_id: o.family_id,
          batch_id: o.batch_id,
          source_type: o.source_type,
          particle_id: o.particle_id,
          source_image_id: o.source_image_id,
          source_image_name: o.source_image_name,
          tissue: o.tissue,
          protocol: o.protocol,
          particle_features: o.particle_features,
          manually_confirmed: o.manually_confirmed,
          notes: o.notes,
          created_at: o.created_at,
        })),
      );
      if (error) throw error;
    }

    const decisions = local.decisions.filter((r) => !r.synced);
    if (decisions.length) {
      const { error } = await client.from("particle_decisions").upsert(
        decisions.map((d) => ({
          id: d.id,
          user_id: userId!,
          batch_id: d.batch_id,
          particle_id: d.particle_id,
          source_image_id: d.source_image_id,
          source_image_name: d.source_image_name,
          contaminant_family_id: d.contaminant_family_id,
          proposed_prediction: d.proposed_prediction,
          proposed_confidence: d.proposed_confidence,
          decision: d.decision,
          decision_source: d.decision_source,
          particle_features: d.particle_features,
          created_at: d.created_at,
        })),
      );
      if (error) throw error;
    }

    const predictions = local.predictions.filter((r) => !r.synced);
    if (predictions.length) {
      const { error } = await client.from("particle_predictions").upsert(
        predictions.map((p) => ({
          id: p.id,
          user_id: userId!,
          batch_id: p.batch_id,
          particle_id: p.particle_id,
          source_image_id: p.source_image_id,
          source_image_name: p.source_image_name,
          method: p.method,
          prediction: p.prediction,
          confidence: p.confidence,
          contaminant_family_id: p.contaminant_family_id,
          model_version: p.model_version,
          created_at: p.created_at,
        })),
      );
      if (error) throw error;
    }

    // ---- pull ----
    const [b, f, o, d, p] = await Promise.all([
      client.from("analysis_batches").select("*").order("created_at", { ascending: false }),
      client.from("contaminant_families").select("*").order("created_at", { ascending: false }),
      client.from("contaminant_observations").select("*").order("created_at", { ascending: false }),
      client
        .from("particle_decisions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(2000),
      client
        .from("particle_predictions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(2000),
    ]);
    for (const res of [b, f, o, d, p]) if (res.error) throw res.error;

    const state: MemoryState = {
      version: local.version + 1,
      activeBatchId: local.activeBatchId,
      importedBlankCandidates: local.importedBlankCandidates,
      batches: (b.data ?? []).map(
        (r): AnalysisBatch => ({
          id: r.id,
          name: r.name,
          analysis_date: r.analysis_date,
          tissue: r.tissue,
          protocol: r.protocol,
          solution: r.solution,
          microscope: r.microscope,
          objective: r.objective,
          acquisition_profile: r.acquisition_profile,
          um_per_px: r.um_per_px,
          threshold: r.threshold,
          status: r.status,
          created_at: r.created_at,
          updated_at: r.updated_at,
          synced: true,
        }),
      ),
      families: (f.data ?? []).map(
        (r): ContaminantFamily => ({
          id: r.id,
          name: r.name,
          contaminant_type: r.contaminant_type as ContaminantType,
          scope: r.scope as ContaminantScope,
          batch_id: r.batch_id,
          tissue: r.tissue,
          protocol: r.protocol,
          status: r.status as FamilyStatus,
          notes: r.notes,
          created_at: r.created_at,
          updated_at: r.updated_at,
          synced: true,
        }),
      ),
      observations: (o.data ?? []).map(
        (r): ContaminantObservation => ({
          id: r.id,
          family_id: r.family_id,
          batch_id: r.batch_id,
          source_type: r.source_type as SourceType,
          particle_id: r.particle_id,
          source_image_id: r.source_image_id,
          source_image_name: r.source_image_name,
          tissue: r.tissue,
          protocol: r.protocol,
          particle_features: asFeatures(r.particle_features),
          manually_confirmed: r.manually_confirmed,
          notes: r.notes,
          created_at: r.created_at,
          synced: true,
        }),
      ),
      decisions: (d.data ?? []).map(
        (r): ParticleDecisionRow => ({
          id: r.id,
          batch_id: r.batch_id,
          particle_id: r.particle_id,
          source_image_id: r.source_image_id,
          source_image_name: r.source_image_name,
          contaminant_family_id: r.contaminant_family_id,
          proposed_prediction: r.proposed_prediction,
          proposed_confidence: r.proposed_confidence,
          decision: r.decision as ParticleDecision,
          decision_source: r.decision_source,
          particle_features: r.particle_features ? asFeatures(r.particle_features) : null,
          created_at: r.created_at,
          synced: true,
        }),
      ),
      predictions: (p.data ?? []).map(
        (r): ParticlePredictionRow => ({
          id: r.id,
          batch_id: r.batch_id,
          particle_id: r.particle_id,
          source_image_id: r.source_image_id,
          source_image_name: r.source_image_name,
          method: r.method,
          prediction: r.prediction,
          confidence: r.confidence,
          contaminant_family_id: r.contaminant_family_id,
          model_version: r.model_version,
          created_at: r.created_at,
          synced: true,
        }),
      ),
    };
    return { userId, state, error: null };
  } catch (err) {
    console.error("contamination memory sync failed", err);
    return { userId, state: null, error: "sync_failed" };
  }
}

export async function deleteRemoteFamily(id: string): Promise<void> {
  const client = await getAuthClient();
  if (!client) return;
  try {
    await client.from("contaminant_families").delete().eq("id", id);
  } catch (err) {
    console.error("family delete failed", err);
  }
}

export async function deleteRemoteObservation(id: string): Promise<void> {
  const client = await getAuthClient();
  if (!client) return;
  try {
    await client.from("contaminant_observations").delete().eq("id", id);
  } catch (err) {
    console.error("observation delete failed", err);
  }
}
