# Plano WhatsApp Amanda — Gestão Mulheres Conectadas

## Visão Geral

Integração da assistente virtual **Amanda** via WhatsApp (Evolution API) para:

1. **Recuperação proativa** de alunas faltosas — contato automático após falta registrada, acolhimento, levantamento de dificuldades e encaminhamento.
2. **Tira-dúvidas** — resposta a mensagens espontâneas usando RAG sobre a base de conhecimento do curso.
3. **Escalonamento humano** — quando o caso exige atenção da coordenação.

---

## Fases

### Fase 1 — Banco de dados (este arquivo + `docs/migrations/whatsapp-amanda.sql`)

| Bloco | Tabelas criadas | Finalidade |
|-------|----------------|------------|
| 1 | `wa_instancias`, `wa_config_amanda` | Instâncias Evolution selecionáveis na aba Configurações |
| 2 | `wa_conversas`, `wa_conversa_mensagens` | Acompanhamento de conversas (tela de monitoramento) |
| 3 | `recuperacao_casos`, `wa_fluxos` | Kanban de recuperação + tela de fluxos |
| 4 | RLS policies | Acesso: coord/admin total; professor somente leitura |
| 5 | Seeds | Políticas de IA (`ia_politicas`) + 2 fluxos nativos |

### Fase 2 — Edge Functions

- `wa-webhook` — recebe eventos da Evolution API (mensagens inbound, status de entrega)
- `amanda-agente` — orquestra a conversa: classifica intenção → chama fluxo → gera resposta via Gemini/Groq → envia via Evolution

### Fase 3 — UI

- **Aba Configurações** → seleção/configuração da instância Evolution (número)
- **Tela de Acompanhamento** → lista de conversas ativas, histórico de mensagens
- **Tela de Fluxos** → CRUD de fluxos de conversa (`wa_fluxos`)

---

## Adicionais aprovados

- Seleção/configuração do número (instância Evolution) na aba Configurações
- Tela de acompanhamento das conversas
- Tela dos fluxos de conversa

---

## Arquitetura de IA

| Processo | Provedor | Uso |
|----------|----------|-----|
| `wa_recuperacao_conversa` | Gemini | Diálogo proativo com aluna faltosa |
| `wa_duvidas_rag` | Gemini | Resposta a dúvidas com base de conhecimento |
| `wa_intencao` | Groq | Classificação de intenção (baixa latência) |
| `wa_recuperacao_extracao` | Gemini | Extração estruturada de motivo/risco |

---

## Fluxos nativos

### Recuperação de aluna faltosa
- **Gatilho:** falta registrada em `presencas` (cron diário) sem caso aberto
- **Etapas:** Abertura → Escuta → Encaminhamento → Registro

### Tira-dúvidas (AVA e curso)
- **Gatilho:** mensagem inbound sem caso de recuperação ativo
- **Etapas:** Classificação → Resposta com base → Fallback para coordenação
