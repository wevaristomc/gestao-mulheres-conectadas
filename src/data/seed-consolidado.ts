// Seed consolidado — Programa Manuel Querino / Mulheres Conectadas
// Termo de Fomento MTE/SEMP 01025/2025 · Executora QUINTA ARTE
// Ciclo 1 (2026), meta = 300 educandas, início 2026-05-09.
//
// Este arquivo é a fonte da verdade para a importação consolidada QAJBC.

import { onlyDigits } from "@/lib/cpf";
// O CSV está embutido como template literal para manter tudo em um único
// deploy, sem depender de leitura de arquivos externos.

export type SeedTurma = {
  codigo_turma: string;
  municipio: "Betim" | "Juatuba";
  turno: "Manhã" | "Tarde" | "Noite";
  horario_realizacao: string;
};

export const NOME_CURSO_CONSOLIDADO =
  "Mulheres Conectadas – Formação em Tecnologia e Inovação Digital";

export const TURMAS_SEED: SeedTurma[] = [
  { codigo_turma: "BET-MC-01", municipio: "Betim",   turno: "Manhã", horario_realizacao: "08:00 às 12:00" },
  { codigo_turma: "BET-MC-02", municipio: "Betim",   turno: "Noite", horario_realizacao: "18:00 às 22:00" },
  { codigo_turma: "BET-MC-03", municipio: "Betim",   turno: "Noite", horario_realizacao: "18:00 às 22:00" },
  { codigo_turma: "JBT-MC-01", municipio: "Juatuba", turno: "Manhã", horario_realizacao: "08:00 às 12:00" },
  { codigo_turma: "JBT-MC-02", municipio: "Juatuba", turno: "Tarde", horario_realizacao: "13:00 às 17:00" },
  { codigo_turma: "JBT-MC-03", municipio: "Juatuba", turno: "Noite", horario_realizacao: "18:00 às 22:00" },
];

export type SeedProfessor = {
  nome: string;
  email: string;
  turmas: string[]; // códigos das turmas
};

export const PROFESSORES_SEED: SeedProfessor[] = [
  { nome: "Evandro Ornelas Mineiro",                       email: "evandro_ornelas@yahoo.com.br", turmas: ["BET-MC-01"] },
  { nome: "Wagner Prado de Oliveira",                      email: "teclife.info@gmail.com",       turmas: ["BET-MC-02"] },
  { nome: "Luiz Felipe dos Passos Campos do Nascimento",   email: "lucampos919@gmail.com",        turmas: ["BET-MC-03"] },
  { nome: "Weverton de Menezes Costa Evaristo",            email: "wevaristomc@gmail.com",        turmas: ["JBT-MC-01", "JBT-MC-02"] },
  { nome: "Vinícius Neisser Romanelli",                    email: "vinicciusromanelli@gmail.com", turmas: ["JBT-MC-03"] },
];

export type SeedAluna = {
  turma: string;
  nome: string;
  cpf_raw: string;      // como veio no CSV (pode ter tamanho ≠ 11)
  cpf: string;          // apenas dígitos
  cpf_valido: boolean;  // true se tem 11 dígitos
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  assinou_lista: boolean;
  observacao_csv: string | null;
  ava_moodle_id: number | null;
};

