import type { AnalyzedApiEvent } from "../types/analyzedApiEvent";
import type { RawApiEvent } from "../types/rawApiEvent";
import { parseIsoTimestampToMs } from "../utils/time";

export class EventStore {
  private events: RawApiEvent[] = [];
  private eventsByFingerprint = new Map<string, RawApiEvent[]>();
  private eventsByRoute = new Map<string, RawApiEvent[]>();
  private analysisByRequestId = new Map<string, AnalyzedApiEvent>();

  add(event: RawApiEvent): void {
    this.events.push(event);

    const fingerprintEvents = this.eventsByFingerprint.get(event.fingerprint) ?? [];
    fingerprintEvents.push(event);
    this.eventsByFingerprint.set(event.fingerprint, fingerprintEvents);

    const routeEvents = this.eventsByRoute.get(event.route) ?? [];
    routeEvents.push(event);
    this.eventsByRoute.set(event.route, routeEvents);
  }

  queryByFingerprint(
    fingerprint: string,
    windowStartMs: number,
    windowEndMs: number,
    limit: number
  ): RawApiEvent[] {
    const events = this.eventsByFingerprint.get(fingerprint) ?? [];

    return events
      .filter((event) => {
        const timestampMs = parseIsoTimestampToMs(event.timestamp);
        return timestampMs >= windowStartMs && timestampMs <= windowEndMs;
      })
      .sort(
        (a, b) => parseIsoTimestampToMs(b.timestamp) - parseIsoTimestampToMs(a.timestamp)
      )
      .slice(0, limit);
  }

  queryByRoute(
    route: string,
    windowStartMs: number,
    windowEndMs: number,
    limit: number
  ): RawApiEvent[] {
    const events = this.eventsByRoute.get(route) ?? [];

    return events
      .filter((event) => {
        const timestampMs = parseIsoTimestampToMs(event.timestamp);
        return timestampMs >= windowStartMs && timestampMs <= windowEndMs;
      })
      .sort(
        (a, b) => parseIsoTimestampToMs(b.timestamp) - parseIsoTimestampToMs(a.timestamp)
      )
      .slice(0, limit);
  }

  getAll(): RawApiEvent[] {
    return this.events;
  }

  getAllAnalyzed(): Array<{ event: RawApiEvent; analysis: AnalyzedApiEvent }> {
    return this.events.flatMap((event) => {
      const analysis = this.analysisByRequestId.get(event.requestId);
      return analysis ? [{ event, analysis }] : [];
    });
  }

  setAnalysis(requestId: string, analysis: AnalyzedApiEvent): void {
    this.analysisByRequestId.set(requestId, analysis);
  }

  getAnalysis(requestId: string): AnalyzedApiEvent | null {
    return this.analysisByRequestId.get(requestId) ?? null;
  }

  getFlaggedEvents(): Array<{ event: RawApiEvent; analysis: AnalyzedApiEvent }> {
    return this.getAllAnalyzed()
      .filter(({ analysis }) => analysis.flagged)
      .sort(
        (a, b) =>
          parseIsoTimestampToMs(b.analysis.analyzedAt) -
          parseIsoTimestampToMs(a.analysis.analyzedAt)
      );
  }

  clear(): void {
    this.events = [];
    this.eventsByFingerprint.clear();
    this.eventsByRoute.clear();
    this.analysisByRequestId.clear();
  }

  prune(maxAgeMs: number): void {
    const cutoffMs = Date.now() - maxAgeMs;
    const retainedEvents = this.events.filter(
      (event) => parseIsoTimestampToMs(event.timestamp) >= cutoffMs
    );
    const retainedRequestIds = new Set(
      retainedEvents.map((event) => event.requestId)
    );

    this.events = retainedEvents;
    this.eventsByFingerprint.clear();
    this.eventsByRoute.clear();

    for (const event of retainedEvents) {
      const fingerprintEvents = this.eventsByFingerprint.get(event.fingerprint) ?? [];
      fingerprintEvents.push(event);
      this.eventsByFingerprint.set(event.fingerprint, fingerprintEvents);

      const routeEvents = this.eventsByRoute.get(event.route) ?? [];
      routeEvents.push(event);
      this.eventsByRoute.set(event.route, routeEvents);
    }

    for (const requestId of this.analysisByRequestId.keys()) {
      if (!retainedRequestIds.has(requestId)) {
        this.analysisByRequestId.delete(requestId);
      }
    }
  }
}

export const eventStore = new EventStore();
