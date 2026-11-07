/**
 * Contamination-memory state.
 *
 * Local-first (works fully offline / in the desktop build) with best-effort
 * sync to the signed-in account. Analysis never depends on this hook.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppearanceFeatures } from "@/lib/blank-library";
import {
  EMPTY_MEMORY,
  blankImportFingerprint,
  buildKeepSuppressions,
  hasUsableFeatures,
  loadMemory,
  memoryUuid,
  saveMemory,
  suggestedStatus,
  summariseFamily,
  suppressionKey,
  type AnalysisBatch,
  type ContaminantFamily,
  type ContaminantObservation,
  type ContaminantScope,
  type ContaminantType,
  type MemoryState,
  type ParticleDecision,
  type ParticleDecisionRow,
  type ParticlePredictionRow,
  type SourceType,
} from "@/lib/contamination-memory";
import {
  CONTAMINANT_MATCHER_VERSION,
  CONTAMINANT_MATCH_METHOD,
} from "@/lib/contaminant-matching";
import {
  deleteRemoteFamily,
  deleteRemoteObservation,
  syncMemory,
} from "@/lib/contamination-sync";

export interface NewBatchInput {
  name: string;
  analysis_date?: string | null;
  tissue?: string | null;
  protocol?: string | null;
  solution?: string | null;
  microscope?: string | null;
  objective?: string | null;
  acquisition_profile?: string | null;
  um_per_px?: number | null;
  threshold?: number | null;
}

export interface ParticleRef {
  particleId: number | string;
  sourceImageId?: string | null;
  sourceImageName?: string | null;
  tissue?: string | null;
  protocol?: string | null;
  features?: AppearanceFeatures | undefined;
}

export interface MarkContaminantInput extends ParticleRef {
  /** existing family, or omit and pass `newFamily` */
  familyId?: string | undefined;
  newFamily?:
    | {
        name: string;
        contaminant_type: ContaminantType;
        scope: ContaminantScope;
        notes?: string | null;
      }
    | undefined;
  sourceType: SourceType;
  note?: string | null;
  /** what the matcher had proposed, for audit */
  proposedPrediction?: string | null;
  proposedConfidence?: number | null;
}

