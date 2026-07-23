import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  listarPolosInscricaoPublica,
  removerPoloInscricao,
  salvarPoloInscricao,
  geocodificarEndereco,
} from "@/lib/polos-inscricao.functions";
import type { PoloInscricaoPublico } from "@/lib/inscricao-digital";

export const Route = createFileRoute("/_authenticated/administrativo/polos")({
  component: PolosInscricaoPage,
});

function PolosInscricaoPage() {
  const qc = useQueryClient();
  const polosQ = useQuery({
    queryKey: ["administrativo", "polos"],
    queryFn: () => listarPolosInscricaoPublica(),
  });
  const [editando, setEditando] = useState<PoloInscricaoPublico | null>(null);
  const salvar = useMutation({
    mutationFn: salvarPoloInscricao,
    onSuccess: () => {
      toast.success("Polo salvo.");
      qc.invalidateQueries({ queryKey: ["administrativo", "polos"] });
      setEditando(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remover = useMutation({
    mutationFn: removerPoloInscricao,
    onSuccess: () => {
      toast.success("Polo desativado.");
      qc.invalidateQueries({ queryKey: ["administrativo", "polos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const geo = useMutation({
    mutationFn: geocodificarEndereco,
    onSuccess: (r) => {
      if (editando)
        setEditando({
          ...editando,
          latitude: r.latitude,
          longitude: r.longitude,
          enderecoReferencia: r.enderecoFormatado,
        });
      toast.success("Endereço geocodificado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const novo = () =>
    setEditando({
      id: "",
      nome: "",
      municipio: "",
      enderecoReferencia: "",
      latitude: null,
      longitude: null,
      ordem: (polosQ.data?.length ?? 0) + 1,
    });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Polos de inscrição</h2>
          <p className="text-sm text-muted-foreground">
            Gerencie os locais usados no formulário público.
          </p>
        </div>
        <Button onClick={novo}>
          <Plus className="mr-2 size-4" /> Novo polo
        </Button>
      </div>
      {editando && (
        <Card>
          <CardHeader>
            <CardTitle>{editando.id ? "Editar polo" : "Novo polo"}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <Input
              placeholder="Nome do polo"
              value={editando.nome}
              onChange={(e) => setEditando({ ...editando, nome: e.target.value })}
            />
            <Input
              placeholder="Município"
              value={editando.municipio}
              onChange={(e) => setEditando({ ...editando, municipio: e.target.value })}
            />
            <Input
              className="md:col-span-2"
              placeholder="Endereço de referência"
              value={editando.enderecoReferencia ?? ""}
              onChange={(e) => setEditando({ ...editando, enderecoReferencia: e.target.value })}
            />
            <div className="flex gap-2">
              <Input
                placeholder="Latitude"
                value={editando.latitude ?? ""}
                onChange={(e) =>
                  setEditando({
                    ...editando,
                    latitude: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
              <Input
                placeholder="Longitude"
                value={editando.longitude ?? ""}
                onChange={(e) =>
                  setEditando({
                    ...editando,
                    longitude: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={!editando.enderecoReferencia || geo.isPending}
                onClick={() =>
                  geo.mutate({
                    data: {
                      enderecoCompleto: `${editando.enderecoReferencia}, ${editando.municipio}, MG, Brasil`,
                    },
                  })
                }
              >
                <MapPin className="mr-2 size-4" /> Geocodificar
              </Button>
              <Button
                disabled={!editando.nome || salvar.isPending}
                onClick={() =>
                  salvar.mutate({ data: { ...editando, id: editando.id || undefined } })
                }
              >
                <Save className="mr-2 size-4" /> Salvar
              </Button>
              <Button variant="ghost" onClick={() => setEditando(null)}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-3">
        {(polosQ.data ?? []).map((polo) => (
          <Card key={polo.id}>
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">{polo.nome}</p>
                <p className="text-sm text-muted-foreground">
                  {polo.municipio || "Sem município"}
                  {polo.enderecoReferencia ? ` · ${polo.enderecoReferencia}` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditando(polo)}>
                  Editar
                </Button>
                {polo.nome !== "Outros" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => remover.mutate({ data: { id: polo.id } })}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
