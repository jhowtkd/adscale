import Module from "node:module";

const originalLoad = Module._load as (
  request: string,
  parent: Module | null | undefined,
  isMain: boolean
) => unknown;

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "server-only") {
    return {};
  }
  return originalLoad.call(this, request, parent, isMain);
};
