import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Pool } from "pg";
import { sanitizeStorageFilename } from "../src/lib/upload-config";

export function requiredEnvironment(
  environment: NodeJS.ProcessEnv,
  name: string,
): string {
  const value = environment[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

export function parseImportArgs(args: string[]) {
  return { dryRun: args.includes("--dry-run") };
}

export function importedKeyFor(id: string, name: string): string {
  return `curated-inspirations/imported-${id}-${sanitizeStorageFilename(name)}`;
}

type SourceRow = {
  id: string;
  name: string;
  key: string;
  type: string;
  size: number;
  width: number | null;
  height: number | null;
};

function createR2Client(input: {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
}) {
  return new S3Client({
    region: "auto",
    endpoint: `https://${input.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: input.accessKeyId,
      secretAccessKey: input.secretAccessKey,
    },
  });
}

async function alreadyImported(
  pool: Pool,
  catalogSourceId: string,
): Promise<boolean> {
  const result = await pool.query<{ id: string }>(
    `SELECT id
     FROM adscale_app.workspace_assets
     WHERE source = 'curated_inspiration'
       AND metadata->>'catalogSource' = 'production'
       AND metadata->>'catalogSourceId' = $1
     LIMIT 1`,
    [catalogSourceId],
  );

  return result.rows.length > 0;
}

async function copyOne(input: {
  dryRun: boolean;
  sourcePool: Pool;
  targetPool: Pool;
  sourceClient: S3Client;
  targetClient: S3Client;
  sourceBucket: string;
  targetBucket: string;
  targetWorkspaceId: string;
  row: SourceRow;
}): Promise<"COPY" | "SKIP"> {
  if (await alreadyImported(input.targetPool, input.row.id)) {
    console.log(`SKIP ${input.row.id} already imported`);
    return "SKIP";
  }

  const targetKey = importedKeyFor(input.row.id, input.row.name);
  console.log(`COPY ${input.row.id} -> ${targetKey}`);

  if (input.dryRun) {
    return "COPY";
  }

  const sourceObject = await input.sourceClient.send(
    new GetObjectCommand({
      Bucket: input.sourceBucket,
      Key: input.row.key,
    }),
  );

  if (!sourceObject.Body) {
    throw new Error(`Empty source object for ${input.row.id}`);
  }

  const bytes = Buffer.from(await sourceObject.Body.transformToByteArray());

  await input.targetClient.send(
    new PutObjectCommand({
      Bucket: input.targetBucket,
      Key: targetKey,
      Body: bytes,
      ContentType: input.row.type,
      ContentDisposition: "attachment",
    }),
  );

  try {
    await input.targetPool.query(
      `INSERT INTO adscale_app.workspace_assets (
        workspace_id,
        name,
        key,
        type,
        size,
        width,
        height,
        source,
        metadata
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        'curated_inspiration',
        jsonb_build_object(
          'catalogSource', 'production',
          'catalogSourceId', $8
        )
      )`,
      [
        input.targetWorkspaceId,
        input.row.name,
        targetKey,
        input.row.type,
        input.row.size,
        input.row.width,
        input.row.height,
        input.row.id,
      ],
    );
  } catch (error) {
    await input.targetClient.send(
      new DeleteObjectCommand({
        Bucket: input.targetBucket,
        Key: targetKey,
      }),
    ).catch(() => undefined);

    throw error;
  }

  return "COPY";
}

export async function runImport(args: string[], environment: NodeJS.ProcessEnv = process.env) {
  const { dryRun } = parseImportArgs(args);

  const sourceDatabaseUrl = requiredEnvironment(environment, "SOURCE_DATABASE_URL");
  const targetDatabaseUrl = requiredEnvironment(environment, "DATABASE_URL");
  const sourceAccountId = requiredEnvironment(environment, "SOURCE_R2_ACCOUNT_ID");
  const sourceAccessKeyId = requiredEnvironment(environment, "SOURCE_R2_ACCESS_KEY_ID");
  const sourceSecretAccessKey = requiredEnvironment(environment, "SOURCE_R2_SECRET_ACCESS_KEY");
  const sourceBucket = requiredEnvironment(environment, "SOURCE_R2_BUCKET");
  const targetAccountId = requiredEnvironment(environment, "R2_ACCOUNT_ID");
  const targetAccessKeyId = requiredEnvironment(environment, "R2_ACCESS_KEY_ID");
  const targetSecretAccessKey = requiredEnvironment(environment, "R2_SECRET_ACCESS_KEY");
  const targetBucket = requiredEnvironment(environment, "R2_BUCKET");
  const targetWorkspaceId = requiredEnvironment(environment, "CURATED_TARGET_WORKSPACE_ID");

  const sourcePool = new Pool({ connectionString: sourceDatabaseUrl });
  const targetPool = new Pool({ connectionString: targetDatabaseUrl });
  const sourceClient = createR2Client({
    accountId: sourceAccountId,
    accessKeyId: sourceAccessKeyId,
    secretAccessKey: sourceSecretAccessKey,
  });
  const targetClient = createR2Client({
    accountId: targetAccountId,
    accessKeyId: targetAccessKeyId,
    secretAccessKey: targetSecretAccessKey,
  });

  let copy = 0;
  let skip = 0;

  try {
    if (!dryRun) {
      await targetPool.query(
        "SELECT pg_advisory_lock(hashtext('adscale:curated-inspiration-import'))",
      );
    }

    const sourceResult = await sourcePool.query<SourceRow>(
      `SELECT
        id,
        name,
        key,
        type,
        size,
        width,
        height
      FROM adscale_app.workspace_assets
      WHERE source = 'curated_inspiration'
      ORDER BY created_at ASC, id ASC`,
    );

    for (const row of sourceResult.rows) {
      const action = await copyOne({
        dryRun,
        sourcePool,
        targetPool,
        sourceClient,
        targetClient,
        sourceBucket,
        targetBucket,
        targetWorkspaceId,
        row,
      });

      if (action === "COPY") copy += 1;
      else skip += 1;
    }

    console.log(
      `Curated inspiration import: source=${sourceResult.rows.length} copy=${copy} skip=${skip} dryRun=${dryRun}`,
    );
  } finally {
    if (!dryRun) {
      await targetPool.query(
        "SELECT pg_advisory_unlock(hashtext('adscale:curated-inspiration-import'))",
      ).catch(() => undefined);
    }

    await Promise.all([
      sourcePool.end(),
      targetPool.end(),
      sourceClient.destroy(),
      targetClient.destroy(),
    ]);
  }
}

const isDirectRun = typeof process !== "undefined"
  && Array.isArray(process.argv)
  && process.argv[1]?.includes("import-curated-inspirations");

if (isDirectRun) {
  runImport(process.argv.slice(2)).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  });
}
