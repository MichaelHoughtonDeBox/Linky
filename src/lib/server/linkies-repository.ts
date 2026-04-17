import "server-only";

import type { PoolClient } from "pg";

import type {
  LinkyMetadata,
  LinkyOwner,
  LinkyRecord,
  LinkySource,
  LinkyVersionRecord,
  PatchLinkyPayload,
  UrlMetadata,
} from "@/lib/linky/types";

import { getPgPool } from "./postgres";

// ---------------------------------------------------------------------------
// Database row shape. Matches `db/schema.sql` after migration 002.
// ---------------------------------------------------------------------------

type DbLinkyRow = {
  id: number;
  slug: string;
  urls: unknown;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  custom_alias: boolean;
  source: string | null;
  metadata: unknown;
  owner_user_id: string | null;
  owner_org_id: string | null;
  title: string | null;
  description: string | null;
  url_metadata: unknown;
  creator_fingerprint: string | null;
};

type DbLinkyVersionRow = {
  version_number: number;
  urls: unknown;
  url_metadata: unknown;
  title: string | null;
  description: string | null;
  edited_by_clerk_user_id: string | null;
  edited_at: Date | string;
};

// ---------------------------------------------------------------------------
// Inputs.
// ---------------------------------------------------------------------------

export type InsertLinkyRecordInput = {
  slug: string;
  urls: string[];
  urlMetadata: UrlMetadata[];
  source: LinkySource;
  metadata?: LinkyMetadata;
  title?: string | null;
  description?: string | null;
  // NULL for anonymous linkies.
  ownerUserId?: string | null;
  ownerOrgId?: string | null;
  // Hashed IP+UA captured at create time; used later for claim-flow
  // reattribution of anonymous linkies.
  creatorFingerprint?: string | null;
};

export type ListLinkiesForSubjectInput =
  | { type: "user"; userId: string; limit: number; offset: number }
  | { type: "org"; orgId: string; limit: number; offset: number };

// ---------------------------------------------------------------------------
// Normalization helpers.
// ---------------------------------------------------------------------------

function normalizeDbSource(rawSource: string | null): LinkySource {
  switch (rawSource) {
    case "web":
    case "cli":
    case "sdk":
    case "agent":
    case "unknown":
      return rawSource;
    default:
      return "unknown";
  }
}

function normalizeDbMetadata(rawMetadata: unknown): LinkyMetadata | null {
  if (
    typeof rawMetadata === "object" &&
    rawMetadata !== null &&
    !Array.isArray(rawMetadata)
  ) {
    return rawMetadata as LinkyMetadata;
  }
  return null;
}

function normalizeDbUrls(rawUrls: unknown): string[] {
  if (!Array.isArray(rawUrls)) return [];
  return rawUrls.filter((url): url is string => typeof url === "string");
}

function normalizeDbUrlMetadata(rawMetadata: unknown): UrlMetadata[] {
  if (!Array.isArray(rawMetadata)) return [];
  return rawMetadata.map((entry): UrlMetadata => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return {};
    }
    return entry as UrlMetadata;
  });
}

