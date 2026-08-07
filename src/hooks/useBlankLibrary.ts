import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EMPTY_LIBRARY,
  loadLibrary,
  saveLibrary,
  type BlankAnnotation,
  type BlankLibraryState,
  type BlankMetadata,
  type BlankRecord,
} from "@/lib/blank-library";

/** Blank library state, persisted locally (never uploaded with the images). */
export function useBlankLibrary() {
  const [library, setLibrary] = useState<BlankLibraryState>(EMPTY_LIBRARY);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLibrary(loadLibrary());
    setLoaded(true);
  }, []);

  const commit = useCallback((next: BlankLibraryState) => {
    const bumped = { version: next.version + 1, records: next.records };
    setLibrary(bumped);
    saveLibrary(bumped);
  }, []);

  const addRecord = useCallback(
    (record: BlankRecord) => {
      setLibrary((prev) => {
        const next = {
          version: prev.version + 1,
          records: [...prev.records.filter((r) => r.fileHash !== record.fileHash), record],
        };
        saveLibrary(next);
        return next;
      });
    },
    [],
  );

  const removeRecord = useCallback((id: string) => {
    setLibrary((prev) => {
      const next = { version: prev.version + 1, records: prev.records.filter((r) => r.id !== id) };
      saveLibrary(next);
      return next;
    });
  }, []);

  const annotate = useCallback(
    (recordId: string, candidateId: string, annotation: BlankAnnotation) => {
      setLibrary((prev) => {
        const next = {
          version: prev.version + 1,
          records: prev.records.map((r) =>
            r.id !== recordId
              ? r
              : {
                  ...r,
                  candidates: r.candidates.map((c) =>
                    c.id === candidateId ? { ...c, annotation } : c,
                  ),
                },
          ),
        };
        saveLibrary(next);
        return next;
      });
    },
    [],
  );

  const annotateAll = useCallback((recordId: string, annotation: BlankAnnotation) => {
    setLibrary((prev) => {
      const next = {
        version: prev.version + 1,
        records: prev.records.map((r) =>
          r.id !== recordId
            ? r
            : { ...r, candidates: r.candidates.map((c) => ({ ...c, annotation })) },
        ),
      };
      saveLibrary(next);
      return next;
    });
  }, []);

  const updateMetadata = useCallback((recordId: string, patch: Partial<BlankMetadata>) => {
    setLibrary((prev) => {
      const next = {
        version: prev.version + 1,
        records: prev.records.map((r) =>
          r.id !== recordId ? r : { ...r, metadata: { ...r.metadata, ...patch } },
        ),
      };
      saveLibrary(next);
      return next;
    });
  }, []);

  const solutions = useMemo(
    () => Array.from(new Set(library.records.map((r) => r.metadata.solution).filter(Boolean))),
    [library.records],
  );
  const protocols = useMemo(
    () => Array.from(new Set(library.records.map((r) => r.metadata.protocol).filter(Boolean))),
    [library.records],
  );

  return {
    library,
    loaded,
    commit,
    addRecord,
    removeRecord,
    annotate,
    annotateAll,
    updateMetadata,
    solutions,
    protocols,
  };
}
