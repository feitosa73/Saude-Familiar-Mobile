# Handover técnico — Saúde Familiar Mobile Lite

## 1. Estado do repositório

O aplicativo está implementado no monorepo `feitosa73/Saude-Familiar-Mobile`, no pacote `artifacts/saude-familiar-mobile`. A stack atual é React Native com Expo SDK 54, Expo Router, TypeScript, `expo-sqlite`, AsyncStorage e o padrão Repository Pattern. O aplicativo continua **Local-Only**: não há backend, autenticação online, sincronização cloud ou envio de dados de saúde para a Internet.

A `main` atual inclui o PR #5, com perfil local de `Caregiver`, múltiplos Patients e as migrations até a versão 4. A Sprint 2 de Consultas é desenvolvida na branch `sprint/2-consultas-local`, sem alterar diretamente a `main`.

## 2. Estrutura de pastas relevante

| Caminho | Responsabilidade |
|---|---|
| `artifacts/saude-familiar-mobile/app/` | Rotas Expo Router e tela principal atual |
| `artifacts/saude-familiar-mobile/src/domain/` | Tipos de domínio de `Patient`, `Caregiver` e `Consultation` |
| `artifacts/saude-familiar-mobile/src/repositories/` | Contratos dos repositórios locais |
| `artifacts/saude-familiar-mobile/src/storage/` | Implementações SQLite e inicialização/migrations |
| `artifacts/saude-familiar-mobile/src/context/` | Estado local compartilhado com as telas |
| `artifacts/saude-familiar-mobile/src/utils/` | Geração de IDs ULID-like compatíveis com o projeto |
| `.github/workflows/mobile-ci.yml` | Typecheck do workspace e validação Expo |
| `.github/workflows/android-apk.yml` | Geração de APK release e checksum como artefato |

As Sprints 1 e 2 mantêm o fluxo em `app/index.tsx` para evitar uma refatoração ampla de navegação. A tela usa estados internos para alternar entre onboarding, Home, familiares e Consultas, com cadastro e edição locais.

## 3. Entidades atuais

`Caregiver` representa a pessoa que utiliza o aplicativo e permanece limitada a um registro local por aparelho. `Patient` representa cada familiar ou pessoa acompanhada. A tabela `patients` não possui restrição de registro único e está preparada para múltiplos registros.

No PR 1, `Patient` mantém os campos existentes de identificação, data de nascimento, informações clínicas legadas e timestamps. O cadastro e a edição passam a aceitar também `notes`, uma observação opcional de texto simples.

As operações locais de Patient são `list`, `getFirst`, `getById`, `create`, `update` e `delete`. A seleção do Patient ativo é uma preferência de interface, armazenada localmente sob a chave `saude-familiar.active-patient-id`, sem alterar a cardinalidade do banco. `Consultation` representa uma consulta vinculada obrigatoriamente a um `patientId`, com status `pending`, `scheduled`, `completed` ou `cancelled`, e data/hora opcionais.

## 4. Schema SQLite e migrations

A tabela `patients` contém atualmente `id`, `name`, `birth_date`, `blood_type`, `allergies`, `emergency_contacts`, `notes`, `primary_doctor`, `health_insurance`, `health_insurance_number`, `created_at` e `updated_at`. Não existe `UNIQUE` ou índice de singleton nessa tabela.

A tabela `caregivers` contém `id`, `name`, `photo_uri`, `created_at` e `updated_at`. A migration 4 cria `caregivers_singleton_idx` sobre uma expressão constante para garantir um único Caregiver local. Essa restrição não se aplica a Patients.

| Versão | Conteúdo | Transacional |
|---:|---|:---:|
| 1 | Criação inicial de `patients` | Não, legado existente |
| 2 | Torna `birth_date` opcional sem descartar dados | Sim |
| 3 | Cria `caregivers` | Sim |
| 4 | Normaliza duplicatas de Caregiver e impõe singleton | Sim |
| 5 | Cria `consultations` e índice por `patient_id` | Sim |

O PR 1 não precisou de migration de schema para permitir múltiplos Patients, porque a tabela já aceita vários registros e a coluna `notes` já existia no schema. A Sprint 2 adiciona a migration 5 de Consultations de forma incremental, idempotente e transacional, sem foreign key destrutiva. Quando o usuário confirma a exclusão explícita de um Patient, suas Consultations vinculadas são removidas na mesma transação SQLite, evitando registros órfãos sem cascade silenciosa. Medicamentos e Exames deverão criar suas próprias migrations futuras.

## 5. Repositories

`SQLitePatientRepository` converte as colunas snake_case do SQLite para o domínio camelCase. A listagem ordena os registros por `created_at`, a seleção usa o `id`, a edição atualiza somente os campos básicos previstos pelo PR 1 e a exclusão remove o registro após confirmação na interface. `SQLiteConsultationRepository` expõe `listByPatient`, `getById`, `create`, `update` e `delete`, sempre filtrando por `patientId` no carregamento do familiar ativo.

A Sprint 2 é o primeiro módulo clínico local e não implementa Medicamentos, Exames ou Documentos/Receitas. Esses módulos deverão possuir entidades, repositories e migrations próprias, sempre com vínculo lógico obrigatório a `patientId`.

## 6. Fluxo de navegação atual

O primeiro uso segue `boas-vindas → perfil do cuidador → cadastro do primeiro familiar → Home`. Depois que existe um cuidador e pelo menos um Patient, a Home mostra o cuidador e o familiar selecionado.