function ensureMetadataAlignment(
  urls: string[],
  urlMetadata: UrlMetadata[],
): UrlMetadata[] {
  // Pad with empty objects so db/layer invariants hold: url_metadata.length
  // === urls.length at all times. Older rows written before url_metadata
  // existed will have an empty array; normalize on read.
  if (urlMetadata.length === urls.length) return urlMetadata;
  if (urlMetadata.length > urls.length) {
    return urlMetadata.slice(0, urls.length);
  }
  return [
    ...urlMetadata,
    ...Array.from({ length: urls.length - urlMetadata.length }, () => ({})),
  ];
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toIsoOrNull(value: Date | string | null): string | null {
  return value ? toIso(value) : null;
}

function resolveOwner(row: DbLinkyRow): LinkyOwner {
  if (row.owner_org_id) return { type: "org", orgId: row.owner_org_id };
  if (row.owner_user_id) return { type: "user", userId: row.owner_user_id };
  return { type: "anonymous" };
}

function mapDbRow(row: DbLinkyRow): LinkyRecord {
  const urls = normalizeDbUrls(row.urls);
  const rawMetadata = normalizeDbUrlMetadata(row.url_metadata);
  const urlMetadata = ensureMetadataAlignment(urls, rawMetadata);

  return {
    id: row.id,
    slug: row.slug,
    urls,
    urlMetadata,
    title: row.title,
    description: row.description,
    owner: resolveOwner(row),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    deletedAt: toIsoOrNull(row.deleted_at),
    source: normalizeDbSource(row.source),
    metadata: normalizeDbMetadata(row.metadata),
  };
}

function mapDbVersionRow(row: DbLinkyVersionRow): LinkyVersionRecord {
  const urls = normalizeDbUrls(row.urls);
  const metadata = normalizeDbUrlMetadata(row.url_metadata);
  return {
    versionNumber: row.version_number,
    urls,
    urlMetadata: ensureMetadataAlignment(urls, metadata),
    title: row.title,
    description: row.description,
    editedByClerkUserId: row.edited_by_clerk_user_id,
    editedAt: toIso(row.edited_at),
  };
}

const FULL_COLUMNS = `
  id, slug, urls, created_at, updated_at, deleted_at,
  custom_alias, source, metadata,
  owner_user_id, owner_org_id,
  title, description, url_metadata, creator_fingerprint
`;

// ---------------------------------------------------------------------------
// Create.
// ---------------------------------------------------------------------------

export async function insertLinkyRecord(
  input: InsertLinkyRecordInput,
): Promise<LinkyRecord | null> {
  const pool = getPgPool();

  const urlMetadata = ensureMetadataAlignment(input.urls, input.urlMetadata);

  const result = await pool.query<DbLinkyRow>(
    `
    INSERT INTO linkies (
      slug, urls, custom_alias, source, metadata,
      owner_user_id, owner_org_id,
      title, description, url_metadata, creator_fingerprint
    )
    VALUES (
      $1, $2::jsonb, $3, $4, $5::jsonb,
      $6, $7,
      $8, $9, $10::jsonb, $11
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING ${FULL_COLUMNS}
    `,
    [
      input.slug,
      JSON.stringify(input.urls),
      false,
      input.source,
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.ownerUserId ?? null,
      input.ownerOrgId ?? null,
      input.title ?? null,
      input.description ?? null,
      JSON.stringify(urlMetadata),
      input.creatorFingerprint ?? null,
    ],
  );

  if (result.rowCount === 0 || result.rows.length === 0) {
    return null;
  }
  return mapDbRow(result.rows[0]);
}

// ---------------------------------------------------------------------------
// Read.
// ---------------------------------------------------------------------------

export async function getLinkyRecordBySlug(
  slug: string,
  options: { includeDeleted?: boolean } = {},
): Promise<LinkyRecord | null> {
  const pool = getPgPool();
  const result = await pool.query<DbLinkyRow>(
    `
    SELECT ${FULL_COLUMNS}
    FROM linkies
    WHERE slug = $1
      ${options.includeDeleted ? "" : "AND deleted_at IS NULL"}
    LIMIT 1
    `,
    [slug],
  );
  if (result.rowCount === 0 || result.rows.length === 0) return null;
  return mapDbRow(result.rows[0]);
}

export async function listLinkiesForSubject(
  input: ListLinkiesForSubjectInput,
): Promise<LinkyRecord[]> {
  const pool = getPgPool();

  const { limit, offset } = input;

  // Separate queries by subject type keeps indexes well-used and lets us
  // reason about ownership trivially. No CTE gymnastics needed.
  if (input.type === "user") {
    const result = await pool.query<DbLinkyRow>(
      `
      SELECT ${FULL_COLUMNS}
      FROM linkies
      WHERE owner_user_id = $1
        AND owner_org_id IS NULL
        AND deleted_at IS NULL
      ORDER BY updated_at DESC
      LIMIT $2 OFFSET $3
      `,
      [input.userId, limit, offset],
    );
    return result.rows.map(mapDbRow);
  }

  const result = await pool.query<DbLinkyRow>(
    `
    SELECT ${FULL_COLUMNS}
    FROM linkies
    WHERE owner_org_id = $1
      AND deleted_at IS NULL
    ORDER BY updated_at DESC
    LIMIT $2 OFFSET $3
    `,
    [input.orgId, limit, offset],
  );
  return result.rows.map(mapDbRow);
}

// ---------------------------------------------------------------------------
// Patch.
//
// Updates are atomic: we capture the pre-update state into linky_versions in
// the same transaction as the UPDATE, so history is always consistent with
// the current row. The version number is the count of existing versions + 1.
// ---------------------------------------------------------------------------

export type PatchLinkyInput = {
  slug: string;
  patch: PatchLinkyPayload;
  editedByClerkUserId: string;
};

export async function patchLinkyRecord(
  input: PatchLinkyInput,
): Promise<LinkyRecord | null> {
  const pool = getPgPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Lock the row for the duration of the transaction to prevent racing
    // PATCH requests from producing interleaved version history.
    const current = await client.query<DbLinkyRow>(
      `SELECT ${FULL_COLUMNS} FROM linkies WHERE slug = $1 AND deleted_at IS NULL LIMIT 1 FOR UPDATE`,
      [input.slug],
    );

    if (current.rowCount === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    const currentRow = current.rows[0];

    await appendVersion(client, currentRow, input.editedByClerkUserId);

    const merged = mergePatch(currentRow, input.patch);

    const updated = await client.query<DbLinkyRow>(
      `
      UPDATE linkies SET
        urls = $2::jsonb,
        url_metadata = $3::jsonb,
        title = $4,
        description = $5,
        updated_at = NOW()
      WHERE slug = $1
      RETURNING ${FULL_COLUMNS}
      `,
      [
        input.slug,
        JSON.stringify(merged.urls),
        JSON.stringify(merged.urlMetadata),
        merged.title,
        merged.description,
      ],
    );

    await client.query("COMMIT");
    return mapDbRow(updated.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function mergePatch(
  currentRow: DbLinkyRow,
  patch: PatchLinkyPayload,
): {
  urls: string[];
  urlMetadata: UrlMetadata[];
  title: string | null;
  description: string | null;
} {
  const currentUrls = normalizeDbUrls(currentRow.urls);
  const currentMetadata = ensureMetadataAlignment(
    currentUrls,
    normalizeDbUrlMetadata(currentRow.url_metadata),
  );

  const urls = patch.urls ?? currentUrls;
  const urlMetadata = ensureMetadataAlignment(
    urls,
    patch.urlMetadata ?? currentMetadata,
  );

  const title = patch.title !== undefined ? patch.title : currentRow.title;
  const description =
    patch.description !== undefined ? patch.description : currentRow.description;

  return { urls, urlMetadata, title, description };
}

async function appendVersion(
  client: PoolClient,
  row: DbLinkyRow,
  editedByClerkUserId: string,
): Promise<void> {
  const existing = await client.query<{ next_version: number }>(
    `
    SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version
    FROM linky_versions
    WHERE linky_id = $1
    `,
    [row.id],
  );

  const nextVersion = existing.rows[0]?.next_version ?? 1;

  await client.query(
    `
    INSERT INTO linky_versions (
      linky_id, version_number, urls, url_metadata, title, description, edited_by_clerk_user_id
    )
    VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7)
    `,
    [
      row.id,
      nextVersion,
      JSON.stringify(normalizeDbUrls(row.urls)),
      JSON.stringify(normalizeDbUrlMetadata(row.url_metadata)),
      row.title,
      row.description,
      editedByClerkUserId,
    ],
  );
}

// ---------------------------------------------------------------------------
// Soft delete.
//
// We never truly drop linky rows — downstream references (analytics, claim
// tokens, external inbound traffic) expect the row to exist. Setting
// `deleted_at` makes the public resolver return 410 Gone instead of 200.
// ---------------------------------------------------------------------------

export async function softDeleteLinkyRecord(slug: string): Promise<boolean> {
  const pool = getPgPool();
  const result = await pool.query(
    `
    UPDATE linkies
    SET deleted_at = NOW(), updated_at = NOW()
    WHERE slug = $1 AND deleted_at IS NULL
    `,
    [slug],
  );
  return (result.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Version history read.
// ---------------------------------------------------------------------------

export async function listLinkyVersions(
  slug: string,
  options: { limit?: number } = {},
): Promise<LinkyVersionRecord[]> {
  const pool = getPgPool();
  const result = await pool.query<DbLinkyVersionRow>(
    `
    SELECT v.version_number, v.urls, v.url_metadata, v.title, v.description,
           v.edited_by_clerk_user_id, v.edited_at
    FROM linky_versions v
    INNER JOIN linkies l ON l.id = v.linky_id
    WHERE l.slug = $1
    ORDER BY v.version_number DESC
    LIMIT $2
    `,
    [slug, options.limit ?? 50],
  );
  return result.rows.map(mapDbVersionRow);
}
