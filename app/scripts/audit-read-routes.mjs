/**
 * Static inventory for #118. This classifies controls and cost signals; it
 * does not claim that an absent helper makes a route public or that a rate
 * limit is sufficient.
 * Usage: node scripts/audit-read-routes.mjs
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(process.cwd(), "src/app/api");
const methods = /export\s+(?:async\s+function|function|const)\s+(GET|POST|PATCH|PUT|DELETE|OPTIONS|HEAD)\b/g;

function handlerSource(source, method) {
  const start = source.search(new RegExp(`export\\s+(?:async\\s+)?(?:function\\s+${method}\\b|const\\s+${method}\\b)`));
  if (start < 0) return "";
  const nextExport = source.indexOf("\nexport ", start + 1);
  return source.slice(start, nextExport < 0 ? source.length : nextExport);
}

function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return filesIn(path);
    return entry.name === "route.ts" || entry.name === "route.tsx" ? [path] : [];
  });
}

function threatClass(route, controls) {
  if (/\/auth(?:\/|$)|\/health(?:\/|$)|\/dev(?:\/|$)/.test(route)) return "infra-or-auth";
  if (/\/admin(?:\/|$)/.test(route)) return "admin";
  if (/\/feedback(?:\/|$)/.test(route)) return "shared-feedback";
  if (controls.includes("workspace-access")) return "tenant-scoped";
  if (controls.includes("platform-owner")) return "platform-admin";
  if (controls.includes("session")) return "session-authenticated";
  if (controls.includes("share-token")) return "share-token";
  return "public-or-unverified";
}

function accessClass(controls) {
  if (controls.includes("workspace-access")) return "workspace-authenticated";
  if (controls.includes("platform-owner")) return "platform-owner";
  if (controls.includes("session")) return "session-authenticated";
  if (controls.includes("share-token")) return "share-token";
  return "no-static-auth-control";
}

function costClass(signals) {
  return signals.length > 0 ? signals.join("+") : "no-static-cost-signal";
}

function authControls(source, route) {
  const controls = [];
  if (/requireWorkspaceAccess\s*\(/.test(source)) controls.push("workspace-access");
  if (/requirePlatformOwner\s*\(/.test(source)) controls.push("platform-owner");
  if (/(?:getSessionFromHeaders|auth\.api\.getSession|getSessionUser)\s*\(/.test(source)) {
    controls.push("session");
  }
  if (/validateShareToken\s*\(/.test(source) || /\/share\//.test(route)) {
    controls.push("share-token");
  }
  if (/(?:checkRateLimit|rateLimit)\s*\(/.test(source)) controls.push("rate-limit");
  return controls;
}

function costSignals(source) {
  const signals = [];
  if (/\b(?:db|\b(?:get|list|count|find|create|update|delete)[A-Z]\w*)\s*\./.test(source)
    || /\b(?:get|list|count|find|create|update|delete)[A-Z]\w*\s*\(/.test(source)) {
    signals.push("database");
  }
  if (/\b(?:objectStorage|signedDownloadUrl|putStream|getStream)\b/.test(source)) {
    signals.push("object-storage");
  }
  if (/\b(?:fetch|inngest|unstable_cache)\s*\(/.test(source)) signals.push("external-or-cache");
  return signals;
}

const routes = filesIn(root).flatMap((file) => {
  const source = readFileSync(file, "utf8");
  const exportedMethods = [...source.matchAll(methods)].map((match) => match[1]);
  if (!exportedMethods.includes("GET")) return [];
  const route = `/${relative(root, file).replace(/\/route\.tsx?$/, "")}`;
  const getSource = handlerSource(source, "GET");
  const hasWorkspaceHelper = /requireWorkspaceAccess\s*\(/.test(getSource);
  const hasRateLimit = /(?:checkRateLimit|rateLimit)\s*\(/.test(getSource);
  const controls = authControls(getSource, route);
  const costs = costSignals(getSource);
  return [{
    route,
    hasWorkspaceHelper,
    hasRateLimit,
    threatClass: threatClass(route, controls),
    accessClass: accessClass(controls),
    authControls: controls,
    costSignals: costs,
    costClass: costClass(costs),
  }];
}).sort((a, b) => a.route.localeCompare(b.route));

const counts = routes.reduce((result, route) => {
  result.total += 1;
  if (route.hasWorkspaceHelper) result.workspaceScoped += 1;
  if (route.hasWorkspaceHelper && !route.hasRateLimit) result.workspaceScopedWithoutRateLimit += 1;
  if (route.accessClass === "no-static-auth-control") result.withoutStaticAuthControl += 1;
  if (route.authControls.includes("platform-owner")) result.platformOwnerControlled += 1;
  if (route.authControls.includes("session")) result.sessionControlled += 1;
  if (route.authControls.includes("share-token")) result.shareTokenControlled += 1;
  if (route.costSignals.includes("database")) result.databaseCostSignals += 1;
  if (route.costSignals.includes("object-storage")) result.objectStorageCostSignals += 1;
  return result;
}, {
  total: 0,
  workspaceScoped: 0,
  workspaceScopedWithoutRateLimit: 0,
  withoutStaticAuthControl: 0,
  platformOwnerControlled: 0,
  sessionControlled: 0,
  shareTokenControlled: 0,
  databaseCostSignals: 0,
  objectStorageCostSignals: 0,
});

console.log(JSON.stringify({ generatedAt: new Date().toISOString(), counts, routes }, null, 2));
