import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { LinkyError } from "@/lib/linky/errors";

import type { AuthenticatedSubject, OrgSubject, UserSubject } from "./auth";
import { getPgPool } from "./postgres";

export type ApiKeyScope = "user" | "org";

export type ApiKeyRecord = {
  id: number;
  name: string;
  scope: ApiKeyScope;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

type SubjectOwnedApiKey = UserSubject | OrgSubject;

type DbApiKeyRow = {
  id: number;
  key_prefix: string;
  secret_hash: string;
  owner_user_id: string | null;
  owner_org_id: string | null;
  name: string;
  created_by_clerk_user_id: string | null;
  created_at: Date | string;
  last_used_at: Date | string | null;
  revoked_at: Date | string | null;
};

const USER_KEY_PREFIX = "lkyu";
const ORG_KEY_PREFIX = "lkyo";
const RAW_KEY_PATTERN = /^(lkyu|lkyo)_([a-f0-9]{8})\.([A-Za-z0-9_-]{24,})$/;
const MAX_API_KEY_NAME_LENGTH = 80;

function toIso(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapDbRow(row: DbApiKeyRow): ApiKeyRecord {
  return {
    id: row.id,
    name: row.name,
    scope: row.owner_org_id ? "org" : "user",
    keyPrefix: row.key_prefix,
    createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
    lastUsedAt: toIso(row.last_used_at),
    revokedAt: toIso(row.revoked_at),
  };
}

function subjectOwnershipClause(subject: SubjectOwnedApiKey): {
  clause: string;
  params: string[];
} {
  if (subject.type === "org") {
    return {
      clause: "owner_org_id = $1 AND owner_user_id IS NULL",
      params: [subject.orgId],
    };
  }

  return {
    clause: "owner_user_id = $1 AND owner_org_id IS NULL",
    params: [subject.userId],
  };
}

function keyPrefixForScope(scope: ApiKeyScope, publicId: string): string {
  return `${scope === "org" ? ORG_KEY_PREFIX : USER_KEY_PREFIX}_${publicId}`;
}

function mintApiKey(scope: ApiKeyScope): {
  rawKey: string;
  keyPrefix: string;
  secretHash: string;
} {
  // Public id is short + hex-only so the displayed prefix is easy to read,
  // log, and paste into support/debugging conversations.
  const publicId = randomBytes(4).toString("hex");
  // Secret is the real bearer credential. Base64url keeps it shell-safe.
  const secret = randomBytes(24).toString("base64url");
  const keyPrefix = keyPrefixForScope(scope, publicId);
  return {
    rawKey: `${keyPrefix}.${secret}`,
    keyPrefix,
    secretHash: hashApiKeySecret(secret),
  };
}

export function parseRawApiKey(
  rawKey: string,
): { scope: ApiKeyScope; keyPrefix: string; secret: string } | null {
  const trimmed = rawKey.trim();
  const match = RAW_KEY_PATTERN.exec(trimmed);
  if (!match) return null;

  return {
    scope: match[1] === ORG_KEY_PREFIX ? "org" : "user",
    keyPrefix: `${match[1]}_${match[2]}`,
    secret: match[3],
  };
}

export function hashApiKeySecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function normalizeApiKeyName(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new LinkyError("`name` must be a string.", {
      code: "BAD_REQUEST",
      statusCode: 400,
    });
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new LinkyError("`name` cannot be empty.", {
      code: "BAD_REQUEST",
      statusCode: 400,
    });
  }

  if (trimmed.length > MAX_API_KEY_NAME_LENGTH) {
    throw new LinkyError(
      `\`name\` must be at most ${MAX_API_KEY_NAME_LENGTH} characters.`,
      {
        code: "BAD_REQUEST",
        statusCode: 400,
      },
    );
  }

  return trimmed;
}

export async function listApiKeysForSubject(
  subject: SubjectOwnedApiKey,
): Promise<ApiKeyRecord[]> {
  const pool = getPgPool();
  const ownership = subjectOwnershipClause(subject);

  const result = await pool.query<DbApiKeyRow>(
    `
    SELECT
      id,
      key_prefix,
      secret_hash,
      owner_user_id,
      owner_org_id,
      name,
      created_by_clerk_user_id,
      created_at,
      last_used_at,
      revoked_at
    FROM api_keys
    WHERE ${ownership.clause}
    ORDER BY created_at DESC, id DESC
    `,
    ownership.params,
  );

  return result.rows.map(mapDbRow);
}

export async function createApiKeyForSubject(input: {
  subject: SubjectOwnedApiKey;
  name: string;
  createdByClerkUserId: string;
}): Promise<{ apiKey: ApiKeyRecord; rawKey: string }> {
  const pool = getPgPool();
  const scope: ApiKeyScope = input.subject.type === "org" ? "org" : "user";
  const minted = mintApiKey(scope);

  const result = await pool.query<DbApiKeyRow>(
    `
    INSERT INTO api_keys (
      key_prefix,
      secret_hash,
      owner_user_id,
      owner_org_id,
      name,
      created_by_clerk_user_id
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING
      id,
      key_prefix,
      secret_hash,
      owner_user_id,
      owner_org_id,
      name,
      created_by_clerk_user_id,
      created_at,
      last_used_at,
      revoked_at
    `,
    [
      minted.keyPrefix,
      minted.secretHash,
      input.subject.type === "user" ? input.subject.userId : null,
      input.subject.type === "org" ? input.subject.orgId : null,
      input.name,
      input.createdByClerkUserId,
    ],
  );

  return {
    apiKey: mapDbRow(result.rows[0]),
    rawKey: minted.rawKey,
  };
}

export async function revokeApiKeyForSubject(input: {
  apiKeyId: number;
  subject: SubjectOwnedApiKey;
}): Promise<ApiKeyRecord | null> {
  const pool = getPgPool();
  const ownership = subjectOwnershipClause(input.subject);

  const result = await pool.query<DbApiKeyRow>(
    `
    UPDATE api_keys
    SET revoked_at = COALESCE(revoked_at, NOW())
    WHERE id = $1
      AND ${ownership.clause}
    RETURNING
      id,
      key_prefix,
      secret_hash,
      owner_user_id,
      owner_org_id,
      name,
      created_by_clerk_user_id,
      created_at,
      last_used_at,
      revoked_at
    `,
    [input.apiKeyId, ...ownership.params],
  );

  if (result.rowCount === 0) return null;
  return mapDbRow(result.rows[0]);
}

export async function authenticateApiKey(
  rawKey: string,
): Promise<AuthenticatedSubject | null> {
  const parsed = parseRawApiKey(rawKey);
  if (!parsed) return null;

  const pool = getPgPool();
  const result = await pool.query<DbApiKeyRow>(
    `
    UPDATE api_keys
    SET last_used_at = NOW()
    WHERE key_prefix = $1
      AND secret_hash = $2
      AND revoked_at IS NULL
    RETURNING
      id,
      key_prefix,
      secret_hash,
      owner_user_id,
      owner_org_id,
      name,
      created_by_clerk_user_id,
      created_at,
      last_used_at,
      revoked_at
    `,
    [parsed.keyPrefix, hashApiKeySecret(parsed.secret)],
  );

  if (result.rowCount === 0) return null;

  const row = result.rows[0];
  if (row.owner_org_id) {
    // Org-scoped automation acts only as the org itself. We deliberately do
    // not smuggle a user identity through bearer auth — that would let a team
    // key reach personal resources tied to the creator's user id.
    return {
      type: "org",
      orgId: row.owner_org_id,
      userId: null,
      role: null,
    };
  }

  if (row.owner_user_id) {
    return {
      type: "user",
      userId: row.owner_user_id,
    };
  }

  return null;
}
