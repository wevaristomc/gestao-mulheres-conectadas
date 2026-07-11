import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useActiveContext } from "@/hooks/use-active-context";
import { locaisOptions, upsertLocal, deleteLocal, type Local } from "@/lib/locais-queries";

export const Route = createFileRoute("/_authenticated/configuracoes/locais")({
  component: LocaisPage,
});

function LocaisPage() {
  const { role } = useActiveContext();
  const canEdit =
    role === "coordenador_geral" ||
    role === "administrativo" ||
    role === "coordenador_pedagogico";
  const qc = useQueryClient();
  const listaQ = useQuery(locaisOptions(false));
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Local | null>(null);
  const [nome, setNome] = useState("");
  const [endereco, setEndereco] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [ativo, setAtivo] = useState(true);

  const abrir = (l?: Local) => {
    setEdit(l ?? null);
    setNome(l?.nome ?? "");
    setEndereco(l?.endereco ?? "");
    setMunicipio(l?.municipio ?? "");
    setAtivo(l?.ativo ?? true);
    setOpen(true);
  };

  const salvarMut = useMutation({
    mutationFn: async () => {
      if (!nome.trim()) throw new Error("Nome é obrigatório");
      await upsertLocal({
        id: edit?.id,
        nome,
        endereco: endereco || null,
        municipio: municipio || null,
        ativo,
      });
    },
    onSuccess: () => {
      toast.success(edit ? "Local atualizado" : "Local criado");
      qc.invalidateQueries({ queryKey: ["locais"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluirMut = useMutation({
    mutationFn: (id: string) => deleteLocal(id),
    onSuccess: () => {
      toast.success("Local removido");
      qc.invalidateQueries({ queryKey: ["locais"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Locais de trabalho</h2>
          <p className="text-xs text-muted-foreground">
            Cadastro dos locais utilizados em turmas e relação de horas.
          </p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={() => abrir()}>
            <Plus className="mr-1 h-4 w-4" /> Novo local
          </Button>
        )}
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Endereço</TableHead>
              <TableHead className="w-[140px]">Município</TableHead>
              <TableHead className="w-[80px]">Ativo</TableHead>
              <TableHead className="w-[120px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(listaQ.data?.rows ?? []).map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{l.nome}</TableCell>
                <TableCell className="text-muted-foreground">{l.endereco ?? "—"}</TableCell>
                <TableCell>{l.municipio ?? "—"}</TableCell>
                <TableCell>{l.ativo ? "Sim" : "Não"}</TableCell>
                <TableCell className="text-right">
                  {canEdit && (
                    <>
                      <Button size="icon" variant="ghost" onClick={() => abrir(l)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Remover "${l.nome}"?`)) excluirMut.mutate(l.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {(listaQ.data?.rows ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Nenhum local cadastrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit ? "Editar local" : "Novo local"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label htmlFor="nome">Nome *</Label>
              <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="end">Endereço</Label>
              <Input id="end" value={endereco} onChange={(e) => setEndereco(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="mun">Município</Label>
              <Input id="mun" value={municipio} onChange={(e) => setMunicipio(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="ativo" checked={ativo} onCheckedChange={setAtivo} />
              <Label htmlFor="ativo">Ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={salvarMut.isPending}>
              Cancelar
            </Button>
            <Button onClick={() => salvarMut.mutate()} disabled={salvarMut.isPending}>
              {salvarMut.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}