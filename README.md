# OficinaVolt — gestão para oficina elétrica automotiva

Sistema web completo (MVP funcional ponta a ponta) para administrar uma **oficina elétrica de
automóveis**: ordens de serviço com diagnóstico em texto livre, cadastro de clientes e veículos,
controle financeiro por OS e relatórios de faturamento.

Construído para **uma oficina** (single-tenant), com múltiplos usuários e perfis de acesso.

---

## Para rodar

Requisito: **Node.js >= 22.5** (usa o driver SQLite nativo do Node — não precisa instalar banco
nem compilar nada).

```bash
npm install
npm run dev
```

Abra <http://localhost:3000> e entre com:

| Usuário | Senha | Perfil |
| --- | --- | --- |
| `admin@oficina.com` | `admin123` | Administrador |
| `elisa@oficina.com` | `elisa123` | Gestor |
| `sonia@oficina.com` | `sonia123` | Recepção |
| `diego@oficina.com` | `diego123` | Técnico |
| `rogerio@oficina.com` | `rogerio123` | Técnico |

> **Troque o nome da oficina** em `Configurações` — é o que aparece no menu, no login e na OS
> impressa.

O primeiro `npm run dev` cria o `.env`, aplica as migrations e popula o banco com dados de
demonstração (8 clientes, 12 veículos e 34 OS distribuídas nos últimos 4 meses, com itens e
pagamentos), para o painel e os relatórios já abrirem com conteúdo real.

### Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Sobe em <http://localhost:3000> (prepara o banco antes) |
| `npm run build` / `npm start` | Build e servidor de produção |
| `npm run db:seed` | Aplica migrations e completa dados faltantes (idempotente) |
| `npm run db:fresh` | **Apaga** o banco e recria com os dados de demonstração |
| `npm run db:no-demo` | Cria só configurações e usuários, sem dados de exemplo |
| `npm run typecheck` | Checagem de tipos |
| `npm test` | Testes das regras de negócio e dos utilitários |
| `npm run test:tz` | Mesma suíte em **seis fusos horários** (ver abaixo) |

Para começar **vazio** (sem os dados de exemplo), mantendo o usuário admin:

```bash
npm run db:no-demo
```

### Testes

46 testes usando o runner nativo do Node (`node:test`) com `tsx` como loader — **nenhuma
dependência nova**. Cobrem as regras que causariam erro silencioso se regredissem:

- `tests/utils.test.ts` — dinheiro em centavos (análise do formato brasileiro, ida e volta sem
  perda de precisão, o caso clássico de `float`), datas, placa, telefone e CPF/CNPJ.
- `tests/rules.test.ts` — fluxo de status da OS, derivação do status financeiro, marcos de data por
  status, faixas de atraso do aging e detecção de configuração pendente.

`npm run test:tz` repete a suíte em `America/Sao_Paulo`, `America/New_York`, `UTC`,
`Europe/Lisbon`, `Asia/Tokyo` e `Pacific/Kiritimati`. Existe por causa de um defeito real já
corrigido: o JavaScript lê data só-data (`"2026-10-19"`) como meia-noite **UTC**, o que em fuso
negativo fazia toda data aparecer um dia antes. Rodar dos dois lados de Greenwich (até UTC+14) é o
que impede esse tipo de bug de voltar — as asserções de data precisam valer em qualquer fuso.

---

## O que o sistema faz

### Ordens de serviço — o núcleo
- Abertura em uma tela só: cliente (existente ou **novo, criado na hora**), veículo (da frota do
  cliente ou **novo, pela placa**), data de entrada, previsão de entrega, KM, nível de
  combustível, técnico responsável, garantia e **defeito relatado**.
- **Fluxo simples**, sem etapa de aprovação:
  `Aberta → Em execução → Concluída → Entregue` (e `Cancelada`).
  Transições inválidas são bloqueadas na API (não dá para pular de "Em execução" para "Entregue").
  Os marcos de data (`finishedAt`, `deliveredAt`) são gravados automaticamente.
- **Diagnóstico em texto livre**, separado do relato do cliente — útil para guardar o que foi
  medido (tensão de bateria, corrente de fuga, códigos lidos no scanner) e para embasar garantia.
- Itens de **peça** e **serviço (mão de obra)** com quantidade, valor unitário, garantia por item
  e observação. Totais recalculados automaticamente, com desconto opcional.
