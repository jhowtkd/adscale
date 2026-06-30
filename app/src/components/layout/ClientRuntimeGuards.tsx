"use client";

import ChunkLoadRecovery from "./ChunkLoadRecovery";
import DeploymentVersionGuard from "./DeploymentVersionGuard";

export default function ClientRuntimeGuards() {
  return (
    <>
      <ChunkLoadRecovery />
      <DeploymentVersionGuard />
    </>
  );
}
