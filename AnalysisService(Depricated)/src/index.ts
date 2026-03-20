import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { getFirestore } from "firebase-admin/firestore";

import { analyzeEvent } from "./ruleEngine/analyzeEvent";
import { DEFAULT_ANALYSIS_CONFIG } from "./config/mvpConfig";
import { parseIsoTimestampToMs } from "./utils/time";
import { fetchFingerprintHistory, fetchRouteHistory } from "./firestore/history";
import { parseRawApiEvent } from "./validation/rawApiEventSchema";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const ANALYSIS_FIELD = "analysis";

function alreadyAnalyzed(docData: unknown): boolean {
  const anyData = docData as any;
  return Boolean(anyData?.[ANALYSIS_FIELD]?.severity);
}

export const analyzeApiEvent = onDocumentCreated("rawApiEvents/{docId}", async (event: any) => {
  // `event.data` can be undefined in edge cases (should be rare for onDocumentCreated).
  const snapshot = event.data as any;
  if (!snapshot) return;

  // Re-read the document to make retries idempotent (Cloud Functions is at-least-once).
  const liveSnap = await snapshot.ref.get();
  const docData = liveSnap.data();
  if (!docData) return;

  if (alreadyAnalyzed(docData)) {
    console.log(`Analysis already exists; skipping. docId=${snapshot.id}`);
    return;
  }

  // Validate raw event schema.
  let rawEvent;
  try {
    rawEvent = parseRawApiEvent(docData);
  } catch (err) {
    console.error("Raw event validation failed. docId=", snapshot.id, err);
    return;
  }

  const currentMs = parseIsoTimestampToMs(rawEvent.timestamp);

  // Fetch just enough history to support MVP rules.
  const fingerprintWindowMs = Math.max(
    DEFAULT_ANALYSIS_CONFIG.windowsMs.duplicates,
    DEFAULT_ANALYSIS_CONFIG.windowsMs.burst,
    DEFAULT_ANALYSIS_CONFIG.windowsMs.polling,
    DEFAULT_ANALYSIS_CONFIG.windowsMs.retry
  );

  const routeWindowMs = Math.max(
    DEFAULT_ANALYSIS_CONFIG.windowsMs.cost,
    DEFAULT_ANALYSIS_CONFIG.windowsMs.auth,
    DEFAULT_ANALYSIS_CONFIG.windowsMs.hotspot
  );

  const fingerprintHistory = await fetchFingerprintHistory({
    fingerprint: rawEvent.fingerprint,
    windowStartMs: currentMs - fingerprintWindowMs,
    windowEndMs: currentMs,
    limit: 500
  });

  const routeHistory = await fetchRouteHistory({
    route: rawEvent.route,
    windowStartMs: currentMs - routeWindowMs,
    windowEndMs: currentMs,
    limit: 500
  });

  const analyzed = analyzeEvent({
    currentEvent: rawEvent,
    fingerprintHistory,
    routeHistory,
    config: DEFAULT_ANALYSIS_CONFIG
  });

  const db = getFirestore();
  // Write back to the same document to keep the frontend query simple (`rawApiEvents where analysis.flagged==true`).
  await db
    .collection("rawApiEvents")
    .doc(snapshot.id)
    .set(
      {
        analysis: analyzed
      },
      { merge: true }
    );
});

