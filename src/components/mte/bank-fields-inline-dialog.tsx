import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { upsertBeneficiaria, type Beneficiaria } from "@/lib/mte-queries";

export type BankInlineTarget =
  | {
      kind: "beneficiaria";
      beneficiariaId: string;
      nome: string;
      cpf: string;
      banco: string | null;
      agencia: string | null;
      conta: string | null;
    }
  | {
      // Matrícula ligada apenas a `cursistas` (ainda sem beneficiária).
      // Ao salvar, criamos a beneficiária e vinculamos a matrícula.
      kind: "matricula";
      matriculaId: string;
      nome: string;
      cpf: string;
      banco: string | null;
      agencia: string | null;
      conta: string | null;
    };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  target: BankInlineTarget | null;
  /** Chaves para invalidar depois de salvar. */
  invalidateKeys?: (string | string[])[];
};

export function BankFieldsInlineDialog({ open, onOpenChange, target, invalidateKeys = [] }: Props) {
  const qc = useQueryClient();
  const [banco, setBanco] = useState("");
  const [agencia, setAgencia] = useState("");
  const [conta, setConta] = useState("");

  useEffect(() => {
    if (!open || !target) return;
    setBanco(target.banco ?? "");
    setAgencia(target.agencia ?? "");
    setConta(target.conta ?? "");
  }, [open, target]);

  const mut = useMutation({
    mutationFn: async () => {
      if (!target) return;
      const patch: Partial<Beneficiaria> = {
        banco: banco.trim() || null,
        agencia: agencia.trim() || null,
        conta: conta.trim() || null,
      };
      if (target.kind === "beneficiaria") {
        await upsertBeneficiaria({ id: target.beneficiariaId, ...patch });
        return;
      }
      // matricula sem beneficiária: cria a beneficiária e liga.
      // Se já existir uma beneficiária com o mesmo CPF, reaproveita.
      const existing = await supabase
        .from("beneficiarias")
        .select("id")
        .eq("cpf", target.cpf)
        .maybeSingle();
      let beneficiariaId = (existing.data as { id?: string } | null)?.id;
      if (!beneficiariaId) {
        const ins = await supabase
          .from("beneficiarias")
          .insert({
            nome: target.nome,
            cpf: target.cpf,
            banco: patch.banco,
            agencia: patch.agencia,
            conta: patch.conta,
          })
          .select("id")
          .single();
        if (ins.error) throw new Error(ins.error.message);
        beneficiariaId = (ins.data as { id: string }).id;
      } else {
        await upsertBeneficiaria({ id: beneficiariaId, ...patch });
      }
      const upd = await supabase
        .from("matriculas")
        .update({ beneficiaria_id: beneficiariaId })
        .eq("id", target.matriculaId);
      if (upd.error) throw new Error(upd.error.message);
    },
    onSuccess: () => {
      toast.success("Dados bancários salvos");
      for (const key of invalidateKeys) {
        qc.invalidateQueries({ queryKey: Array.isArray(key) ? key : [key] });
      }
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao salvar"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dados bancários</DialogTitle>
          <DialogDescription>
            {target ? target.nome : ""}{" "}
            <span className="text-muted-foreground">— usados para conferir pagamentos no extrato.</span>
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Banco</Label>
            <Input value={banco} onChange={(e) => setBanco(e.target.value)} placeholder="Ex.: Caixa, Nu, Itaú" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Agência</Label>
              <Input value={agencia} onChange={(e) => setAgencia(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Conta</Label>
              <Input value={conta} onChange={(e) => setConta(e.target.value)} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mut.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !target}>
            {mut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}