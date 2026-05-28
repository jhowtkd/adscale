import { ObjectStorage } from "./object-storage";

export async function deleteKeys(
  storage: ObjectStorage,
  keys: string[]
): Promise<{ succeeded: string[]; failed: { key: string; error: Error }[] }> {
  const results = await Promise.allSettled(
    keys.map(async (key) => {
      await storage.delete(key);
      return key;
    })
  );

  const succeeded: string[] = [];
  const failed: { key: string; error: Error }[] = [];

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      succeeded.push(result.value);
    } else {
      failed.push({ key: keys[index], error: result.reason as Error });
    }
  });

  return { succeeded, failed };
}
