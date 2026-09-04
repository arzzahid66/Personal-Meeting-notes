import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeft, Copy, KeySquare, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { settingsApi } from "@/api/settings";
import type { McpTokenCreated } from "@/api/types";
import { qk, useMcpTokens } from "@/hooks/queries";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, Skeleton } from "@/components/ui/card";
import {
  ConfirmDialog,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorNotice } from "@/components/ui/misc";
import { formatRelative } from "@/lib/utils";

export default function TokensScreen() {
  const qc = useQueryClient();
  const tokens = useMcpTokens();
  const [name, setName] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [created, setCreated] = React.useState<McpTokenCreated | null>(null);
  const [revokeId, setRevokeId] = React.useState<string | null>(null);

  const create = useMutation({
    mutationFn: (tokenName: string) => settingsApi.createToken(tokenName),
    onSuccess: (token) => {
      setCreated(token);
      setOpen(false);
      setName("");
      void qc.invalidateQueries({ queryKey: qk.tokens() });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => settingsApi.revokeToken(id),
    onSuccess: () => {
      setRevokeId(null);
      toast.success("Token revoked.");
      void qc.invalidateQueries({ queryKey: qk.tokens() });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <>
      <PageHeader
        title="MCP tokens"
        description="Long-lived credentials for external tooling."
        back={
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link to="/settings">
              <ArrowLeft className="size-4" />
              Settings
            </Link>
          </Button>
        }
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="size-4" />
                New
              </Button>
            </DialogTrigger>
            <DialogContent
              title="Create a token"
              description="The token itself is shown once and stored hashed. Copy it before closing."
            >
              <Field label="Name" htmlFor="token-name">
                <Input
                  id="token-name"
                  value={name}
                  maxLength={120}
                  placeholder="laptop claude-code"
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button
                  loading={create.isPending}
                  disabled={!name.trim()}
                  onClick={() => create.mutate(name.trim())}
                >
                  Create token
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {tokens.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : tokens.isError ? (
        <ErrorNotice message={(tokens.error as Error).message} />
      ) : tokens.data.length === 0 ? (
        <EmptyState
          icon={KeySquare}
          title="No tokens"
          description="Create one only if an external tool needs to reach this account."
        />
      ) : (
        <ul className="space-y-2">
          {tokens.data.map((token) => (
            <li key={token.id}>
              <Card>
                <CardContent className="flex items-center gap-3 pt-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{token.name}</p>
                      {token.revoked_at ? (
                        <Badge variant="destructive">Revoked</Badge>
                      ) : null}
                    </div>
                    <p className="font-mono text-xs text-muted-foreground">
                      {token.prefix}…
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {token.last_used_at
                        ? `Last used ${formatRelative(token.last_used_at)}`
                        : "Never used"}
                    </p>
                  </div>
                  {!token.revoked_at ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Revoke token"
                      onClick={() => setRevokeId(token.id)}
                    >
                      <Trash2 />
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {/* Shown as a modal rather than a toast: this is the only time the
          plaintext token exists anywhere the user can reach it. */}
      <Dialog open={Boolean(created)} onOpenChange={() => setCreated(null)}>
        <DialogContent
          title="Copy this token now"
          description={created?.warning}
        >
          <div className="space-y-3">
            <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs">
              {created?.token}
            </pre>
            <Button
              className="w-full"
              onClick={async () => {
                if (!created) return;
                try {
                  await navigator.clipboard.writeText(created.token);
                  toast.success("Token copied.");
                } catch {
                  toast.error("Copy failed — select the text and copy it manually.");
                }
              }}
            >
              <Copy className="size-4" />
              Copy token
            </Button>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Done</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(revokeId)}
        onOpenChange={(next) => !next && setRevokeId(null)}
        title="Revoke this token?"
        description="Anything using it will stop working immediately."
        confirmLabel="Revoke"
        destructive
        loading={revoke.isPending}
        onConfirm={() => revokeId && revoke.mutate(revokeId)}
      />
    </>
  );
}
