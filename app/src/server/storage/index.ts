import { isE2EControlledProviderEnabled } from "@/server/ai/providers/e2e-controlled-provider";
import { LocalDirectoryObjectStorage } from "./local-directory-object-storage";
import type { ObjectStorage } from "./object-storage";
import { R2ObjectStorage } from "./r2-object-storage";

/**
 * Localhost E2E shares bytes between the seed process and Next via a directory.
 * An in-memory Map cannot do that. Production and ordinary tests keep R2.
 */
export const objectStorage: ObjectStorage = isE2EControlledProviderEnabled()
  ? new LocalDirectoryObjectStorage()
  : new R2ObjectStorage();
