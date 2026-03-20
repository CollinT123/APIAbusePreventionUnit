import { getFirestore } from "firebase-admin/firestore";
import type { RawApiEvent } from "../types/rawApiEvent";
import { parseRawApiEvent } from "../validation/rawApiEventSchema";
import { isoTimestampFromMs } from "../utils/time";

export async function fetchFingerprintHistory(input: {
  fingerprint: string;
  windowStartMs: number;
  windowEndMs: number;
  limit: number;
}): Promise<RawApiEvent[]> {
  const db = getFirestore();

  // Firestore history lookup uses the raw event's ISO timestamp string.
  // ISO 8601 lex ordering matches chronological ordering, so `>=` range works.
  const windowStartIso = isoTimestampFromMs(input.windowStartMs);
  const snapshot = await db
    .collection("rawApiEvents")
    .where("fingerprint", "==", input.fingerprint)
    .where("timestamp", ">=", windowStartIso)
    .orderBy("timestamp", "desc")
    .limit(input.limit)
    .get();

  const endMs = input.windowEndMs;
  const events: RawApiEvent[] = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    const parsed = parseRawApiEvent(data);
    const t = new Date(parsed.timestamp).getTime();
    if (t <= endMs) events.push(parsed);
  });
  return events;
}

export async function fetchRouteHistory(input: {
  route: string;
  windowStartMs: number;
  windowEndMs: number;
  limit: number;
}): Promise<RawApiEvent[]> {
  const db = getFirestore();

  const windowStartIso = isoTimestampFromMs(input.windowStartMs);
  const snapshot = await db
    .collection("rawApiEvents")
    .where("route", "==", input.route)
    .where("timestamp", ">=", windowStartIso)
    .orderBy("timestamp", "desc")
    .limit(input.limit)
    .get();

  const endMs = input.windowEndMs;
  const events: RawApiEvent[] = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    const parsed = parseRawApiEvent(data);
    const t = new Date(parsed.timestamp).getTime();
    if (t <= endMs) events.push(parsed);
  });
  return events;
}