export function useContaminationMemory() {
  const [state, setState] = useState<MemoryState>(EMPTY_MEMORY);
  const [loaded, setLoaded] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const commit = useCallback((updater: (prev: MemoryState) => MemoryState) => {
    setState((prev) => {
      const next = updater(prev);
      const bumped = { ...next, version: prev.version + 1 };
      saveMemory(bumped);
      return bumped;
    });
  }, []);

  const sync = useCallback(async () => {
    setSyncing(true);
    const res = await syncMemory(stateRef.current);
    setUserId(res.userId);
    setSyncError(res.error);
    if (res.state) {
      saveMemory(res.state);
      setState(res.state);
    }
    setSyncing(false);
    return res;
  }, []);

  useEffect(() => {
    setState(loadMemory());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    void sync();
  }, [loaded, sync]);

  /* --------------------------------- batches -------------------------------- */

  const createBatch = useCallback(
    (input: NewBatchInput) => {
      const now = new Date().toISOString();
      const batch: AnalysisBatch = {
        id: memoryUuid(),
        name: input.name,
        analysis_date: input.analysis_date ?? now.slice(0, 10),
        tissue: input.tissue ?? null,
        protocol: input.protocol ?? null,
        solution: input.solution ?? null,
        microscope: input.microscope ?? null,
        objective: input.objective ?? null,
        acquisition_profile: input.acquisition_profile ?? null,
        um_per_px: input.um_per_px ?? null,
        threshold: input.threshold ?? null,
        status: "open",
        created_at: now,
        updated_at: now,
        synced: false,
      };
      commit((prev) => ({
        ...prev,
        batches: [batch, ...prev.batches],
        activeBatchId: batch.id,
      }));
      void sync();
      return batch;
    },
    [commit, sync],
  );

  const updateBatch = useCallback(
    (id: string, patch: Partial<AnalysisBatch>) => {
      commit((prev) => ({
        ...prev,
        batches: prev.batches.map((b) =>
          b.id === id
            ? { ...b, ...patch, updated_at: new Date().toISOString(), synced: false }
            : b,
        ),
      }));
      void sync();
    },
    [commit, sync],
  );

  const selectBatch = useCallback(
    (id: string | null) => commit((prev) => ({ ...prev, activeBatchId: id })),
    [commit],
  );

  const closeBatch = useCallback(
    (id: string) => updateBatch(id, { status: "closed" }),
    [updateBatch],
  );

  const reopenBatch = useCallback(
    (id: string) => updateBatch(id, { status: "open" }),
    [updateBatch],
  );

  /* -------------------------------- families ------------------------------- */

  const updateFamily = useCallback(
    (id: string, patch: Partial<ContaminantFamily>) => {
      commit((prev) => ({
        ...prev,
        families: prev.families.map((f) =>
          f.id === id
            ? { ...f, ...patch, updated_at: new Date().toISOString(), synced: false }
            : f,
        ),
      }));
      void sync();
    },
    [commit, sync],
  );

  const deleteFamily = useCallback(
    (id: string) => {
      commit((prev) => ({
        ...prev,
        families: prev.families.filter((f) => f.id !== id),
        observations: prev.observations.filter((o) => o.family_id !== id),
      }));
      void deleteRemoteFamily(id);
    },
    [commit],
  );

  const removeObservation = useCallback(
    (id: string) => {
      commit((prev) => ({
        ...prev,
        observations: prev.observations.filter((o) => o.id !== id),
      }));
      void deleteRemoteObservation(id);
    },
    [commit],
  );

  /** Moves every observation of `fromIds` into `intoId` and drops the sources. */
  const mergeFamilies = useCallback(
    (fromIds: string[], intoId: string) => {
      const drop = new Set(fromIds.filter((id) => id !== intoId));
      if (!drop.size) return;
      commit((prev) => ({
        ...prev,
        families: prev.families.filter((f) => !drop.has(f.id)),
        observations: prev.observations.map((o) =>
          drop.has(o.family_id) ? { ...o, family_id: intoId, synced: false } : o,
        ),
      }));
      for (const id of drop) void deleteRemoteFamily(id);
      void sync();
    },
    [commit, sync],
  );

  /* ------------------------- observations & decisions ----------------------- */

  /**
   * The ONLY path that creates confirmed contaminant truth. Refuses to store an
   * observation without a usable cached feature vector, so family evidence can
   * never be inflated by an empty `{}` example.
   */
  const markContaminant = useCallback(
    (input: MarkContaminantInput) => {
      if (!hasUsableFeatures(input.features)) return null;
      const now = new Date().toISOString();
      const activeBatchId = stateRef.current.activeBatchId;
      let familyId = input.familyId;
      let newFamily: ContaminantFamily | null = null;

      if (!familyId) {
        const spec = input.newFamily;
        if (!spec) return null;
        newFamily = {
          id: memoryUuid(),
          name: spec.name,
          contaminant_type: spec.contaminant_type,
          scope: spec.scope,
          batch_id: spec.scope === "batch" ? activeBatchId : null,
          tissue:
            spec.scope === "tissue_protocol" ? (input.tissue ?? null) : null,
          protocol:
            spec.scope === "tissue_protocol" || spec.scope === "protocol"
              ? (input.protocol ?? null)
              : null,
          status: "new",
          notes: spec.notes ?? null,
          created_at: now,
          updated_at: now,
          synced: false,
        };
        familyId = newFamily.id;
      }

      const family =
        newFamily ?? stateRef.current.families.find((f) => f.id === familyId) ?? null;

      const observation: ContaminantObservation = {
        id: memoryUuid(),
        family_id: familyId,
        batch_id: activeBatchId,
        source_type: input.sourceType,
        particle_id: String(input.particleId),
        source_image_id: input.sourceImageId ?? null,
        source_image_name: input.sourceImageName ?? null,
        tissue: input.tissue ?? null,
        protocol: input.protocol ?? null,
        particle_features: input.features as ContaminantObservation["particle_features"],
        manually_confirmed: true,
        notes: input.note ?? null,
        import_fingerprint: null,
        created_at: now,
        synced: false,
      };

      const decision: ParticleDecisionRow = {
        id: memoryUuid(),
        batch_id: activeBatchId,
        particle_id: String(input.particleId),
        source_image_id: input.sourceImageId ?? null,
        source_image_name: input.sourceImageName ?? null,
        contaminant_family_id: familyId,
        proposed_prediction: input.proposedPrediction ?? null,
        proposed_confidence: input.proposedConfidence ?? null,
        decision: "confirmed_contaminant",
        decision_source: "manual_mark_as_contaminant",
        particle_features: (input.features ??
          null) as ParticleDecisionRow["particle_features"],
        contaminant_family_id_snapshot: familyId,
        contaminant_family_name_snapshot: family?.name ?? null,
        contaminant_scope: family?.scope ?? null,
        match_method: input.proposedPrediction ? CONTAMINANT_MATCH_METHOD : null,
        matcher_version: input.proposedPrediction ? CONTAMINANT_MATCHER_VERSION : null,
        exclusion_reason: "manually_marked_contaminant",
        procedural_blank_support: null,
        created_at: now,
        synced: false,
      };

      commit((prev) => {
        const families = newFamily ? [newFamily, ...prev.families] : prev.families;
        const observations = [observation, ...prev.observations];
        const summary = summariseFamily(familyId!, observations);
        return {
          ...prev,
          families: families.map((f) =>
            f.id === familyId
              ? { ...f, status: suggestedStatus(summary), synced: false }
              : f,
          ),
          observations,
          decisions: [decision, ...prev.decisions],
        };
      });
      void sync();
      return familyId;
    },
    [commit, sync],
  );

  /**
   * Human truth for one particle. Never creates a positive observation — the
   * "keep" case is negative feedback and is what suppresses that family's
   * suggestion for that particle from then on.
   */
  const recordDecision = useCallback(
    (
      input: ParticleRef & {
        decision: ParticleDecision;
        contaminantFamilyId?: string | null;
        contaminantFamilyName?: string | null;
        contaminantScope?: string | null;
        proposedPrediction?: string | null;
        proposedConfidence?: number | null;
        decisionSource?: string;
        matchMethod?: string | null;
        matcherVersion?: string | null;
        exclusionReason?: string | null;
        proceduralBlankSupport?: number | null;
      },
    ) => {
      const row: ParticleDecisionRow = {
        id: memoryUuid(),
        batch_id: stateRef.current.activeBatchId,
        particle_id: String(input.particleId),
        source_image_id: input.sourceImageId ?? null,
        source_image_name: input.sourceImageName ?? null,
        contaminant_family_id: input.contaminantFamilyId ?? null,
        proposed_prediction: input.proposedPrediction ?? null,
        proposed_confidence: input.proposedConfidence ?? null,
        decision: input.decision,
        decision_source: input.decisionSource ?? "manual_review",
        particle_features: (input.features ??
          null) as ParticleDecisionRow["particle_features"],
        contaminant_family_id_snapshot: input.contaminantFamilyId ?? null,
        contaminant_family_name_snapshot: input.contaminantFamilyName ?? null,
        contaminant_scope: input.contaminantScope ?? null,
        match_method: input.matchMethod ?? null,
        matcher_version: input.matcherVersion ?? null,
        exclusion_reason: input.exclusionReason ?? null,
        procedural_blank_support: input.proceduralBlankSupport ?? null,
        created_at: new Date().toISOString(),
        synced: false,
      };
      commit((prev) => ({ ...prev, decisions: [row, ...prev.decisions] }));
      void sync();
    },
    [commit, sync],
  );


  /** Advisory matcher output — kept apart from confirmed decisions. */
  const recordPredictions = useCallback(
    (
      rows: (ParticleRef & {
        method: string;
        prediction: string;
        confidence?: number | null;
        contaminantFamilyId?: string | null;
        modelVersion?: string | null;
      })[],
    ) => {
      if (!rows.length) return;
      const now = new Date().toISOString();
      const batchId = stateRef.current.activeBatchId;
      const mapped: ParticlePredictionRow[] = rows.map((r) => ({
        id: memoryUuid(),
        batch_id: batchId,
        particle_id: String(r.particleId),
        source_image_id: r.sourceImageId ?? null,
        source_image_name: r.sourceImageName ?? null,
        method: r.method,
        prediction: r.prediction,
        confidence: r.confidence ?? null,
        contaminant_family_id: r.contaminantFamilyId ?? null,
        model_version: r.modelVersion ?? null,
        created_at: now,
        synced: false,
      }));
      commit((prev) => ({ ...prev, predictions: [...mapped, ...prev.predictions] }));
      void sync();
    },
    [commit, sync],
  );

  /** One-off import of confirmed procedural-blank candidates into a family. */
  const importBlankObservations = useCallback(
    (
      familyId: string,
      items: {
        key: string;
        particleId: number | string;
        sourceImageId?: string | null;
        sourceImageName?: string | null;
        features: AppearanceFeatures;
        note?: string | null;
      }[],
    ) => {
      const now = new Date().toISOString();
      commit((prev) => {
        const already = new Set(prev.importedBlankCandidates);
        // deterministic fingerprints already present remotely/locally are skipped
        const fingerprinted = new Set(
          prev.observations.map((o) => o.import_fingerprint).filter((v): v is string => !!v),
        );
        const fresh = items
          .filter((i) => hasUsableFeatures(i.features))
          .map((i) => ({
            item: i,
            fingerprint: blankImportFingerprint({
              sourceType: "procedural_blank",
              sourceImageId: i.sourceImageId ?? null,
              particleId: i.particleId,
              candidateKey: i.key,
            }),
          }))
          .filter(
            ({ item, fingerprint }) =>
              !already.has(item.key) && !fingerprinted.has(fingerprint),
          );
        if (!fresh.length) return prev;
        const observations: ContaminantObservation[] = fresh.map(({ item: i, fingerprint }) => ({
          id: memoryUuid(),
          family_id: familyId,
          batch_id: prev.activeBatchId,
          source_type: "procedural_blank",
          particle_id: String(i.particleId),
          source_image_id: i.sourceImageId ?? null,
          source_image_name: i.sourceImageName ?? null,
          tissue: null,
          protocol: null,
          particle_features: i.features as ContaminantObservation["particle_features"],
          manually_confirmed: true,
          notes: i.note ?? "Imported from procedural-blank library",
          import_fingerprint: fingerprint,
          created_at: now,
          synced: false,
        }));
        const merged = [...observations, ...prev.observations];
        const summary = summariseFamily(familyId, merged);
        return {
          ...prev,
          observations: merged,
          families: prev.families.map((f) =>
            f.id === familyId ? { ...f, status: suggestedStatus(summary), synced: false } : f,
          ),
          importedBlankCandidates: [
            ...prev.importedBlankCandidates,
            ...fresh.map(({ item }) => item.key),
          ],
        };
      });

      void sync();
    },
    [commit, sync],
  );

  const createFamily = useCallback(
    (spec: {
      name: string;
      contaminant_type: ContaminantType;
      scope: ContaminantScope;
      tissue?: string | null;
      protocol?: string | null;
      notes?: string | null;
    }) => {
      const now = new Date().toISOString();
      const family: ContaminantFamily = {
        id: memoryUuid(),
        name: spec.name,
        contaminant_type: spec.contaminant_type,
        scope: spec.scope,
        batch_id: spec.scope === "batch" ? stateRef.current.activeBatchId : null,
        tissue: spec.scope === "tissue_protocol" ? (spec.tissue ?? null) : null,
        protocol:
          spec.scope === "tissue_protocol" || spec.scope === "protocol"
            ? (spec.protocol ?? null)
            : null,
        status: "new",
        notes: spec.notes ?? null,
        created_at: now,
        updated_at: now,
        synced: false,
      };
      commit((prev) => ({ ...prev, families: [family, ...prev.families] }));
      void sync();
      return family;
    },
    [commit, sync],
  );

  const activeBatch = useMemo(
    () => state.batches.find((b) => b.id === state.activeBatchId) ?? null,
    [state.batches, state.activeBatchId],
  );
  const keepSuppressions = useMemo(() => buildKeepSuppressions(state.decisions), [state.decisions]);

  const suppressedFamilyIds = useCallback(
    (sourceImageId: string | null | undefined, particleId: number | string) =>
      keepSuppressions[suppressionKey(sourceImageId, particleId)],
    [keepSuppressions],
  );


  const pendingSync = useMemo(
    () =>
      state.batches.filter((r) => !r.synced).length +
      state.families.filter((r) => !r.synced).length +
      state.observations.filter((r) => !r.synced).length +
      state.decisions.filter((r) => !r.synced).length +
      state.predictions.filter((r) => !r.synced).length,
    [state],
  );

  return {
    importArchive: (families: ContaminantFamily[], observations: ContaminantObservation[]) => {
      commit(prev => ({ ...prev,
        families: [...prev.families, ...families.filter(f => !prev.families.some(p => p.id === f.id)).map(f => ({ ...f, synced: false }))],
        observations: [...prev.observations, ...observations.filter(o => !prev.observations.some(p => p.id === o.id)).map(o => ({ ...o, synced: false }))],
      }));
    },
    state,
    loaded,
    userId,
    syncing,
    syncError,
    pendingSync,
    batches: state.batches,
    families: state.families,
    observations: state.observations,
    decisions: state.decisions,
    /** family suggestions the reviewer overruled, keyed by image#particle */
    keepSuppressions,
    suppressedFamilyIds,
    activeBatch,
    createBatch,
    updateBatch,
    selectBatch,
    closeBatch,
    reopenBatch,
    createFamily,
    updateFamily,
    deleteFamily,
    mergeFamilies,
    removeObservation,
    markContaminant,
    recordDecision,
    recordPredictions,
    importBlankObservations,
    sync,
  };
}
