"use client";

import { useMemo, useState, useTransition } from "react";

type ApiKeyItem = {
  id: number;
  name: string;
  scope: "user" | "org";
  keyPrefix: string;
  createdAt: string;
  createdAtLabel: string;
  lastUsedAt: string | null;
  lastUsedAtLabel: string | null;
  revokedAt: string | null;
  revokedAtLabel: string | null;
};

type Props = {
  subjectType: "user" | "org";
  initialKeys: ApiKeyItem[];
};

type CreateApiKeyResponse = {
  apiKey: {
    id: number;
    name: string;
    scope: "user" | "org";
    keyPrefix: string;
    createdAt: string;
    lastUsedAt: string | null;
    revokedAt: string | null;
  };
  rawKey: string;
  warning?: string;
};

function formatRelative(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

function withLabels(item: CreateApiKeyResponse["apiKey"]): ApiKeyItem {
  return {
    ...item,
    createdAtLabel: formatRelative(item.createdAt),
    lastUsedAtLabel: item.lastUsedAt ? formatRelative(item.lastUsedAt) : null,
    revokedAtLabel: item.revokedAt ? formatRelative(item.revokedAt) : null,
  };
}

export function ApiKeysPanel({ subjectType, initialKeys }: Props) {
  const [keys, setKeys] = useState<ApiKeyItem[]>(initialKeys);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [revealedWarning, setRevealedWarning] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const activeKeys = useMemo(
    () => keys.filter((item) => item.revokedAt === null),
    [keys],
  );

  const revokedKeys = useMemo(
    () => keys.filter((item) => item.revokedAt !== null),
    [keys],
  );

  const handleCreate = () => {
    setError(null);
    setSuccess(null);
    setRevealedKey(null);
    setRevealedWarning(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/me/keys", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name }),
        });

        const body = (await response.json().catch(() => ({}))) as
          | { error?: string }
          | CreateApiKeyResponse;

        if (!response.ok) {
          setError("error" in body ? (body.error ?? "Could not create API key.") : "Could not create API key.");
          return;
        }

        if (!("apiKey" in body) || typeof body.rawKey !== "string") {
          setError("Linky returned an invalid API-key response.");
          return;
        }

        setKeys((prev) => [withLabels(body.apiKey), ...prev]);
        setRevealedKey(body.rawKey);
        setRevealedWarning(body.warning ?? null);
        setSuccess(
          `${subjectType === "org" ? "Team" : "Personal"} API key created.`,
        );
        setName("");
      } catch {
        setError("Could not reach the Linky API. Check your connection and retry.");
      }
    });
  };

  const handleRevoke = (apiKeyId: number) => {
    setError(null);
    setSuccess(null);

    const confirmed = window.confirm(
      "Revoke this API key? Any CLI, CI, or MCP client using it will stop authenticating immediately.",
    );
    if (!confirmed) return;

    startTransition(async () => {
      try {
        const response = await fetch(`/api/me/keys?id=${apiKeyId}`, {
          method: "DELETE",
        });

        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
          apiKey?: {
            id: number;
            name: string;
            scope: "user" | "org";
            keyPrefix: string;
            createdAt: string;
            lastUsedAt: string | null;
            revokedAt: string | null;
          };
        };

        if (!response.ok || !body.apiKey) {
          setError(body.error ?? "Could not revoke API key.");
          return;
        }

        setKeys((prev) =>
          prev.map((item) =>
            item.id === apiKeyId ? withLabels(body.apiKey!) : item,
          ),
        );
        setSuccess("API key revoked.");
      } catch {
        setError("Could not reach the Linky API. Check your connection and retry.");
      }
    });
  };

  return (
    <div className="space-y-6">
      <section className="terminal-card space-y-4 p-4 sm:p-5">
        <div>
          <p className="terminal-label mb-2">
            Create {subjectType === "org" ? "team" : "personal"} API key
          </p>
          <p className="terminal-muted max-w-2xl text-sm sm:text-base">
            This key authenticates automation for the active workspace. Use it
            with <code>linky update</code>, the SDK, or a future MCP server.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            placeholder="e.g. release-bot, local-dev, cursor-agent"
            className="terminal-input text-sm sm:text-base"
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={isPending || name.trim().length === 0}
            className="terminal-action px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            Create key
          </button>
        </div>

        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        {success ? <p className="text-sm text-green-700">{success}</p> : null}

        {revealedKey ? (
          <div className="border border-foreground p-3">
            <p className="terminal-label mb-2">Shown once</p>
            <pre className="overflow-x-auto text-sm break-all whitespace-pre-wrap">
              <code>{revealedKey}</code>
            </pre>
            {revealedWarning ? (
              <p className="terminal-muted mt-2 text-xs sm:text-sm">
                {revealedWarning}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="terminal-card p-4 sm:p-5">
        <p className="terminal-label mb-3">Active keys</p>
        {activeKeys.length === 0 ? (
          <p className="terminal-muted text-sm">
            No active keys for this workspace yet.
          </p>
        ) : (
          <div className="site-divider-list">
            {activeKeys.map((item) => (
              <article
                key={item.id}
                className="site-divider-item flex flex-wrap items-start justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground sm:text-base">
                    {item.name}
                  </p>
                  <p className="terminal-muted mt-1 break-all text-xs sm:text-sm">
                    {item.keyPrefix}
                  </p>
                  <p className="terminal-muted mt-1 text-xs">
                    created {item.createdAtLabel}
                    {item.lastUsedAtLabel
                      ? ` · used ${item.lastUsedAtLabel}`
                      : " · never used"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRevoke(item.id)}
                  disabled={isPending}
                  className="terminal-secondary px-3 py-1.5 text-xs sm:text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Revoke
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="terminal-card p-4 sm:p-5">
        <p className="terminal-label mb-3">Revoked keys</p>
        {revokedKeys.length === 0 ? (
          <p className="terminal-muted text-sm">No revoked keys.</p>
        ) : (
          <div className="site-divider-list">
            {revokedKeys.map((item) => (
              <article key={item.id} className="site-divider-item">
                <p className="text-sm font-semibold text-foreground sm:text-base">
                  {item.name}
                </p>
                <p className="terminal-muted mt-1 break-all text-xs sm:text-sm">
                  {item.keyPrefix}
                </p>
                <p className="terminal-muted mt-1 text-xs">
                  revoked {item.revokedAtLabel ?? "recently"}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
