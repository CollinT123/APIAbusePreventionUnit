import { v4 as uuidv4 } from "uuid";

import type { EventStore } from "../store/eventStore";
import { parseIsoTimestampToMs } from "../utils/time";

export interface FixConfig {
  id: string;
  ruleName: string;
  route: string;
  strategy: string;
  params: Record<string, unknown>;
  appliedAt: string;
  status: "active" | "disabled";
}

export interface FixStatus {
  fix: FixConfig;
  eventsBeforeFix: number;
  eventsSinceFix: number;
  issuesSinceFix: number;
  effective: boolean;
}

export class FixRegistry {
  private fixesById = new Map<string, FixConfig>();
  private fixIdByRoute = new Map<string, string>();

  private routeMatches(pattern: string, path: string): boolean {
    const patternParts = pattern.split("/").filter(Boolean);
    const pathParts = path.split("/").filter(Boolean);

    if (patternParts.length !== pathParts.length) {
      return false;
    }

    return patternParts.every((part, index) => {
      return part.startsWith(":") || part === pathParts[index];
    });
  }

  applyFix(
    ruleName: string,
    route: string,
    strategy: string,
    params: Record<string, unknown>
  ): FixConfig {
    const fix: FixConfig = {
      id: uuidv4(),
      ruleName,
      route,
      strategy,
      params,
      appliedAt: new Date().toISOString(),
      status: "active"
    };

    this.fixesById.set(fix.id, fix);
    this.fixIdByRoute.set(route, fix.id);

    return fix;
  }

  removeFix(fixId: string): boolean {
    const fix = this.fixesById.get(fixId);

    if (!fix) {
      return false;
    }

    this.fixesById.delete(fixId);
    this.fixIdByRoute.delete(fix.route);

    return true;
  }

  getFixForRoute(route: string): FixConfig | null {
    const fixId = this.fixIdByRoute.get(route);

    if (fixId) {
      const fix = this.fixesById.get(fixId);

      if (fix && fix.status === "active") {
        return fix;
      }
    }

    for (const fix of this.fixesById.values()) {
      if (fix.status === "active" && this.routeMatches(fix.route, route)) {
        return fix;
      }
    }

    return null;
  }

  getAllFixes(): FixConfig[] {
    return Array.from(this.fixesById.values());
  }

  getFixStatus(fixId: string, eventStore: EventStore): FixStatus | null {
    const fix = this.fixesById.get(fixId);

    if (!fix) {
      return null;
    }

    const appliedAtMs = parseIsoTimestampToMs(fix.appliedAt);
    const analyzedEvents = eventStore
      .getAllAnalyzed()
      .filter(({ event }) => event.route === fix.route);

    const eventsBeforeFix = analyzedEvents.filter(
      ({ event, analysis }) =>
        parseIsoTimestampToMs(event.timestamp) < appliedAtMs &&
        analysis.ruleHits.some((hit) => hit.ruleName === fix.ruleName)
    ).length;

    const eventsSinceFixEntries = analyzedEvents.filter(
      ({ event }) => parseIsoTimestampToMs(event.timestamp) >= appliedAtMs
    );

    const eventsSinceFix = eventsSinceFixEntries.length;
    const issuesSinceFix = eventsSinceFixEntries.filter(({ analysis }) =>
      analysis.ruleHits.some((hit) => hit.ruleName === fix.ruleName)
    ).length;

    return {
      fix,
      eventsBeforeFix,
      eventsSinceFix,
      issuesSinceFix,
      effective: issuesSinceFix === 0
    };
  }
}

export const fixRegistry = new FixRegistry();
