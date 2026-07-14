import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Globe2, Lock, Users, Loader2, Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { atualizarVisibilidadeImportacao, listarCompartilhamentos, type Visibilidade } from "@/lib/whatsapp-sharing.functions";
import { listarUsuariosParaDemandas } from "@/lib/demandas.functions";
import { useActiveContext } from "@/hooks/use-active-context";

const LABEL: Record<Visibilidade, string> = {
  privado: "Privado",
  compartilhado_todos: "Todos",
  compartilhado_selecionados: "Selecionados",
};
const ICONE: Record<Visibilidade, React.ReactNode> = {
  privado: <Lock className="h-3 w-3" />,
  compartilhado_todos: <Globe2 className="h-3 w-3" />,
  compartilhado_selecionados: <Users className="h-3 w-3" />,
};

export function VisibilidadeControl({
  importacaoId,
  visibilidade,
  ownerId,
  ownerNome,
  canEdit,
}: {
  importacaoId: string;
  visibilidade: Visibilidade;
  ownerId: string | null;
  ownerNome?: string | null;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const { projetoId, user } = useActiveContext();
  const [open, setOpen] = useState(false);
  const [modo, setModo] = useState<Visibilidade>(visibilidade);
  const [sel, setSel] = useState<Set<string>>(new Set());

  const listarUsersFn = useServerFn(listarUsuariosParaDemandas);
  const listarShareFn = useServerFn(listarCompartilhamentos);
  const salvarFn = useServerFn(atualizarVisibilidadeImportacao);

  const usersQ = useQuery({
    queryKey: ["demandas-users", projetoId],
    enabled: open && !!projetoId,
    staleTime: 60_000,
    queryFn: async () => (projetoId ? await listarUsersFn({ data: { projetoId } }) : []),
  });
  const users = (usersQ.data ?? []) as { id: string; nome: string; email: string }[];

  const shareQ = useQuery({
    queryKey: ["wa-compart", importacaoId],
    enabled: open,
    queryFn: async () => await listarShareFn({ data: { importacaoId } }),
  });

  useEffect(() => { setModo(visibilidade); }, [visibilidade, open]);
  useEffect(() => {
    if (shareQ.data) setSel(new Set(shareQ.data));
  }, [shareQ.data]);

  const salvar = useMutation({
    mutationFn: async () =>
      salvarFn({ data: { importacaoId, visibilidade: modo, userIds: Array.from(sel) } }),
    onSuccess: () => {
      toast.success("Visibilidade atualizada");
      qc.invalidateQueries({ queryKey: ["wa"] });
      qc.invalidateQueries({ queryKey: ["wa-compart", importacaoId] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const badge = (
    <Badge variant="secondary" className="gap-1">
      {ICONE[visibilidade]} {LABEL[visibilidade]}
    </Badge>
  );

  const isOwner = user?.id && ownerId && user.id === ownerId;
  const compartilhadoPor = !isOwner && ownerNome ? `Compartilhado por ${ownerNome}` : null;

  if (!canEdit) {
    return (
      <div className="flex items-center gap-2 text-xs">
        {badge}
        {compartilhadoPor && <span className="text-muted-foreground">{compartilhadoPor}</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="cursor-pointer">{badge}</button>
        </PopoverTrigger>
        <PopoverContent className="w-72">
          <div className="grid gap-2">
            <label className="text-xs font-medium">Quem pode ver esta importação?</label>
            <Select value={modo} onValueChange={(v) => setModo(v as Visibilidade)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="privado">Somente eu (privado)</SelectItem>
                <SelectItem value="compartilhado_todos">Todos os usuários</SelectItem>
                <SelectItem value="compartilhado_selecionados">Escolher usuários…</SelectItem>
              </SelectContent>
            </Select>
            {modo === "compartilhado_selecionados" && (
              <div className="max-h-56 overflow-auto rounded border p-1">
                {usersQ.isLoading ? (
                  <div className="p-2 text-xs text-muted-foreground">Carregando…</div>
                ) : users.length === 0 ? (
                  <div className="p-2 text-xs text-muted-foreground">Sem usuários.</div>
                ) : (
                  <ul className="grid gap-0.5">
                    {users.map((u) => {
                      const ativo = sel.has(u.id);
                      return (
                        <li key={u.id}>
                          <button
                            type="button"
                            className="flex w-full items-center justify-between rounded px-2 py-1 text-left hover:bg-muted"
                            onClick={() => {
                              const next = new Set(sel);
                              if (ativo) next.delete(u.id); else next.add(u.id);
                              setSel(next);
                            }}
                          >
                            <span className="truncate">{u.nome}</span>
                            {ativo && <Check className="h-3.5 w-3.5 text-primary" />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
            <div className="flex justify-end">
              <Button size="sm" onClick={() => salvar.mutate()} disabled={salvar.isPending}>
                {salvar.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                Salvar
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {compartilhadoPor && <span className="text-muted-foreground">{compartilhadoPor}</span>}
    </div>
  );
}
