## Objetivo

O card "Claude Code (Assinante)" está sem `base_url` no banco, o que impedia o teste (agora, após o null-check da mensagem anterior, mostra "Provedor sem base_url"). Seu curl confirma o endpoint correto: `https://api.anthropic.com/v1`.

## Ação

Rodar UPDATE no banco `yqvocpnvunaprpmhlswn` para preencher o provedor `claude_code`:

```sql
UPDATE public.ia_provedores
SET
  base_url = 'https://api.anthropic.com/v1',
  modelo_padrao = COALESCE(modelo_padrao, 'claude-sonnet-4-5'),
  atualizado_em = now()
WHERE provedor = 'claude_code';
```

Observações:
- O código já roteia `claude_code` para `chamarAnthropic` (via `selecionarChamador`, que detecta "claude" no código do provedor) — envia `x-api-key` + `anthropic-version: 2023-06-01` exatamente como no seu curl.
- Sem alteração de frontend/backend necessária. Depois de rodar o UPDATE, o botão "Testar" no card já deve devolver "OK" com a API Key da Anthropic configurada.
- Seu curl usa `claude-sonnet-4-6`; se quiser esse modelo como padrão em vez de `claude-sonnet-4-5`, troque no SQL. Posso também popular `modelos_disponiveis` com uma lista (ex.: `claude-sonnet-4-6`, `claude-sonnet-4-5`, `claude-opus-4-5`) — me diga quais quer no dropdown.

## Nada muda no código

Nenhum arquivo é editado nesta etapa; é só configuração de dado do provedor.