- Numeração sequencial automática (`OS-0001`, `OS-0002`…) controlada em `Configurações`.
- Alerta de **OS com previsão de entrega vencida** no painel e na própria OS.
- **Impressão**: o botão Imprimir usa uma camada de impressão dedicada em A4. Menu lateral, botões,
  modais e toasts saem do papel (`.no-print`); entram um **cabeçalho com a identidade da oficina**
  (nome, razão social, CNPJ/CPF, telefone e endereço) e um **rodapé com os termos configuráveis**
  (garantia e taxa de pátio) mais linhas de assinatura do cliente e da oficina (`.print-only`,
  ocultos na tela). A identidade vem de Configurações — é o que torna a OS impressa um documento da
  sua oficina, e não um modelo genérico.

### Clientes e veículos
- Cliente pessoa física ou jurídica, com CPF/CNPJ, telefone, e-mail, endereço e observações.
- Um cliente pode ter **vários veículos**; a placa é única e normalizada (`abc-1d23` → `ABC1D23`).
- Campo de **tensão do sistema elétrico** (12V / 24V / 12V-24V / outro) por veículo — relevante
  para frota e caminhões.
- Ficha do cliente com histórico completo, total consumido, ticket médio e saldo em aberto.
- Histórico do veículo com **serviços recorrentes**: se o mesmo reparo aparece várias vezes, o
  sistema sinaliza possível causa raiz não resolvida (ex.: alternador que queima bateria nova).
- Exclusão é *soft delete* e **bloqueada** quando já existe OS vinculada.

### Financeiro
- Recebimentos por OS com forma de pagamento (Pix, dinheiro, débito, crédito, transferência,
  boleto), data e observação. Suporta **pagamento parcial** e quitação.
- Status derivado automaticamente: `Em aberto` / `Parcial` / `Pago`.
- Estorno de lançamento (administrador/gestor) com recálculo do saldo.
- Tela com totais do filtro: faturado, recebido, **a receber** e recebido no mês.
- Baixa de pagamento direto da lista, sem precisar abrir a OS.
- **Contas a receber por faixa de atraso** (`Aging`): `Até 7 dias`, `8 a 30`, `31 a 60`,
  `Mais de 60` e `Ainda não entregue`, com valor e quantidade por faixa mais a lista dos saldos
  mais antigos. A cobrança ancora na **entrega** do veículo (ou na conclusão, se ainda não
  entregue); OS em execução entra na última faixa porque é receita em andamento, não
  inadimplência.

### Relatórios
Faturamento, ticket médio, recebido × a receber, receita por mês, **peças × mão de obra**,
serviços mais executados, peças mais usadas, recebimentos por forma de pagamento, produção por
técnico e principais clientes — com período customizável, atalhos (hoje, 7/30 dias, este mês, mês
passado, este ano), exportação CSV e impressão.

A exportação CSV baixa **as ordens de serviço do período** (nº, cliente, veículo, placa, status,
pagamento, entrada, previsão, entrega, KM, total, recebido e saldo) no padrão Excel pt-BR:
separador `;`, decimal com vírgula e BOM UTF-8 para os acentos.

### Perfis de acesso
| Perfil | Pode |
| --- | --- |
| **Administrador** | Tudo, inclusive usuários e exclusão definitiva |
| **Gestor** | OS, clientes, financeiro, relatórios e configurações |
| **Técnico** | OS e diagnóstico; sem financeiro e sem configurações |
| **Recepção** | Abertura de OS e cadastro de clientes |

A autorização é aplicada na API (não só na interface): um técnico recebe `403` ao tentar criar
usuário, alterar configurações ou estornar pagamento.

### Produtividade no balcão
Atalhos de teclado para quem abre OS o dia inteiro. Não disparam quando o foco está em um campo de
texto nem com um modal aberto.

| Tecla | Ação |
| --- | --- |
| `N` | Nova ordem de serviço |
| `/` | Focar a busca da tela atual |
| `G` + `D` `O` `C` `V` `F` `R` `S` | Ir para Painel, OS, Clientes, Veículos, Financeiro, Relatórios, Configurações |
| `?` | Abrir esta ajuda |

O botão de teclado no rodapé do menu abre a mesma ajuda — o recurso é descobrível sem depender de
o usuário adivinhar o `?`.

### Avisos de conferência
Dois lembretes não bloqueantes, pensados para evitar erro silencioso:

- **Configuração pendente** — enquanto nome, CNPJ, telefone ou endereço da oficina estiverem vazios
  ou iguais ao exemplo do seed, um aviso aponta exatamente o que falta, já que esses dados saem no
  cabeçalho da OS impressa. É descartável (o "X" grava a escolha no navegador).