A Home permite selecionar outro Patient, abrir o gerenciamento de familiares e acessar Consultas. A tela de Consultas mostra no topo o familiar ativo, agrupa os registros em `A agendar`, `Próximas` e `Histórico` — incluindo no Histórico as consultas agendadas com data passada — e permite cadastrar, editar status/data/hora e excluir com confirmação explícita.
Ao trocar o Patient ativo, o contexto carrega somente as consultas do novo familiar. Se o Patient ativo for excluído, o aplicativo seleciona o primeiro Patient restante; se não restar nenhum, retorna ao cadastro de familiar.

A navegação ainda está concentrada na rota principal para manter o diff pequeno. Uma evolução futura poderá separar as telas em rotas Expo Router quando os módulos clínicos forem introduzidos.

## 7. Decisões de arquitetura

A decisão principal é separar **Caregiver único por aparelho** de **N Patients** e vincular cada módulo clínico ao `patientId` do familiar ativo. A seleção ativa é estado de interface, não uma relação estrutural `Caregiver : Patient`. Consultas não usam foreign key destrutiva; a exclusão de dados vinculados ocorre somente após confirmação explícita do Patient e dentro da mesma transação.

A lista usa `FlatList` para evitar renderização manual de listas longas. As ações principais têm labels acessíveis e áreas de toque grandes. A exclusão é confirmada por `Alert` antes da remoção local.

## 8. Limitações atuais

A Home agora possui apenas um resumo mínimo de Consultas do Patient ativo. Medicamentos, Exames e Documentos/Receitas continuam fora do escopo. Não há relacionamento explícito `caregiverId → patientId`, compartilhamento, sincronização, notificações, calendário do dispositivo, APIs externas ou OCR.

O avatar opcional do Caregiver permanece modelado, mas ainda não possui interface de captura ou seleção. A edição do Patient nesta etapa cobre apenas nome, data de nascimento e observações.

## 9. Dívida técnica e bugs conhecidos

A rota principal concentra onboarding, Home e gerenciamento de familiares; essa decisão reduz o risco nesta janela, mas aumenta o tamanho do arquivo e deverá ser revisitada quando os módulos clínicos forem adicionados.

A preferência do Patient ativo permanece no AsyncStorage, fora do SQLite. O registro clínico continua no SQLite, mas a seleção ativa não acompanha eventual backup ou exportação que contenha apenas o banco SQLite — o que é aceitável enquanto o produto permanece Local-Only.

A exportação web pode depender do artefato WASM do `expo-sqlite` disponível no ambiente de bundling. O workflow obrigatório atual valida typecheck e configuração Expo; a execução Android permanece o caminho principal do aplicativo.

## 10. Backlog recomendado

| Próxima etapa | Conteúdo |
|---|---|
| PR 2 | Concluído nesta branch: Consultas locais por Patient, incluindo `A agendar` sem data/hora obrigatória |
| PR 3 | Medicamentos por Patient, sem catálogo ANVISA e sem OCR |
| PR 4 | Exames por Patient, incluindo status `A agendar` sem data/hora obrigatória |
| PR 5 | Documentos/Receitas locais, com foto ou PDF privado, sem OCR e sem nuvem |
| Evolução posterior | Rotas separadas, relacionamento clínico explícito e testes instrumentados no Android |

## 11. Instruções para continuidade

Para instalar e validar o workspace:

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm run typecheck
cd artifacts/saude-familiar-mobile
pnpm exec expo config --type public
```

Para executar o aplicativo em desenvolvimento Android, usar o script Expo do pacote mobile com um emulador Android configurado:

```bash
cd artifacts/saude-familiar-mobile
pnpm exec expo start --android
```

O workflow `Validate Mobile` roda em Pull Requests e em pushes para `main`. Ele instala as dependências com `pnpm install --frozen-lockfile --ignore-scripts`, executa o typecheck do workspace e valida a configuração Expo. O workflow `Build installable APK` é disparado manualmente, em Pull Requests e em pushes para `main`; ele configura Node 22, pnpm 11.22, Java 17, executa `expo prebuild --platform android --no-install --clean`, gera `assembleRelease` e publica o APK com checksum por 14 dias.

Não há atualmente configuração de Firebase App Distribution no repositório. Se essa distribuição for necessária futuramente, deverá ser tratada como mudança de infraestrutura separada, com credenciais protegidas e autorização explícita; não deve ser introduzida no PR 1.

## 12. Pontos que ainda precisam de testes

Os testes funcionais prioritários do PR 1 são: primeira execução; atualização de uma instalação que já possui Caregiver e Patient; persistência após fechar e reabrir; criação de múltiplos Patients; alternância do Patient ativo; garantia de que dados de um Patient não aparecem em outro; edição de dados; exclusão com confirmação; exclusão do Patient ativo; e retorno ao cadastro quando não houver Patients restantes.

A Sprint 2 deve ser validada com criação de consulta `A agendar` sem data/hora, persistência após reabertura, edição para `Agendada` com data/hora, isolamento ao trocar Patient, criação para um segundo familiar, mudança para `Realizada` no histórico, exclusão confirmada e resumo correto na Home. Os próximos PRs deverão acrescentar testes para medicamentos, exames e documentos vinculados ao Patient correto. Os testes atuais de validação automatizada permanecem typecheck, configuração Expo e os workflows GitHub Actions.
