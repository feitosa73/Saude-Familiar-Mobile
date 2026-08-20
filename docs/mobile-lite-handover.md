# Handover técnico — Saúde Familiar Mobile Lite

## 1. Estado do repositório

O aplicativo está implementado no monorepo `feitosa73/Saude-Familiar-Mobile`, no pacote `artifacts/saude-familiar-mobile`. A stack atual é React Native com Expo SDK 54, Expo Router, TypeScript, `expo-sqlite`, AsyncStorage e o padrão Repository Pattern. O aplicativo continua **Local-Only**: não há backend, autenticação online, sincronização cloud ou envio de dados de saúde para a Internet.

O PR 1 desta janela parte da `main` após o merge do PR #3, que entregou o perfil local de `Caregiver`, as migrations até a versão 4 e a regra de unicidade de um Caregiver por aparelho. A branch de trabalho do PR 1 é `sprint/1c-multiple-patients-local`.

## 2. Estrutura de pastas relevante

| Caminho | Responsabilidade |
|---|---|
| `artifacts/saude-familiar-mobile/app/` | Rotas Expo Router e tela principal atual |
| `artifacts/saude-familiar-mobile/src/domain/` | Tipos de domínio de `Patient` e `Caregiver` |
| `artifacts/saude-familiar-mobile/src/repositories/` | Contratos dos repositórios locais |
| `artifacts/saude-familiar-mobile/src/storage/` | Implementações SQLite e inicialização/migrations |
| `artifacts/saude-familiar-mobile/src/context/` | Estado local compartilhado com as telas |
| `artifacts/saude-familiar-mobile/src/utils/` | Geração de IDs ULID-like compatíveis com o projeto |
| `.github/workflows/mobile-ci.yml` | Typecheck do workspace e validação Expo |
| `.github/workflows/android-apk.yml` | Geração de APK release e checksum como artefato |

O PR 1 mantém o fluxo em `app/index.tsx` para evitar uma refatoração ampla de navegação. A tela usa estados internos para alternar entre onboarding, Home, lista de familiares, cadastro e edição.

## 3. Entidades atuais

`Caregiver` representa a pessoa que utiliza o aplicativo e permanece limitada a um registro local por aparelho. `Patient` representa cada familiar ou pessoa acompanhada. A tabela `patients` não possui restrição de registro único e está preparada para múltiplos registros.

No PR 1, `Patient` mantém os campos existentes de identificação, data de nascimento, informações clínicas legadas e timestamps. O cadastro e a edição passam a aceitar também `notes`, uma observação opcional de texto simples.

As operações locais de Patient são `list`, `getFirst`, `getById`, `create`, `update` e `delete`. A seleção do Patient ativo é uma preferência de interface, armazenada localmente sob a chave `saude-familiar.active-patient-id`, sem alterar a cardinalidade do banco.

## 4. Schema SQLite e migrations

A tabela `patients` contém atualmente `id`, `name`, `birth_date`, `blood_type`, `allergies`, `emergency_contacts`, `notes`, `primary_doctor`, `health_insurance`, `health_insurance_number`, `created_at` e `updated_at`. Não existe `UNIQUE` ou índice de singleton nessa tabela.

A tabela `caregivers` contém `id`, `name`, `photo_uri`, `created_at` e `updated_at`. A migration 4 cria `caregivers_singleton_idx` sobre uma expressão constante para garantir um único Caregiver local. Essa restrição não se aplica a Patients.

| Versão | Conteúdo | Transacional |
|---:|---|:---:|
| 1 | Criação inicial de `patients` | Não, legado existente |
| 2 | Torna `birth_date` opcional sem descartar dados | Sim |
| 3 | Cria `caregivers` | Sim |
| 4 | Normaliza duplicatas de Caregiver e impõe singleton | Sim |

O PR 1 não precisa de migration de schema para permitir múltiplos Patients, porque a tabela já aceita vários registros e a coluna `notes` já existia no schema. Novos módulos clínicos, como Consultas, Medicamentos e Exames, deverão criar suas próprias migrations incrementais, idempotentes e transacionais.

## 5. Repositories

`SQLitePatientRepository` converte as colunas snake_case do SQLite para o domínio camelCase. A listagem ordena os registros por `created_at`, a seleção usa o `id`, a edição atualiza somente os campos básicos previstos pelo PR 1 e a exclusão remove o registro após confirmação na interface.

Nenhum módulo clínico foi criado nesta etapa. Consultas, Medicamentos, Exames e Documentos/Receitas locais deverão possuir entidades, repositories e migrations próprias, sempre com vínculo lógico obrigatório a `patientId`.

## 6. Fluxo de navegação atual

O primeiro uso segue `boas-vindas → perfil do cuidador → cadastro do primeiro familiar → Home`. Depois que existe um cuidador e pelo menos um Patient, a Home mostra o cuidador e o familiar selecionado.

A Home permite abrir o gerenciamento de familiares. A lista permite selecionar outro Patient, cadastrar um novo, editar os dados básicos e excluir com confirmação explícita. Se o Patient ativo for excluído, o aplicativo seleciona o primeiro Patient restante; se não restar nenhum, retorna ao cadastro de familiar.

A navegação ainda está concentrada na rota principal para manter o diff pequeno. Uma evolução futura poderá separar as telas em rotas Expo Router quando os módulos clínicos forem introduzidos.

## 7. Decisões de arquitetura

A decisão principal do PR 1 é separar **Caregiver único por aparelho** de **N Patients**. A seleção ativa é estado de interface, não uma relação estrutural `Caregiver : Patient`. Isso permite evoluir posteriormente para consultas, medicamentos, exames e documentos vinculados a cada `patientId` sem limitar o banco a um único familiar.

A lista usa `FlatList` para evitar renderização manual de listas longas. As ações principais têm labels acessíveis e áreas de toque grandes. A exclusão é confirmada por `Alert` antes da remoção local.

## 8. Limitações atuais

A Home ainda não possui Consultas, Medicamentos, Exames ou Documentos/Receitas porque esses módulos foram deliberadamente separados em PRs posteriores. Não há seleção de paciente dentro de módulos clínicos, relacionamento explícito `caregiverId → patientId`, compartilhamento, sincronização, notificações ou OCR.

O avatar opcional do Caregiver permanece modelado, mas ainda não possui interface de captura ou seleção. A edição do Patient nesta etapa cobre apenas nome, data de nascimento e observações.

## 9. Dívida técnica e bugs conhecidos

A rota principal concentra onboarding, Home e gerenciamento de familiares; essa decisão reduz o risco nesta janela, mas aumenta o tamanho do arquivo e deverá ser revisitada quando os módulos clínicos forem adicionados.

A preferência do Patient ativo usa AsyncStorage para estado de interface. O registro clínico continua no SQLite, mas ainda não existe uma camada de preferências SQLite compartilhada entre dispositivos — o que é aceitável enquanto o produto permanece Local-Only.

A exportação web pode depender do artefato WASM do `expo-sqlite` disponível no ambiente de bundling. O workflow obrigatório atual valida typecheck e configuração Expo; a execução Android permanece o caminho principal do aplicativo.

## 10. Backlog recomendado

| Próxima etapa | Conteúdo |
|---|---|
| PR 2 | Consultas por Patient, incluindo status `A agendar` sem data/hora obrigatória |
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

Os próximos PRs deverão acrescentar testes para consulta e exame `A agendar` sem data, vínculo de medicamentos ao Patient correto e associação de documentos ao Patient correto. Os testes atuais de validação automatizada permanecem typecheck, configuração Expo e o workflow GitHub Actions.
