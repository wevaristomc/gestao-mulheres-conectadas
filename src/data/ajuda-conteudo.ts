// Conteúdo central de ajuda contextual.
// Cada entrada é acessada por um id estável (formato "modulo.campo").
// Renderizado por <HelpPoint id="..."/> e pela página /ajuda.

export type AjudaEntry = {
  id: string;
  modulo: string;
  titulo: string;
  explicacao: string;
  exemplo?: string;
  rota_ajuda?: string; // link "saiba mais"
};

export const AJUDA: Record<string, AjudaEntry> = {
  "beneficiaria.cpf": {
    id: "beneficiaria.cpf",
    modulo: "beneficiarias",
    titulo: "CPF da beneficiária",
    explicacao:
      "CPF é obrigatório e único por beneficiária. Serve para conferência DEQ/PMQ e para vincular listas de presença, matrículas e certificados.",
    exemplo: "060.470.976-50 (11 dígitos, com ou sem pontuação — o sistema formata automaticamente)",
    rota_ajuda: "/ajuda?g=mte",
  },
  "beneficiaria.nis": {
    id: "beneficiaria.nis",
    modulo: "beneficiarias",
    titulo: "NIS (Número de Identificação Social)",
    explicacao:
      "Número do CadÚnico/Bolsa Família. Só é obrigatório quando a beneficiária declara receber programa social. Aparece na conferência da vulnerabilidade social exigida pelo Termo de Fomento.",
    exemplo: "12345678901 (11 dígitos)",
  },
  "beneficiaria.raca": {
    id: "beneficiaria.raca",
    modulo: "beneficiarias",
    titulo: "Raça / cor (autodeclaração)",
    explicacao:
      "Autodeclaração conforme IBGE: Branca, Preta, Parda, Amarela ou Indígena. Compõe os indicadores de recorte racial exigidos no relatório DEQ.",
    exemplo: "Parda",
  },
  "beneficiaria.pcd": {
    id: "beneficiaria.pcd",
    modulo: "beneficiarias",
    titulo: "PcD (Pessoa com Deficiência)",
    explicacao:
      "Marque quando houver laudo/autodeclaração de deficiência. O campo 'tipo de deficiência' passa a ser obrigatório e alimenta o indicador de inclusão do DEQ.",
    exemplo: "Marcar 'Sim' + tipo: 'Auditiva leve'",
  },
  "beneficiaria.programa_social": {
    id: "beneficiaria.programa_social",
    modulo: "beneficiarias",
    titulo: "Programa social",
    explicacao:
      "Ative quando a beneficiária declarar receber Bolsa Família, BPC, Auxílio Brasil ou outro. Junto com o NIS, compõe a comprovação de vulnerabilidade socioeconômica.",
    exemplo: "Sim → 'Bolsa Família'",
  },
  "turma.codigo": {
    id: "turma.codigo",
    modulo: "turmas",
    titulo: "Código da turma",
    explicacao:
      "Identificador curto usado em listas, PDFs e evidências. Padrão do projeto: MUN-CURSO-NN (município abreviado, curso, número sequencial).",
    exemplo: "BET-MC-01 (Betim · Mulheres Conectadas · turma 01) · JUA-TI-02",
  },
  "turma.ch": {
    id: "turma.ch",
    modulo: "turmas",
    titulo: "Carga horária (CH)",
    explicacao:
      "Cada turma tem 150h no total: 40h de módulos básicos + 110h específicos (Programadora Web ou Técnica em Suporte de TI), conforme CODEFAT 995/2024.",
    exemplo: "CH total = 150h · 40h básicos + 110h específicos",
  },
  "turma.vagas": {
    id: "turma.vagas",
    modulo: "turmas",
    titulo: "Vagas ofertadas",
    explicacao:
      "Número de matrículas efetivas previstas. Meta total do projeto: 600 beneficiárias na proposta TransfereGov 058916/2025.",
    exemplo: "25 vagas por turma",
  },
  "turma.local": {
    id: "turma.local",
    modulo: "turmas",
    titulo: "Local (polo) da turma",
    explicacao:
      "Selecione um dos polos cadastrados. Cada polo tem responsável, endereço e infraestrutura verificada nas visitas técnicas da 2ª etapa.",
    exemplo: "SINE Betim · Pedreira Padre Lopes · CPC Frei Estanislau",
  },
  "frequencia.presenca": {
    id: "frequencia.presenca",
    modulo: "pedagogico",
    titulo: "Registro de presença",
    explicacao:
      "Marque P (presente) ou F (falta) por aluna e por aula. Frequência mínima exigida para certificação: 75% da carga horária. A lista física assinada é a evidência oficial da aula.",
    exemplo: "20 aulas · aluna com 5 faltas = 75% (limite). 6 faltas = reprovação por frequência.",
    rota_ajuda: "/ajuda?g=pedagogico",
  },
  "aula.conteudo": {
    id: "aula.conteudo",
    modulo: "pedagogico",
    titulo: "Conteúdo programático",
    explicacao:
      "Descreva o que foi trabalhado na aula. Aparece na Relação de Horas do(a) professor(a) e nos relatórios DEQ, comprovando o cumprimento do plano de curso.",
    exemplo: "'Direitos humanos e cidadania (2h) + Comunicação e relações interpessoais (2h)'",
  },
  "evidencia.pmq": {
    id: "evidencia.pmq",
    modulo: "pedagogico",
    titulo: "Identificação PMQ",
    explicacao:
      "PMQ = 'Programa Mulheres Conectadas / QUINTA ARTE'. É OBRIGATÓRIA a identificação visual do programa em toda evidência (banner, tarja, logos MTE + FAT + QUINTA ARTE). Marque apenas quando o arquivo enviado já traz essa identificação.",
    exemplo: "Foto da sala com banner PMQ ao fundo ✅ · Foto sem nenhuma marca do programa ❌",
  },
  "evidencia.tipo": {
    id: "evidencia.tipo",
    modulo: "pedagogico",
    titulo: "Tipo de comprovação",
    explicacao:
      "Lista de presença = PDF assinado pelas alunas + professor (comprovação oficial da aula). Registro fotográfico = foto do momento da aula, com identificação PMQ.",
    exemplo: "Lista de presença · Registro fotográfico",
  },
  "evidencia.sei_transferegov": {
    id: "evidencia.sei_transferegov",
    modulo: "mte",
    titulo: "SEI e TransfereGov",
    explicacao:
      "SEI é o Sistema Eletrônico de Informações do MTE — recebe os documentos oficiais do Termo de Fomento. TransfereGov é a plataforma federal onde a proposta 058916/2025 tramita e onde a prestação de contas é anexada.",
    exemplo: "SEI 19964.100XXX/2025-XX · TransfereGov proposta 058916/2025",
  },
  "relacao.assinatura_digital": {
    id: "relacao.assinatura_digital",
    modulo: "financeiro",
    titulo: "Assinatura digital do professor",
    explicacao:
      "Ao assinar, o sistema gera um hash SHA-256 do documento e registra data/hora + IP. A relação vai para o financeiro em modo somente-leitura e não pode ser alterada depois.",
    exemplo: "'Assinado digitalmente por Maria Silva em 05/08/2026 14:32 — hash 9f3ac1b7…'",
    rota_ajuda: "/ajuda?g=financeiro",
  },
  "relacao.multi_turma": {
    id: "relacao.multi_turma",
    modulo: "financeiro",
    titulo: "Multi-turma no mesmo dia",
    explicacao:
      "Quando o(a) professor(a) dá aulas em turmas diferentes no mesmo dia (manhã + tarde/noite), o sistema calcula: entrada, saída para almoço, retorno, saída — sem contar o intervalo como hora trabalhada.",
    exemplo: "08:00–12:00 (Turma A) + 13:30–17:30 (Turma B) = 8h; almoço 12:00–13:30 não conta.",
  },
  "relacao.local": {
    id: "relacao.local",
    modulo: "financeiro",
    titulo: "Local de trabalho",
    explicacao:
      "Herdado do polo da turma. Quando há mais de um polo no mês, cada dia registra o local correspondente e o PDF gera uma linha de assinatura 'Responsável pelo local' por polo distinto.",
    exemplo: "SINE Betim (manhã) · Pedreira Padre Lopes (noite)",
  },
  "cotacoes.tres": {
    id: "cotacoes.tres",
    modulo: "financeiro",
    titulo: "Regra das 3 cotações",
    explicacao:
      "Todo item contratado com recurso do Termo de Fomento exige NO MÍNIMO 3 cotações comparáveis (mesmo escopo, mesmo período). É a base da economicidade e ausência dela reprova a prestação de contas.",
    exemplo: "Gráfica: cotação 1 (R$ 4.800), cotação 2 (R$ 5.200), cotação 3 (R$ 5.900) — escolhida a menor.",
  },
  "cotacoes.escolha": {
    id: "cotacoes.escolha",
    modulo: "financeiro",
    titulo: "Escolha da cotação",
    explicacao:
      "Regra padrão: menor preço. Quando não for o menor, JUSTIFIQUE por escrito (qualidade, prazo, exclusividade). A justificativa é anexada ao processo SEI e ao TransfereGov.",
    exemplo: "'Escolhida a 2ª cotação por prazo de entrega compatível com o cronograma pedagógico.'",
  },
  "financeiro.despesa": {
    id: "financeiro.despesa",
    modulo: "financeiro",
    titulo: "Registro de despesa",
    explicacao:
      "Toda despesa exige: NF/recibo em nome da entidade, comprovante de pagamento (PIX/TED bancário), vínculo com rubrica aprovada e as 3 cotações. Sem esses 4 elementos a despesa é glosada.",
    exemplo: "NF-e 000123 · TED Bradesco 10/08/2026 · Rubrica: Material didático · 3 cotações anexadas",
  },
  "relatorios.deq": {
    id: "relatorios.deq",
    modulo: "relatorios",
    titulo: "Relatório DEQ / Parcial de Objeto",
    explicacao:
      "DEQ é o Diagnóstico de Execução Qualificada. Estrutura obrigatória: item IV (execução do objeto), item V (metas quantitativas), item VI (resultados alcançados). Precisa ser gerado em PDF pesquisável (texto selecionável, não imagem).",
    exemplo: "IV — 6 turmas executadas · V — 128 formadas / 150 previstas · VI — 82% taxa de conclusão",
  },
  "relatorios.frequencia_minima": {
    id: "relatorios.frequencia_minima",
    modulo: "relatorios",
    titulo: "Frequência mínima 75%",
    explicacao:
      "Para certificação e para contar como beneficiária concluinte no DEQ, a aluna precisa de pelo menos 75% de presença. Abaixo disso ela é 'evadida' ou 'reprovada por frequência'.",
    exemplo: "150h × 75% = 112,5h mínimas de presença",
  },
  "etapas.status": {
    id: "etapas.status",
    modulo: "etapas",
    titulo: "Status da etapa",
    explicacao:
      "Planejada = ainda não iniciada. Em andamento = executando. Prestação de contas = execução concluída e documentação sendo montada. Concluída = prestação aprovada.",
    exemplo: "1ª etapa · prestação de contas (documentação sendo organizada até 04/08).",
  },
  "etapas.prazo": {
    id: "etapas.prazo",
    modulo: "etapas",
    titulo: "Prazo da atividade",
    explicacao:
      "Data limite para conclusão. Ao passar da data sem status = concluída, a atividade aparece em vermelho (atrasada) e alimenta o alerta do Orbe.",
    exemplo: "'Aprovar orçamentos — prazo 04/08/2026' (venceu ontem → atrasada)",
  },
  "importacao.lista_pdf": {
    id: "importacao.lista_pdf",
    modulo: "mte",
    titulo: "Importar lista de presença (PDF)",
    explicacao:
      "Envie o PDF assinado da aula. O sistema identifica turma, data, CPFs e presenças automaticamente. PDF pesquisável (texto) é lido direto; imagem passa por OCR (leva mais tempo).",
    exemplo: "'Lista BET-MC-01 · 12/08/2026' → sistema identifica 22 CPFs, 20 presentes / 2 faltas.",
  },
  "importacao.moodle": {
    id: "importacao.moodle",
    modulo: "mte",
    titulo: "Importar do Moodle (AVA)",
    explicacao:
      "Sincroniza matrículas, cursos e progresso do AVA (Moodle) com o painel. Divergências (aluna no AVA mas não no painel) aparecem na aba 'AVA · Divergências'.",
  },
};