// CSV bruto — turma;nome;cpf;banco;agencia;conta;assinou_lista;observacao;ava_moodle_id
const CSV_ALUNAS = `turma;nome;cpf;banco;agencia;conta;assinou_lista;observacao;ava_moodle_id
BET-MC-01;Adriane Maria Ovídio;06047097650;Caixa;536;7739713857;0;;
BET-MC-01;Ana Barbara Almeida Fidelis;12670849601;;;;0;não tem dados e não atendeu contato;11
BET-MC-01;Ana Luiza Alves da Silvaa;16715512655;;;;0;não tem dados e não atendeu contato;12
BET-MC-01;Carla Mara Fernandes;97529885634;Pag Seguro;Ag0001;4816692-0;1;;13
BET-MC-01;Cristian Kelly Felix da Silva;15516977690;Bradesco;1463;364616;0;;15
BET-MC-01;Daiane Domingos Marinho;09429839632;;;;0;não tem dados e disse não estar no curso;16
BET-MC-01;Daniele Cristina Alves dos Santos;06670845685;Pan;ag0001;016284118-5;1;;17
BET-MC-01;Ducilena Rodrigues de Almeida Silva;06528829608;Unibanco;3195;33415-0;1;;18
BET-MC-01;Emanuele dos Santos Queiroz;70306937603;inter;ag001;28956293-7;0;;19
BET-MC-01;Eunice Jesus Lima Costa;07337356650;Pic Pay;ag0001;77402448-8;1;;20
BET-MC-01;Eyshila Nicole Leopoldino de Araujo;70563437677;Nu;ag0001;34911709-1;1;;21
BET-MC-01;Franciele Alves Rodrigues;19108156670;Cloudwalk;ag0001;23949127-0;1;;22
BET-MC-01;Francislaine dos Santos;11744938601;Pic Pay;ag0001;110243522-8;1;;23
BET-MC-01;Gecilene Pereira Lima de Oliveira;02056762609;Caixa;3730;572185994-2;1;;24
BET-MC-01;Jessica Moreira Soares;13525022670;Caixa;ag0892;856177752-2;0;;25
BET-MC-01;Joseane Alves Rodrigues;10594633699;Nu;ag0001;4378435-0;1;;26
BET-MC-01;Júlia Vitória Costa Lopes;15320508603;Nu;ag0001;948388468-0;0;;27
BET-MC-01;Liliane dos Reis Aguiar Ferreira;06807843658;Nu;ag0001;948388468-0;0;;28
BET-MC-01;Lorena Gonçalves Nogueira dos Anjos;15497628699;Nu;ag0001;6011840-5;1;;29
BET-MC-01;Marli Eliane de Moura Moisés;93746881668;Caixa;ag0892;773840571-7;1;;30
BET-MC-01;Michele Lucia de Almeida;12432980654;Nu;ag0001;25859793-7;0;;31
BET-MC-01;Miriam Alves de Lima;96894350604;Nu;ag0001;8773005-8;0;;32
BET-MC-01;Miriam Lucia Cordeiro de Almeida;11967700699;Nu;ag0001;43474346-8;1;;33
BET-MC-01;Nadielle Alves Ribeiro da Silva;09153661699;Caixa;3527;773337737-5;0;;34
BET-MC-01;Regilene Gil do Amaral;05919145650;Nu;ag0001;12445417-9;0;;35
BET-MC-01;Renata Vitória de Almeida Ribeiro;15668734609;Nu;ag0001;692567539-4;0;;36
BET-MC-01;Rita de Cassia Rodrigues Lopes;08022548618;;;;0;não tem dados e não atendeu contato;37
BET-MC-01;Rosemery Nascimento de Almeida;08285884651;Caixa;2837;772218844-4;1;;38
BET-MC-01;Stefania Vitoria Fernandes;70135492661;Inter;ag0001;34321117-3;1;;39
BET-MC-01;Tays Felix da Silva;11157125603;Pic Pay;ag0001;37782409-7;0;;40
BET-MC-01;Thamires Gonçalves Santos;17077127605;Inter;ag0001;35884963-2;0;;41
BET-MC-01;Valéria Mara de Oliveira Mantovani;99717514615;;;;0;não tem dados e não atendeu contato;42
BET-MC-01;Vanessa Juliane Costa Lopes;11953699642;Caixa;ag0893;58371-3;0;;43
BET-MC-02;Ana Cristina do Carmo;06305427674;;;;0;não tem dados e não atendeu contato;240
BET-MC-02;Ana Luiza Nogueira dos Santos;19273674682;;;;0;nao tem dados e não atendeu contato;241
BET-MC-02;Ana Mara Rodrigues Silva;16474842865;Santander;3488;20458914;0;;242
BET-MC-02;Camila Cristina Campos da Silva;10145687651;Nu;ag0001;96445712-2;1;;246
BET-MC-02;Cintia Cristina Campos do Nascimento;10145235670;;Nu;Ag0001;1;;14
BET-MC-02;Claudiane Camila da Silva;10608305669;Itau;3826;50594-7;1;;245
BET-MC-02;Cleuza Angela Domingos dos Santos;00732474689;Nu;ag0001;32625011-9;1;;244
BET-MC-02;Cristiane Paula de Souza;08202232635;Itau;6505;46808-9;0;;196
BET-MC-02;Danielli Cangussu Vieira dos Santos;12158882603;Caixa;3880;842863144-0;0;;248
BET-MC-02;Edna Aparecida Costa;42847893253;Bradesco;2146;491399-0;0;;250
BET-MC-02;Edna Aparecida da Silva Freires;75304830644;Caixa;ag0892;588843275-6;0;;199
BET-MC-02;Eliane Araujo de Paula da Silva;07577134678;Caixa;ag0892;8344188383;0;;252
BET-MC-02;Elismary Colares Pereira;65953703368;Cora;ag0001;6154048-4;0;;253
BET-MC-02;Emanuelle Soares Bandeira;02034898613;Inter;ag0001;28956293-7;0;;202
BET-MC-02;Fabiana Paula da Silva;07518475693;Itau;1335;69288-3;0;;255
BET-MC-02;Gabriely Rodrigues Pires;07484964670;Nu;ag0001;53716004-8;0;;256
BET-MC-02;Glaucia Menezes Alves;01398909637;Nu;ag0001;56529031-1;0;;257
BET-MC-02;Irlene Alves dos Santos;03341207643;Inter;ag0001;17639581-4;0;;258
BET-MC-02;Ivanete Pereira de Oliveira;09406201623;Inter;ag0001;15334809-7;1;;259
BET-MC-02;Janete de Oliveira;05195372624;Nu;ag0001;61052063-3;0;;260
BET-MC-02;Julia Bramanto dos Santos;18589633624;Nu;ag0001;440381964-9;0;;261
BET-MC-02;Kelle das Graças de Oliveira Santos;08900185616;Caixa;ag0892;69590-7;0;;262
BET-MC-02;Lorrani Suelen Oliveira Marcelino;15694824628;;;;0;não tem dados e não atendeu contato;211
BET-MC-02;Maria Eduarda Hemenegildo Brum;01966206607;Inter;ag0001;27109363-3;0;;216
BET-MC-02;Maria Eduarda Silva de Souza;12356104623;Nu;ag0001;95920780-9;0;;264
BET-MC-02;Maria Emilia Cardoso;09360870641;inter;ag0001;37424500-2;0;;217
BET-MC-02;Maria Isabel de Souza Gonçalves;08124994684;Nu;ag0001;52770786-1;0;;266
BET-MC-02;Mauricia Queiroz Euzebio;14811778693;Caixa;3880;946828174-0;0;;220
BET-MC-02;Michelle Cristina Paixão Soares;08841183632;Inter;ag0001;25606146-7;0;;269
BET-MC-02;Natalia Cristine Marinho Leite;12748797604;Caixa;3730;569042384-6;0;;270
BET-MC-02;Nayra Gonçalves Soares;09714095603;Sicred;ag0434;00099018-4;0;;271
BET-MC-02;Patricia Helena Duguet Coelho;00366089633;Bradesco;1806-6;1000741-0;1;;223
BET-MC-02;Regina Maria de Almeida;02670422697;;;;0;nao tem dados e não atendeu contato;275
BET-MC-02;Rejane Marta Maria da Silva;00546471661;;;;0;não tem dados e não atendeu contato;276
BET-MC-02;Renilde Dias;11494733633;Caixa;3814;8512269560;0;;274
BET-MC-02;Rosalia Eduarde Pereira;76486524634;Caixa;2837;774681869-3;1;;227
BET-MC-02;Rosangela Maciel Silva;06114992660;Caixa;2837;7685365270;0;;273
BET-MC-02;Roseli Rodrigues Porto Andrade;03794588614;Nu;ag0001;57783262-6;0;;277
BET-MC-02;Sabrina Souza Borges;01819753603;Santarder;3058;10991912;0;;279
BET-MC-02;Sara Luisa da Silva;16776009694;Caixa;1530;7748820067;0;;280
BET-MC-02;Silvana Pacheco Marinho;09106160603;Caixa;1629;83795668796;0;;281
BET-MC-02;Simone Apolinária Rodrigues;84256257691;Santander;3488;01085745-1;0;;283
BET-MC-02;Simone Maria Nascimento Silva;06252759694;;;;0;nao tem dados e não atendeu contato;282
BET-MC-02;Simone Mendes Silva;06252759694;;;;0;não tem dados e não atendeu contato;284
BET-MC-02;Simone Regina Massi de Oliveira;08949475677;Inter;ag0001;1370495-8;1;;285
BET-MC-02;Sueli Silva Domingos dos Santos;03623305650;Itau;7893;16621-0;1;;231
BET-MC-02;Valéria Dias Nonato;13282191600;Mercado Pago;ag0001;25626530524;1;;287
BET-MC-03;Amanda Priscila Avelino;10506946606;Itau;3195;18382-1;1;;193
BET-MC-03;Ana Helena Barboza da Gama;87600560615;Santander;ag0946;01007940-6;1;;194
BET-MC-03;Andrezza Marci Elisiario;03116171661;Caixa;1640;753637984;1;;288
BET-MC-03;Aysla Caroline dos Reis Furtado;14876251622;Inter;ag0001;28686038-4;1;;195
BET-MC-03;Bianca Rodrigues dos Santos Rocha;05400278639;Caixa;ag0083;826848119-4;1;;289
BET-MC-03;Celia Maria da Costa;91958458600;Banco do Brasil;ag07501;11584-3;1;;290
BET-MC-03;Desire Oliveira Silva;01370164688;Caixa;ag0892;768930191-7;1;;197
BET-MC-03;Dilma Batista dos Santos;06898027816;Caixa;ag0892;588847415-7;1;;198
BET-MC-03;Edna Aparecida da Silva Freires;75304830644;Caixa;ag0892;588843275-6;1;;199
BET-MC-03;Ednalva Luiz de Jesus;04434885485;Caixa;2464;772254696-0;1;;200
BET-MC-03;Elaine Rodrigues dos Anjos Costa;05835795661;Inter;ag0001;44725663-7;1;;201
BET-MC-03;Fernanda Liriel Silva Freires;02160000680;Inter;ag0001;32369383-0;1;;203
BET-MC-03;Flavia Aparecida de Lima;08134115640;;;;0;não tem dados e não atendeu contato;204
BET-MC-03;Flavia Rodrigues da Silva Souza;00155115618;Banco C6;ag0001;1012568-0;1;;205
BET-MC-03;Geisa Bruna Bernardes Oliveira Silva;09311957640;Inter;ag0001;5579834-9;1;;206
BET-MC-03;Gislei Fatima de Freitas Moreira;99659018649;Banco do Brasil;2115-6;259071;1;;207
BET-MC-03;Kamilly Vitória Paixão da Silva;70209575603;Caixa;3880;713602405-7;1;;208
BET-MC-03;Kelli Cristina Soares Porto;20621402871;Banco C6;ag0001;219332738;1;;291
BET-MC-03;Laís Isidoro Silva;70585408610;Nu;ag0001;73051025-5;1;;209
BET-MC-03;Leticia Lana de Godoi;10062237624;Santander;3058;02026515-7;1;;210
BET-MC-03;Liliane dos Reis Aguiar Ferreira;06807843658;Nu;ag0001;948388468-0;1;;28
BET-MC-03;Luciana Natalia dos Passos Campos do Nascimento;04770014678;Banco C6;ag0001;39428538-7;1;;212
BET-MC-03;Luciana Silva Morais Torres;95338802600;;;;1;não tem dados e não atendeu contato;292
BET-MC-03;Luciene Faustina Pereira;05357299609;Itau;8895;58017-6;1;;213
BET-MC-03;Marcia Julieta Silva Torres Braga;73213551600;Pic Pay;ag0001;20725669-1;1;;214
BET-MC-03;Maria Deusa Sousa dos Santos;04644613673;Caixa;ag0892;331-2;1;;215
BET-MC-03;Maria Luiza de Souza Alves;16518215690;Nu;ag0001;320661846-1;1;;218
BET-MC-03;Maria Valderez Barbosa da Gama;55578926649;Caixa;ag0892;584363307-8;1;;219
BET-MC-03;Myriam Anete Morais Torres;25749424855;Pag Seguro;ag0001;27016795-0;1;;221
BET-MC-03;Neuseli Luiz da Paixão;05505439616;Caixa;ag0892;770154066-1;1;;222
BET-MC-03;Regina Leiliana Cruza da Silva;04108543602;Caixa;2664;767374915-8;0;;225
BET-MC-03;Renata Souza Santos;08754506603;Caixa;3880;981616385-9;0;;226
BET-MC-03;Roseli Luiz da Paixão;07113642659;Caixa;ag0892;766473784-3;1;;228
BET-MC-03;Sharlene Karina de Faria Batista;06360067609;Inter;ag0001;46525769-0;1;;230
BET-MC-03;Sophia dos Santos Varobieff;10277824699;Itau;4270;70873-0;0;;293
BET-MC-03;Tatiane Ferreira da Silva;02204221686;Santander;3058;02013496-3;1;;232
BET-MC-03;Taylline Gabriele Cardoso Silva;70377248665;Nu;ag0001;64452292-5;0;;233
BET-MC-03;Tayná Aparecida Isidoro Silva;70585411670;Nu;ag0001;12828777-6;1;;234
BET-MC-03;Terezinha Paixão Soares;84148926634;Nu;ag0001;30507931-0;0;;235
BET-MC-03;Thalita Rodrigues de Souza;13055405650;Nu;ag0001;8695198-3;0;;236
BET-MC-03;Valdenice Oliveira dos Santos Marcelino;03667513607;Nu;ag0001;43798356-4;0;;237
BET-MC-03;Vanessa Soares Bandeira;11048997600;Santander;3488;1068862;0;;238
BET-MC-03;Vilma Aparecida de Barros;59230762687;Caixa;ag0892;767702737-8;1;;294
BET-MC-03;Vitória Isabelle da Paixão Martina;16113968677;Itau;8895;51843-2;1;;239
JBT-MC-01;Adriana Carla Ferreira Venancio;01397053682;Santander;0750-1;63028-4;0;;70
JBT-MC-01;Aline Marques Ventura;06527551606;Caixa;3550;755527722-1;1;;44
JBT-MC-01;Aline Rodrigues;10977974650;Nu;ag0001;83119469-1;1;;47
JBT-MC-01;Amanda Santos de Almeida;04006779208;Caixa;3880;976629877-2;1;;45
JBT-MC-01;Ana Caroline Gonçalves de Paula;12767403608;Santander;2985;02031543-4;1;;48
JBT-MC-01;Ana Cristina Dias dos Santos;06821244600;Caixa;3550;764894852-5;0;;71
JBT-MC-01;Ana Paula Mendes Fernandes;10070781621;Caixa;3550;9733-1;0;;69
JBT-MC-01;Analice Silva Rodrigues;16664387662;Nu;ag0001;69410569-5;1;;46
JBT-MC-01;Brunna Marsella Pereira Camargos;14374403639;Santander;3651;01050006-5;1;;50
JBT-MC-01;Camilly Rodrigues Pagoto;16490854600;Nu;.0001;310390251-7;1;;49
JBT-MC-01;Edimara Pessoa Silva Vital;04251380622;Caixa;3880;792123471-3;0;;73
JBT-MC-01;Elaine Albergaria Fagundes;11566842697;Caixa;3550;7696647207-1;0;;74
JBT-MC-01;Eliana Mendes;06657380640;Caixa;3550;790186707-6;1;;53
JBT-MC-01;Elizangela Vieira Rocha;08518410665;Caixa;3846;817878524-0;1;;51
JBT-MC-01;Ester Rocha da Silva;06886492624;Nu;.0001;4065787-2;0;;72
JBT-MC-01;Fabiana Batista Gomes da Rocha;05964582664;Caixa;1698;28894-3;1;;68
JBT-MC-01;Franciele Morais de Paula;18096471694;Nu;.0001;474332687-2;1;;52
JBT-MC-01;Gilsilene Isabele Silva Dias;14044042608;Santander;3651;01068959-9;1;;54
JBT-MC-01;Iris Xavier David;61796972649;Banco do Brasil;3609-9;851425-9;1;;55
JBT-MC-01;Janaína Araujo da Merces;04310151639;Inter;Ag0001;13247330-8;0;;75
JBT-MC-01;Kimberly Marcia Costa de Araujo;16510353695;Santander;3165;01081538-1;0;;76
JBT-MC-01;Lauriene Moitinho Geraldo Silva;03316708600;Inter;.0001;10153066-8;1;;56
JBT-MC-01;Leda Maria Rodrigues Silva;06059069630;Caixa;1698;825159406-3;1;;57
JBT-MC-01;Lorrany Márcia Costa de Araujo;16510342650;Santander;3058;713573929;0;;
JBT-MC-01;Madalena Conceição Felisberto;01264293674;Itau;3826;31690-7;1;;60
JBT-MC-01;Magna Cristina da Silva;99717344604;Itau;3826;45331-2;1;;62
JBT-MC-01;Maria Beatriz Leite Ferreira;70175774692;Caixa;3880;737053804-5;1;;58
JBT-MC-01;Mariana Barros de Alcantara;08824329667;Nu;.0001;19163161-7;1;;59
JBT-MC-01;Mariana da Silva Pereira;17933673619;Nu;.0001;39937913-8;0;;80
JBT-MC-01;Mariana de Souza Areda;11162323671;Itau;3195;33245-1;0;;77
JBT-MC-01;Mariane Gizelle Ribeiro;11438955685;Caixa;3550;581776522-1;0;;81
JBT-MC-01;Mary Aparecida da Rocha Silva;09245128814;Caixa;3550;772103936-4;1;;63
JBT-MC-01;Pamela Andreza Valeriano de Oliveira;13068621674;Caixa;3880;901992747-2;1;;64
JBT-MC-01;Patricia Serafina Sabina;98907212400;Itau;3155;30265-0;0;;82
JBT-MC-01;Pérola Vieira Rodrigues  - Daniel;15279521698;Pip Pay;ag0001;30577457-3;1;;
JBT-MC-01;Rosemary Marcia Costa de Araujo;00649618696;Caixa;.0893;772609615-3;0;;78
JBT-MC-01;Sara Dieini Silva Gonzaga;1067468640;Caixa;1667;17705-0;0;;83
JBT-MC-01;Sara Gabriely Silva Fonseca;02125759616;Caixa;.0892;571984149-7;0;;79
JBT-MC-01;Shylla Rodrigues Ribeiro;94027803604;Bradesco;2640;7299175-3;1;;65
JBT-MC-01;Silvania Ligia Batista Coelho;90440536634;Caixa;3550;583119871-1;0;;85
JBT-MC-01;Silvia Bartinha Alves Pereira;05732679600;Caixa;3550;22521-2;0;;84
JBT-MC-01;Simone de Souza Ferreira;04687244602;Caixa;3553;763510145-6;0;;86
JBT-MC-01;Soraia Barbosa de Souza;10165694670;Caixa;1698;757404789-9;0;;87
JBT-MC-01;Sueli Ribeiro de Andrade;09640102675;Pag Seguro;.0001;02390925-9;0;;88
JBT-MC-01;Tainara de Paula Moreira Correa;08543866618;Itau;5761;16796-8;0;;89
JBT-MC-01;Thaisa Ingrid de Freitas Santana;13881181652;Santander;3651;01058446-3;0;;90
JBT-MC-01;Tuana Silva Morais;11883754666;Caixa;3880;846788107-9;1;;66
JBT-MC-01;Vania de São José Alexandre Tavares;01081996650;Itau;3826;20759-3;1;;67
JBT-MC-02;Adriana Felicio Borges;10354560603;Caixa;1698;773595761-1;0;;129
JBT-MC-02;Ana Livia Alves Passini;15339974626;Nu;.0001;23888223-8;0;;130
JBT-MC-02;Andressa Maria Mendes Sousa;09002747608;Caixa;3550;6005-5;1;;94
JBT-MC-02;Anita Oliveira;02925977626;Pic Pay;ag0001;125350406-7;1;;127
JBT-MC-02;Beatriz Rafaela Alves de Almeida;17566749650;Inter;ag0001;35694372-0;1;;95
JBT-MC-02;Brenda Andrade de Souza;70037141678;Caixa;3550;876380417-2;1;;96
JBT-MC-02;Camila de Jesus Silva;14568498678;Caixa;3550;763512325-5;1;;97
JBT-MC-02;Cleonice Inez Batista;95622182687;Caixa;3550;858218233-1;0;;131
JBT-MC-02;Clotildes Melo de Menezes;51148820582;Banco do Brasil;4583-7;23375-7;1;;98
JBT-MC-02;Cristiane da Costa Monteiro;08161080640;Inter;.0001;3281885-8;1;;99
JBT-MC-02;Deisiane Aparecida de Paula Gualberto;08802463670;Itau;3826;40647-6;1;;128
JBT-MC-02;Elisangela Moreira de Paula;07575193693;Caixa;.0892;00135420-8;1;;100
JBT-MC-02;Emily Célia Fernandes da Silva;15806377601;Caixa;3550;569138346-5;1;;101
JBT-MC-02;Franciellen de Oliveira Felix;10664989624;Itau;3826;13537-2;1;;102
JBT-MC-02;Gelcirleia de Almeida Silva;12227702702;Pag Seguro;ag0001;01571880-2;1;;103
JBT-MC-02;Glaucineia Rosalina Alves;08439793642;;;;0;não tem dados e não atendeu contato;132
JBT-MC-02;Ilda Alves de Oliveira;04592038606;Caixa;1698;767453176-8;1;;104
JBT-MC-02;Ivete Padilha Teixeira Cesar;04309961606;Caixa;3880;847171058-5;1;;105
JBT-MC-02;Izabelle de Sousa Oliveira;08312731270;Caixa;3880;733721337-0;0;;133
JBT-MC-02;Jenny Isabel Ortiz Lopez;12013924208;Caixa;3550;567926104-5;1;;106
JBT-MC-02;Jessica Ribeiro de Souza;14655186658;Itau;3826;30101-6;1;;107
JBT-MC-02;Licia Maretto de Oliveira;23479058728;Nu;.0001;941694788-5;1;;108
JBT-MC-02;Lucileny Vieira do Carmo;10035602619;Caixa;3550;591689665-0;1;;109
JBT-MC-02;Marcelle Silva de Moura;11493991639;Caixa;.0082;767034855-1;1;;111
JBT-MC-02;Marcia Barbosa de Lima;03317268662;Caixa;8542;11682-6;1;;110
JBT-MC-02;Marcilia Maria Barbosa;07059703616;Caixa;3550;773333203-7;0;;135
JBT-MC-02;Maria Aparecida Fernandes da Silva;095480276740;Nu;ag0001;673308060-7;1;;112
JBT-MC-02;Maria Julia Tavares Campos Monteiro;11339077680;Banco do Brasil;2288-8;58244-1;1;;113
JBT-MC-02;Maria de Jesus Silva Xavier;39774082249;Caixa;1698;763773481-2;0;;136
JBT-MC-02;Meicy Rejane Alves Dias;11066868611;Caixa;.0124;7657015625;0;;137
JBT-MC-02;Monica Gleice Magalhaes;05067972602;Nu;ag0001;11200805-3;0;;138
JBT-MC-02;Naiara Cristina Tailor da Silva;12289743658;Pag Seguro;.0001;05621129-5;1;;115
JBT-MC-02;Natally Mendes de Souza;70124917607;Nu;.0001;87095976-4;1;;114
JBT-MC-02;Paola Acacia Pereira Ambrosio dos Santos;12769131680;Caixa;3550;856615429-9;0;;134
JBT-MC-02;Pollyana Francisca da Silva;04082999671;Caixa;3880;967979227-2;1;;116
JBT-MC-02;Regiane Daniele de Jesus;04137544646;Itau;5636;29551-0;0;;139
JBT-MC-02;Rosamistica Costa Monteiro Ferreira;10671263684;Caixa;3550;769647252-7;1;;117
JBT-MC-02;Rosimeire Borges de Almeida Silva;08361060677;Sidred;.0434;68246-2;1;;118
JBT-MC-02;Rozana Aparecida Rodrigues de Lima;03291893603;Caixa;3550;764740032-1;0;;140
JBT-MC-02;Sophia de Brune Andrade;15304803701;Nu;.0001;746866031-4;1;;119
JBT-MC-02;Telma Rodrigues dos Santos;04720994695;Caixa;.0085;774393222-3;1;;122
JBT-MC-02;Thais Gonçalves Moreira Coimbra;19274575645;Caixa;3880;736622569-0;1;;120
JBT-MC-02;Thamires Miranda Costa;11405659661;Nu;.0001;16422934-4;1;;121
JBT-MC-02;Thays Hellen Mendes Dias Sotero;15372174617;Caixa;3880;736622569-0;0;;141
JBT-MC-02;Valkiria Rodrigues Vieira;16750817602;Caixa;3.550;591689665-0;1;;123
JBT-MC-02;Virlania Fernandes da Costa;70449917690;Nu;ag0001;446944759-2;1;;124
JBT-MC-02;Viviane Cristina Magalhaes;86987070687;Caixa;.0893;40356-8;1;;126
JBT-MC-02;Viviane de Almeida Ferreira Aquino;07985310614;Bradesco;.0462-6;35162-8;1;;125
JBT-MC-03;Adriana de Jesus da Silva;06404290685;Caixa;3550;591691579-5;1;;143
JBT-MC-03;Ana Flávia Martins Alberto;06930599662;Caixa;3550;3831-9;1;;144
JBT-MC-03;Ana Lúcia Barbosa;0362603619;Itaú;3826;52668-7;0;;174
JBT-MC-03;Andreia da Silva Rodrigues;00387995617;Caixa;ag0090;825829169-4;1;;145
JBT-MC-03;Bárbara Caroline de Souza Assis;08038517660;Banco do Brasil;4583-7;10588-0;1;;146
JBT-MC-03;Claudiana Pereira Nunes;08519165621;Itaú;3826;50594-7;1;;147
JBT-MC-03;Darlen Duely Gomes;12000040608;Nubank;ag0001;96958008-9;0;;175
JBT-MC-03;Daviny Kezia de Oliveira Souza;10558086632;Caixa;892;35493-0;0;;176
JBT-MC-03;Dayra Nátaly do Carmo;15680447630;Nubank;1;14579268-0;1;;148
JBT-MC-03;Edna Alves dos Santos;07472334626;Caixa;3550;770875875-1;1;;149
JBT-MC-03;Eliana Cristina dos Reis;09920034665;Santander;3651;1055582-1;1;;150
JBT-MC-03;Eliane Rodrigues Ribeiro Silva;03848961628;Caixa;3880;844772309-5;1;;151
JBT-MC-03;Ester dos Santos Pimenta;07044735690;Caixa;1698;767453125-3;1;;152
JBT-MC-03;Francielly Aparecida da Silva;11695721624;Inter;ag0001;30989401-8;0;;184
JBT-MC-03;Geovana Lopes Calixto;11232954683;Inter;1;38784647-6;1;;153
JBT-MC-03;Giovanna Carla Soares Hefrem;13159203603;Nubank;.0001;62942530-2;1;;154
JBT-MC-03;Hedilene de Faria;66339537634;Caixa;3550;764739852-1;1;;155
JBT-MC-03;Ingrid de Andrade Mariano;70008570647;Nubank;.0001;36179100-0;0;;177
JBT-MC-03;Izabelle Kaylane Rodrigues dos Santos;13427323676;Pag Bank;.0001;35769678-0;1;;157
JBT-MC-03;Izaura Regina de Souza;11672875684;Nubank;ag0001;7241573-9;1;;156
JBT-MC-03;Jeniffer Cristina Ribeiro Rocha;11274062612;Banco do Brasil;4583-7;230501-1;1;;158
JBT-MC-03;Jessica Aparecida Dias Paixão;13403542688;Nubank;ag0001;53938640-0;1;;159
JBT-MC-03;Jhady Lorena Ferreira Silva;13520538610;Pan;.0001;011321031-2;0;;178
JBT-MC-03;Juliana Carmos de Almeida Azevedo;01935061658;;;;0;não tem dados e não atendeu contato;179
JBT-MC-03;Juliana Ferreia Hilário;06157244690;Nubank;.0001;17667583-6;1;;161
JBT-MC-03;Juliana Ribeiro dos Santos Rocha;03409098623;Banco do Brasil;45837;60615;1;;162
JBT-MC-03;Jussara de Oliveira Alves Rodrigues;03629159621;Santander;3488;02040618-2;1;;163
JBT-MC-03;Júlia Stéphany Alexandre Tavares;17355498606;Itaú;3826;35274-6;1;;160
JBT-MC-03;Letícia Martins Malaquias;04227928613;Caixa;3550;591689571-9;1;;164
JBT-MC-03;Lilian Vieira de Oliveira;12295003679;Bradesco;1463;123316-5;1;;165
JBT-MC-03;Line Marillac de Moraes;09084707621;Caixa;3550;7745664831-0;1;;191
JBT-MC-03;Lucinei Apolinário Costa;06383762621;Itaú;3826;32197-2;1;;295
JBT-MC-03;Marcela Moreira Matos;13247865667;Banco do Brasil;2288-8;50329-0;1;;166
JBT-MC-03;Maria Júlia Gomes Pacheco;00143824660;Caixa;3550;886672582-8;1;;167
JBT-MC-03;Maria Regina Stefany Dias Duarte Rosa;16252253693;Inter;.0001;20368232-7;0;;182
JBT-MC-03;Maria da Conceição Dias Mendes;05114027670;Nubank;ag0001;16396340-5;0;;180
JBT-MC-03;Maria de Fátima Machado Silva;07232068646;Caixa;3550;764739528-0;0;;181
JBT-MC-03;Mércia Grazielle Cordeiro dos Santos;05003000626;Caixa;.0137;787268707-1;0;;183
JBT-MC-03;Patrícia Aparecida da Silva Fonseca;04341250671;Itaú;6505;94966-6;0;;185
JBT-MC-03;Poliane Lopes de Souza;10971026610;Caixa;3550;773333415-3;0;;186
JBT-MC-03;Priscila Santos;12286587655;Caixa;3550;763511996-7;0;;187
JBT-MC-03;Rosa Amélia Sosa Rondon;70776494236;Santander;3651;01068591-1;1;;168
JBT-MC-03;Rosilaine Raquel Marques;03548674666;Caixa;3550;25363-1;0;;188
JBT-MC-03;Rosilane Aparecida Freitas;04962183605;Santander;3651;01067933-2;1;;169
JBT-MC-03;Samara Eloá Souza Mendes;17049409669;Caixa;3550;575880662-1;0;;189
JBT-MC-03;Sônia Pereira Araújo;08870727637;Nubank;.0001;81662884-7;1;;170
JBT-MC-03;Tamara Soares Guimarães;14062697602;Caixa;138;778027922-8;1;;171
JBT-MC-03;Viviane Pereira Santos;04159021697;Caixa;1698;766226275-9;0;;190
JBT-MC-03;Waldenia do Nascimento Calixto;04798479675;Itaú;6505;54324-6;1;;172
JBT-MC-03;Yargenis Nailea Mendoza Chaparro;71005473269;Santander;3651;01069155-2;1;;173`;

function parseCsv(): SeedAluna[] {
  const lines = CSV_ALUNAS.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const out: SeedAluna[] = [];
  // skip header
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(";");
    while (cols.length < 9) cols.push("");
    const [turma, nome, cpfRaw, banco, agencia, conta, assinou, obs, moodleId] = cols;
    const cpfDigits = onlyDigits(cpfRaw ?? "");
    out.push({
      turma: turma.trim(),
      nome: nome.trim(),
      cpf_raw: (cpfRaw ?? "").trim(),
      cpf: cpfDigits,
      cpf_valido: cpfDigits.length === 11,
      banco: banco.trim() || null,
      agencia: agencia.trim() || null,
      conta: conta.trim() || null,
      assinou_lista: assinou.trim() === "1",
      observacao_csv: obs.trim() || null,
      ava_moodle_id: moodleId.trim() ? Number(moodleId.trim()) : null,
    });
  }
  return out;
}

export const ALUNAS_SEED: SeedAluna[] = parseCsv();