- **Hodômetro regressivo** — ao salvar uma OS com quilometragem menor que a já registrada para o
  mesmo veículo, a OS é criada normalmente mas um aviso pede conferência: hodômetro não anda para
  trás, e o caso mais comum é erro de digitação (`12000` em vez de `120000`). Vale também ao editar
  o KM de uma OS existente.

---

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript** — front e API no mesmo projeto
- **SQLite** via driver nativo `node:sqlite`, com adaptador que usa `better-sqlite3` se instalado
- **Tailwind CSS 4** para a interface
- **jose** (cookie de sessão assinado HS256, httpOnly, 7 dias) + **bcryptjs** (hash de senha)
- **zod** para validação de entrada nas rotas

### Como o banco funciona

Migrations em SQL puro, aplicadas automaticamente no boot:

```
prisma/migrations/0001_init.sql   → schema (tabelas, índices, checks)
data/oficina.db                   → arquivo do banco (criado automaticamente, fora do Git)
```

O runner (`src/server/db/index.ts`) registra o que já foi aplicado na tabela `_migrations` e é
idempotente — pode rodar em todo boot. Para evoluir o schema, adicione `0002_*.sql`.

Decisões de modelagem:
- **Dinheiro em centavos** (`INTEGER`), nunca `float` — evita erro de arredondamento em
  somatórios financeiros.
- **Datas em ISO-8601** (texto), comparáveis lexicalmente e portáveis entre SQLite e Postgres.
  Campos puramente comerciais (`entry_date`, `expected_finish`, `paid_at`) guardam **só a data**
  (`YYYY-MM-DD`); marcos de fluxo (`finished_at`, `delivered_at`, `canceled_at`) guardam o
  **instante completo** em UTC.
- Totais da OS (`items_total_cents`, `total_cents`, `paid_cents`, `financial_status`) são
  **desnormalizados** e recalculados em transação a cada mudança de item/pagamento, para as
  listagens e relatórios não precisarem de joins pesados.
- `ON DELETE RESTRICT` em `orders.client_id` / `orders.vehicle_id`: histórico nunca é perdido por
  exclusão acidental de cadastro.

### Fuso horário (importante para o Brasil)

O JavaScript interpreta uma string só-data (`"2026-10-19"`) como **meia-noite UTC**. Em fuso de
deslocamento negativo — como `America/Sao_Paulo` (UTC-3) — isso faz `getDate()` devolver o dia
anterior, e **toda data apareceria um dia antes** na tela e no CSV.

Por isso:

- `toDate()` em `src/lib/utils.ts` detecta o formato só-data e constrói a data a partir de
  componentes **locais** (`new Date(ano, mês-1, dia)`), em vez de passar a string ao construtor.
  Com isso, datas comerciais ficam invariantes ao fuso do servidor e do navegador — não há risco
  de divergência de hidratação entre server e client components.
- Instantes completos continuam sendo exibidos no fuso local (`formatDateTime`).
- No SQL, agregações sobre instantes usam `date(coluna, 'localtime')` — sem o modificador, o
  SQLite extrairia o dia em UTC e uma entrega feita às 23h cairia no mês seguinte.
- Comparações de "hoje" usam `todayISO()` (data local), nunca `new Date().toISOString().slice(0,10)`.

**Em produção, defina o fuso do servidor** para o da oficina, já que o SQLite resolve `'localtime'`
por ele:

```bash
TZ=America/Sao_Paulo npm run start
```


### Trocando o driver SQLite

Por padrão usa o driver nativo do Node (zero dependências binárias). Para usar `better-sqlite3`
(recomendado em produção de alto volume):

```bash
npm install better-sqlite3
# e no .env:
DB_DRIVER=better-sqlite3
```

O adaptador tem a mesma interface para os dois e normaliza diferenças (`BigInt` → `number`,
retorno de `run()`), inclusive transações reentrantes (criar OS gera o número sequencial dentro da
mesma transação).

### Migrando para PostgreSQL depois

O schema é SQL portável e o acesso a dados está isolado em `src/server/db/*`. Para migrar: troque
os tipos (`INTEGER PRIMARY KEY AUTOINCREMENT` → `SERIAL`, `TEXT` de data → `DATE`/`TIMESTAMPTZ`),
aponte `DATABASE_URL` para o Postgres e substitua o adaptador por um cliente Postgres — os
repositórios e as rotas não mudam.