// ---------------------------------------------------------------------------
// Guias da página /ajuda
// ---------------------------------------------------------------------------

export type Passo = { titulo: string; detalhe?: string };
export type Guia = {
  slug: string;
  titulo: string;
  resumo: string;
  publico: string[];
  passos: Passo[];
  regras: string[];
  erros_comuns?: string[];
};

export const GUIAS: Guia[] = [
  {
    slug: "primeiros-passos",
    titulo: "Primeiros passos",
    resumo: "Como se orientar no painel Mulheres Conectadas.",
    publico: ["todos"],
    passos: [
      { titulo: "Login", detalhe: "Entre com seu e-mail cadastrado. Se for o 1º acesso, defina uma nova senha ao entrar." },
      { titulo: "Visão Geral", detalhe: "Cards no topo mostram cursistas, turmas, execução orçamentária e pendências. O card 'Etapa atual' mostra o progresso da etapa em execução." },
      { titulo: "Menu lateral", detalhe: "Cada módulo (Pedagógico, MTE, Financeiro, etc.) aparece conforme seu papel. O 'Orbe' (bola azul no canto inferior direito) responde perguntas sobre o projeto e sobre o sistema." },
      { titulo: "Contexto ativo", detalhe: "No topo, o nome do projeto ativo aparece. Se você tem acesso a mais de um projeto, é possível trocar por lá." },
    ],
    regras: [
      "Toda tela mostra apenas dados do seu projeto ativo.",
      "Ícone '?' ao lado de um campo abre a ajuda daquele campo (com exemplo e link para o Orbe).",
    ],
  },
  {
    slug: "pedagogico",
    titulo: "Pedagógico — aulas, frequência, comprovações",
    resumo: "Rotina do coordenador pedagógico e do professor.",
    publico: ["coordenador_pedagogico", "professor", "auxiliar_pedagogico"],
    passos: [
      { titulo: "Cadastrar turma", detalhe: "Pedagógico → Turmas → 'Nova turma'. Informe código (ex.: BET-MC-01), curso, CH (150h), local (polo) e datas." },
      { titulo: "Matricular alunas", detalhe: "Turma → Cursistas → 'Adicionar cursista'. Busque pelo CPF; se não existir, cadastre a beneficiária com CPF, data de nascimento, raça/cor, PCD, NIS e programa social." },
      { titulo: "Registrar aula", detalhe: "Turma → Aulas → 'Nova aula'. Registre data, horários, conteúdo programático e CH." },
      { titulo: "Marcar frequência", detalhe: "Turma → Frequência. Para cada aluna e cada aula, marque P (presente) ou F (falta). Mínimo 75% para certificação." },
      { titulo: "Anexar comprovação", detalhe: "Aula → 'Comprovação'. Envie a lista assinada em PDF e/ou foto da aula. Marque 'contém identificação PMQ' quando o arquivo já traz banner/tarja do programa." },
    ],
    regras: [
      "Frequência mínima: 75% da CH total (150h → 112,5h).",
      "Identificação PMQ (banner/logos MTE+FAT+QUINTA ARTE) é obrigatória em toda foto de aula.",
      "Lista de presença deve estar assinada por TODAS as presentes e pelo(a) professor(a).",
      "PDF de lista precisa ser pesquisável (texto selecionável) — se for foto/scan puro, o OCR reduz a confiabilidade.",
    ],
    erros_comuns: [
      "Foto sem identificação PMQ → aula não conta como evidência oficial.",
      "Aluna sem CPF cadastrado → matrícula não pode ser efetivada.",
      "Aula sem conteúdo programático preenchido → Relação de Horas do professor sai incompleta.",
    ],
  },
  {
    slug: "mte",
    titulo: "MTE / fiscalização — DEQ, SEI e TransfereGov",
    resumo: "O que o MTE exige e onde cada documento entra.",
    publico: ["coordenador_geral", "administrativo", "coordenador_pedagogico"],
    passos: [
      { titulo: "Organizar beneficiárias", detalhe: "MTE → Beneficiárias. Cada aluna tem CPF único, autodeclaração de raça/cor, PCD e situação social. Esses campos alimentam os indicadores DEQ." },
      { titulo: "Turmas e matrículas", detalhe: "MTE → Matrículas. Vincule beneficiárias a turmas. A meta total do projeto é 600 (proposta TransfereGov 058916/2025)." },
      { titulo: "Importar lista PDF", detalhe: "MTE → Importar Lista (PDF). Envie o PDF assinado; o sistema identifica CPFs e presenças. Confirme antes de gravar." },
      { titulo: "Evidências", detalhe: "MTE → Evidências. Lista de presença + registro fotográfico por aula. Cada arquivo é marcado como contendo (ou não) a identificação PMQ." },
      { titulo: "Checklist fiscalização", detalhe: "MTE → Checklist. Painel de conferência do que o fiscal pede antes da visita/prestação." },
    ],
    regras: [
      "SEI é o processo eletrônico oficial no MTE — todo documento formal deve ser lançado lá.",
      "TransfereGov é a plataforma federal onde a proposta 058916/2025 tramita.",
      "Relatório DEQ / Parcial de Objeto exige itens IV, V e VI preenchidos, em PDF pesquisável.",
      "Toda evidência precisa da identificação PMQ (banner + logos MTE/FAT/QUINTA ARTE).",
    ],
    erros_comuns: [
      "Anexar imagem escaneada como 'PDF pesquisável' → o texto não é lido; refazer com OCR/exportação de texto.",
      "Enviar lista de presença sem assinatura do professor.",
    ],
  },
  {
    slug: "financeiro",
    titulo: "Financeiro — cotações, despesas, relação de horas",
    resumo: "Regra das 3 cotações, despesas e prestação de contas.",
    publico: ["coordenador_geral", "administrativo", "gestor_financeiro"],
    passos: [
      { titulo: "Cadastrar cotações", detalhe: "Financeiro → Cotações. Para cada item (gráfica, professor, motorista, veículo, coordenação), registre 3 cotações comparáveis." },
      { titulo: "Escolher cotação", detalhe: "Aprove a menor (padrão) ou justifique por escrito quando escolher outra." },
      { titulo: "Lançar despesa", detalhe: "Financeiro → Despesas. Anexe NF/recibo em nome da entidade, comprovante de pagamento (TED/PIX bancário) e vincule à rubrica correta." },
      { titulo: "Relação de horas", detalhe: "Cada professor gera a Relação de Horas do mês, revisa, assina digitalmente e envia. O financeiro aprova e paga." },
    ],
    regras: [
      "3 cotações comparáveis são obrigatórias antes de contratar qualquer serviço.",
      "NF/recibo SEMPRE em nome da entidade (QUINTA ARTE), nunca em nome pessoal.",
      "Pagamento sempre por TED/PIX bancário rastreável — dinheiro em espécie é glosado.",
      "Assinatura digital do professor gera hash SHA-256 e trava a Relação de Horas em somente-leitura.",
    ],
    erros_comuns: [
      "Cotação com escopo diferente entre as 3 propostas → não conta como comparável.",
      "Pagamento em espécie ou para pessoa física sem contrato → glosa certa na prestação.",
    ],
  },
  {
    slug: "etapas",
    titulo: "Etapas do projeto",
    resumo: "Como o app organiza o projeto em etapas e atividades.",
    publico: ["todos"],
    passos: [
      { titulo: "Ver etapas", detalhe: "Sidebar → Etapas do Projeto. Cada cartão mostra período, status e % concluído." },
      { titulo: "Abrir detalhe", detalhe: "Clique na etapa. Atividades agrupam-se por área (Administração, Orçamentos, Infraestrutura, AVA, Matrículas…)." },
      { titulo: "Concluir atividade", detalhe: "Marque o checkbox. O sistema grava quem concluiu e quando. Atividades com prazo vencido pendentes aparecem em vermelho." },
      { titulo: "Adicionar atividade", detalhe: "Coordenação → botão '+ Atividade' na etapa." },
    ],
    regras: [
      "1ª etapa (mai/2026–jul/2026): execução das 6 turmas Betim/Juatuba — hoje em prestação de contas.",
      "2ª etapa (21/07–05/09): preparação e matrículas do Ciclo 2 (7 novos polos, meta 600).",
    ],
  },
  {
    slug: "relatorios",
    titulo: "Relatórios",
    resumo: "Como gerar frequência, DEQ, Parcial de Objeto e financeiro.",
    publico: ["coordenador_geral", "administrativo", "coordenador_pedagogico", "gestor_financeiro"],
    passos: [
      { titulo: "Frequência", detalhe: "Relatórios → Frequência. Escolha turma e período; o PDF gera a lista com % por aluna e o resumo por turma." },
      { titulo: "Parcial de Objeto (DEQ)", detalhe: "Relatórios → Parcial de Objeto. Preenche itens IV/V/VI com dados reais do painel e gera PDF pesquisável." },
      { titulo: "MTE / Fiscalização", detalhe: "Relatórios → MTE. Compilado das evidências, matrículas e frequência exigidos na fiscalização." },
      { titulo: "Orçamentário", detalhe: "Relatórios → Orçamentário. Previsto × executado por rubrica." },
    ],
    regras: [
      "Todos os PDFs oficiais são pesquisáveis (texto).",
      "DEQ usa itens IV (execução), V (metas), VI (resultados) — a estrutura é obrigatória.",
    ],
  },
  {
    slug: "ava",
    titulo: "AVA (Moodle)",
    resumo: "Sincronização e divergências entre painel e AVA.",
    publico: ["coordenador_geral", "administrativo", "coordenador_pedagogico"],
    passos: [
      { titulo: "Importar cursos do AVA", detalhe: "MTE → AVA. Traz cursos/turmas do Moodle e sugere vínculo com turmas do painel." },
      { titulo: "Gerar matrículas AVA", detalhe: "Card 'Gerar matrículas AVA' → cria automaticamente a matrícula das alunas do painel no curso Moodle vinculado." },
      { titulo: "Divergências", detalhe: "Divergências (aluna no AVA sem matrícula no painel, ou vice-versa) aparecem em uma tabela dedicada." },
    ],
    regras: [
      "Antes do início das aulas do Ciclo 2 (2ª etapa): configurar AVA, cadastrar professores, cadastrar turmas, subir materiais e testar acesso das alunas.",
    ],
  },
  {
    slug: "papeis",
    titulo: "Perfis e permissões",
    resumo: "O que cada papel enxerga no painel.",
    publico: ["todos"],
    passos: [
      { titulo: "Coordenação Geral / Administrativo", detalhe: "Acesso total: Pedagógico, MTE, Financeiro, Captação, Relatórios, Configurações, Base de Conhecimento, Drive, Etapas." },
      { titulo: "Gestão Financeira", detalhe: "Financeiro (despesas, cotações, relações de horas), Captação e Relatórios financeiros." },
      { titulo: "Coordenação Pedagógica", detalhe: "Pedagógico, MTE, Relatórios pedagógicos, WhatsApp, Etapas." },
      { titulo: "Professor(a) / Auxiliar", detalhe: "Pedagógico das próprias turmas, Relação de Horas própria, Base de Conhecimento." },
    ],
    regras: [
      "As permissões são aplicadas nas telas E no banco (RLS) — não é possível burlar pelo navegador.",
      "Papéis dependem de vínculo no projeto; se você não vê um módulo esperado, peça à coordenação para revisar seu papel em Configurações → Usuários.",
    ],
  },
];