---

## Estrutura

```
prisma/
  migrations/0001_init.sql      schema do banco
  seed.ts                       migrations + dados iniciais/demo
scripts/setup.mjs               prepara .env e banco (roda em predev/prebuild)
src/
  app/
    login/                      tela de login
    (app)/                      área logada (layout com menu lateral)
      dashboard/                painel com KPIs, fluxo e alertas
      os/                       lista + /nova + /[id] (detalhe)
      clientes/                 lista + /[id] (ficha com veículos e histórico)
      veiculos/                 busca por placa + /[id] (histórico elétrico)
      financeiro/               recebimentos e pendências por OS
      relatorios/               faturamento, peças × serviços, rankings
      configuracoes/            dados da oficina + usuários e perfis
    api/                        rotas JSON (auth, orders, clients, vehicles,
                                items, payments, stats, settings, users)
  components/
    ui/                         botões, campos, cards, badges, modal, toasts
    layout/                     menu lateral e navegação mobile
    orders/                     itens da OS e badges de status/pagamento
  lib/
    types.ts                    tipos e constantes de domínio (status, perfis…)
    utils.ts                    dinheiro em centavos, datas pt-BR, placa, CPF/CNPJ
    api-client.ts               fetch tipado usado pelas telas
  middleware.ts                 protege rotas (Edge-safe: só valida o token)
  server/
    api.ts                      withAuth + erros padronizados (401/403/404/409/422)
    auth/                       token.ts (Edge) · session.ts (Node) · password.ts
    db/                         adaptador SQLite + repositórios + stats
```

### Detalhe de arquitetura: middleware no Edge Runtime

O `middleware.ts` roda no Edge Runtime, onde `node:fs` não existe. Por isso a autenticação foi
dividida em dois módulos:

- `server/auth/token.ts` — apenas assina/verifica o JWT com `jose` (**Edge-safe**); usado pelo
  middleware para decidir "logado ou não" rapidamente.
- `server/auth/session.ts` — cookies + consulta ao banco (Node); usado por páginas e rotas, que
  revalidam o usuário a cada requisição (usuário desativado perde acesso na hora, mesmo com cookie
  válido).

---

## Decisões de produto deste MVP

Definidas junto com o dono da oficina:

- **Escopo enxuto**: OS + clientes/veículos + peças e serviços + financeiro básico + relatórios.
  Sem módulo de estoque e sem agenda/calendário (podem entrar depois — o schema já comporta).
- **Fluxo de OS simples**, sem etapa formal de aprovação de orçamento.
- **Diagnóstico em texto livre**, sem campos técnicos estruturados nem catálogo de serviços
  pré-cadastrado. O sistema ainda guarda a **tensão do sistema elétrico** por veículo e
  **garantia** por item e por OS, que são informação operacional barata e útil.
- **Uma oficina só** (single-tenant). Se um dia virar SaaS multi-tenant, o caminho é adicionar
  `tenant_id` nas tabelas e filtrar no repositório — as telas e a API não mudam de forma.

## Próximos passos sugeridos

1. **Estoque de peças** com baixa automática ao concluir a OS e alerta de mínimo
2. **Orçamento com aprovação do cliente** (etapa anterior a "Em execução") e link público de
   aprovação
3. **Agenda por técnico** (calendário de entradas e previsões de entrega)
4. **Envio de OS/orçamento por WhatsApp** e lembrete de revisão elétrica por KM/data
5. **Anexos** (fotos do antes/depois, laudos de bateria) e assinatura do cliente na retirada
6. Deploy com Postgres gerenciado + backup automático do banco

---

## Segurança

- Senhas com **bcrypt** (custo 10); nunca armazenadas em texto puro.
- Sessão em **cookie httpOnly assinado** (HS256, 7 dias), `sameSite=lax` e `secure` em produção.
  Defina um `AUTH_SECRET` forte no `.env` (o setup gera um aleatório na primeira execução).
- Autorização por perfil aplicada **na API**, não apenas na interface.
- Todas as escritas passam por **zod**; erros de constraint do banco viram mensagens amigáveis em
  português (placa duplicada, e-mail em uso…) em vez de vazar SQL.
- Consultas sempre parametrizadas (sem concatenação de entrada em SQL).

## Backup

Todo o estado da aplicação está em `data/oficina.db` (+ `-wal`/`-shm`). Copiar esses arquivos já
é um backup completo. Recomenda-se snapshot diário em produção.