export type Faq = { pergunta: string; resposta: string };

export const FAQ: Faq[] = [
  { pergunta: "Qual é a frequência mínima para certificar a aluna?", resposta: "75% da carga horária total. Em uma turma de 150h, isso equivale a 112,5h de presença." },
  { pergunta: "Preciso mesmo de 3 cotações para tudo?", resposta: "Sim. É requisito do Termo de Fomento e do MTE. Sem 3 cotações comparáveis a despesa é glosada." },
  { pergunta: "O que é PMQ e por que preciso marcar 'contém PMQ'?", resposta: "PMQ = 'Programa Mulheres Conectadas / QUINTA ARTE'. Toda evidência (foto/lista) precisa mostrar a identificação visual do programa (banner + logos MTE+FAT+QUINTA ARTE). O sistema separa evidências com e sem PMQ porque só as com PMQ contam para o DEQ." },
  { pergunta: "Como funciona a assinatura digital da Relação de Horas?", resposta: "Ao assinar, geramos hash SHA-256 do PDF + carimbo de data/hora + IP. A Relação vira somente-leitura e vai para o financeiro aprovar." },
  { pergunta: "Um professor dá aulas de manhã e à tarde no mesmo dia. Como registrar?", resposta: "A Relação de Horas identifica automaticamente cada turma do dia e registra: entrada, saída para almoço, retorno e saída. O intervalo NÃO é contabilizado." },
  { pergunta: "O que é o DEQ / Parcial de Objeto?", resposta: "Diagnóstico de Execução Qualificada. É o relatório oficial de prestação de contas ao MTE, com itens IV (execução), V (metas) e VI (resultados). O sistema gera em PDF pesquisável." },
  { pergunta: "SEI e TransfereGov são a mesma coisa?", resposta: "Não. SEI é o processo eletrônico interno do MTE (documentos formais). TransfereGov é a plataforma federal onde a proposta 058916/2025 tramita e onde a prestação de contas é anexada." },
  { pergunta: "Não estou vendo o módulo Financeiro. Por quê?", resposta: "Provavelmente seu papel não inclui Financeiro. Peça à coordenação para revisar em Configurações → Usuários. As permissões são aplicadas no banco (RLS), não só na tela." },
  { pergunta: "O que preciso ter pronto até 04/08 (2ª etapa)?", resposta: "Aprovação dos orçamentos, validação dos contratos, documentação da 1ª etapa organizada, planejamento da entrega dos kits e conferência final das pendências." },
  { pergunta: "Como faço para o Orbe me ajudar em uma tela específica?", resposta: "Clique no ícone '?' ao lado do campo/seção e escolha 'Perguntar ao Orbe'. Ele já abre com a pergunta pré-preenchida e sabe qual tela você está usando." },
  { pergunta: "Onde vejo o progresso da etapa atual?", resposta: "Na Visão Geral tem o card 'Etapa atual' com barra de progresso e próximos 7 dias. Para detalhe, abra a página 'Etapas do Projeto'." },
];

export function buscarAjuda(termo: string): { entries: AjudaEntry[]; guias: Guia[]; faq: Faq[] } {
  const q = termo.trim().toLowerCase();
  if (!q) return { entries: [], guias: GUIAS, faq: FAQ };
  const match = (s?: string) => (s ? s.toLowerCase().includes(q) : false);
  const entries = Object.values(AJUDA).filter(
    (e) => match(e.titulo) || match(e.explicacao) || match(e.exemplo),
  );
  const guias = GUIAS.filter(
    (g) => match(g.titulo) || match(g.resumo)
      || g.passos.some((p) => match(p.titulo) || match(p.detalhe))
      || g.regras.some(match),
  );
  const faq = FAQ.filter((f) => match(f.pergunta) || match(f.resposta));
  return { entries, guias, faq };
}
