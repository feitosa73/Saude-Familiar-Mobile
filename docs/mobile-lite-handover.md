# Handover técnico — Saúde Familiar Mobile Lite

## 1. Estado do repositório

O aplicativo está implementado no monorepo `feitosa73/Saude-Familiar-Mobile`, no pacote `artifacts/saude-familiar-mobile`. A stack atual é React Native com Expo SDK 54, Expo Router, TypeScript, `expo-sqlite`, AsyncStorage e o padrão Repository Pattern. O aplicativo continua **Local-Only**: não há backend, autenticação online, sincronização cloud ou envio de dados de saúde para a Internet.

A `main` atual inclui o PR #6, incorporado pelo commit `b7b86c5630daab29f642531fe62b1ba5179aeac5`, com perfil local de `Caregiver`, múltiplos Patients e Consultations locais. A Sprint 3 de lembretes é desenvolvida na branch `sprint/3-lembretes-consultas-local`, sem alterar diretamente a `main`.

## 2. Estrutura de pastas relevante

| Caminho | Responsabilidade |
|---|---|
| `artifacts/saude-familiar-mobile/app/` | Rotas Expo Router e tela principal atual |
| `artifacts/saude-familiar-mobile/src/domain/` | Tipos de domínio de `Patient`, `Caregiver`, `Consultation` e `Reminder` |
| `artifacts/saude-familiar-mobile/src/repositories/` | Contratos dos repositórios locais |
| `artifacts/saude-familiar-mobile/src/storage/` | Implementações SQLite e inicialização/migrations |
| `artifacts/saude-familiar-mobile/src/context/` | Estado local compartilhado com as telas |
| `artifacts/saude-familiar-mobile/src/services/` | Coordenação de notificações locais e reagendamento |
| `artifacts/saude-familiar-mobile/src/utils/` | Geração de IDs ULID-like e cálculo de datas locais |
| `.github/workflows/mobile-ci.yml` | Typecheck do workspace e validação Expo |
| `.github/workflows/android-apk.yml` | Geração de APK release e checksum como artefato |

As Sprints 1 e 2 mantêm o fluxo em `app/index.tsx` para evitar uma refatoração ampla de navegação. A tela usa estados internos para alternar entre onboarding, Home, familiares e Consultas, com cadastro e edição locais.

## 3. Entidades atuais

`Caregiver` representa a pessoa que utiliza o aplicativo e permanece limitada a um registro local por aparelho. `Patient` representa cada familiar ou pessoa acompanhada. A tabela `patients` não possui restrição de registro único e está preparada para múltiplos registros.

No PR 1, `Patient` mantém os campos existentes de identificação, data de nascimento, informações clínicas legadas e timestamps. O cadastro e a edição passam a aceitar também `notes`, uma observação opcional de texto simples.

As operações locais de Patient são `list`, `getFirst`, `getById`, `create`, `update` e `delete`. A seleção do Patient ativo é uma preferência de interface, armazenada localmente sob a chave `saude-familiar.active-patient-id`, sem alterar a cardinalidade do banco. `Consultation` representa uma consulta vinculada obrigatoriamente a um `patientId`, com status `pending`, `scheduled`, `completed` ou `cancelled`, e data/hora opcionais. `Reminder` representa zero ou mais lembretes locais vinculados obrigatoriamente a uma Consultation, com tipo `consultation_advance` ou `scheduling_task`, `triggerAt`, antecedência opcional e o `notificationId` devolvido pelo Android.

## 4. Schema SQLite e migrations

A tabela `patients` contém atualmente `id`, `name`, `birth_date`, `blood_type`, `allergies`, `emergency_contacts`, `notes`, `primary_doctor`, `health_insurance`, `health_insurance_number`, `created_at` e `updated_at`. Não existe `UNIQUE` ou índice de singleton nessa tabela.

A tabela `caregivers` contém `id`, `name`, `photo_uri`, `created_at` e `updated_at`. A migration 4 cria `caregivers_singleton_idx` sobre uma expressão constante para garantir um único Caregiver local. Essa restrição não se aplica a Patients.

| Versão | Conteúdo | Transacional |
|---:|---|:---:|
| 1 | Criação inicial de `patients` | Não, legado existente |
| 2 | Torna `birth_date` opcional sem descartar dados | Sim |
| 3 | Cria `caregivers` | Sim |
| 4 | Normaliza duplicatas de Caregiver e impõe singleton | Sim |
| 5 | Cria `consultations` (`id`, `patient_id`, `specialty`, `professional_name`, `location`, `phone`, `date`, `time`, `notes`, `status`, `created_at`, `updated_at`), aplica `CHECK` para os quatro status e cria `consultations_patient_idx` em `(patient_id, status, date, time)`; execução transacional e idempotente, sem foreign key | Sim |
| 6 | Cria `reminders` (`id`, `consultation_id`, `type`, `trigger_at`, `offset_value`, `offset_unit`, `notification_id`, `created_at`, `updated_at`), aplica `CHECK` para os tipos e unidades e cria índices por Consultation e `trigger_at`; execução transacional e idempotente, sem foreign key | Sim |

O PR 1 não precisou de migration de schema para permitir múltiplos Patients, porque a tabela já aceita vários registros e a coluna `notes` já existia no schema. A Sprint 2 adiciona a migration 5 de Consultations de forma incremental, idempotente e transacional, sem foreign key destrutiva. A Sprint 3 adiciona a migration 6 de Reminders pelo mesmo padrão. Quando o usuário confirma a exclusão explícita de um Patient, as notificações locais relacionadas são canceladas antes da remoção e seus Reminders e Consultations são removidos na mesma transação SQLite, evitando registros órfãos sem cascade silenciosa. Medicamentos e Exames deverão criar suas próprias migrations futuras.

## 5. Repositories

`SQLitePatientRepository` converte as colunas snake_case do SQLite para o domínio camelCase. A listagem ordena os registros por `created_at`, a seleção usa o `id`, a edição atualiza somente os campos básicos previstos pelo PR 1 e a exclusão remove o registro após confirmação na interface. `SQLiteConsultationRepository` expõe `listByPatient`, `getById`, `create`, `update` e `delete`, sempre filtrando por `patientId` no carregamento do familiar ativo; a exclusão também remove os Reminders vinculados. `SQLiteReminderRepository` expõe listagem por Consultation, criação, atualização de `notificationId`, exclusão individual, exclusão por Consultation e `replaceForConsultation` transacional.

A Sprint 2 é o primeiro módulo clínico local e não implementa Medicamentos, Exames ou Documentos/Receitas. Esses módulos deverão possuir entidades, repositories e migrations próprias, sempre com vínculo lógico obrigatório a `patientId`.

## 6. Fluxo de navegação atual

O primeiro uso segue `boas-vindas → perfil do cuidador → cadastro do primeiro familiar → Home`. Depois que existe um cuidador e pelo menos um Patient, a Home mostra o cuidador e o familiar selecionado.

A Home permite selecionar outro Patient, abrir o gerenciamento de familiares e acessar Consultas. A tela de Consultas mostra no topo o familiar ativo, agrupa os registros em `A agendar`, `Próximas` e `Histórico` — incluindo no Histórico as consultas agendadas com data passada — e permite cadastrar, editar status/data/hora e excluir com confirmação explícita. O formulário inclui lembretes opcionais: múltiplas antecedências para consultas agendadas e uma tarefa com data/hora escolhida para consultas `A agendar`; os cards exibem apenas um resumo discreto.
Ao trocar o Patient ativo, o contexto carrega somente as consultas do novo familiar. Se o Patient ativo for excluído, o aplicativo seleciona o primeiro Patient restante; se não restar nenhum, retorna ao cadastro de familiar.

A navegação ainda está concentrada na rota principal para manter o diff pequeno. Uma evolução futura poderá separar as telas em rotas Expo Router quando os módulos clínicos forem introduzidos.

## 7. Decisões de arquitetura

A decisão principal é separar **Caregiver único por aparelho** de **N Patients** e vincular cada módulo clínico ao `patientId` do familiar ativo. A seleção ativa é estado de interface, não uma relação estrutural `Caregiver : Patient`. Consultas não usam foreign key destrutiva; a exclusão de dados vinculados ocorre somente após confirmação explícita do Patient e dentro da mesma transação. As escritas de Consultation e a limpeza de Patient compartilham um mutex em memória; no native a limpeza usa transação exclusiva e no web usa transação comum protegida pelo mutex.

A lista usa `FlatList` para evitar renderização manual de listas longas. As ações principais têm labels acessíveis e áreas de toque grandes. A exclusão é confirmada por `Alert` antes da remoção local. O módulo usa `expo-notifications` exclusivamente para notificações locais: cria um canal Android, solicita permissão no primeiro uso com lembrete, agenda triggers de data e cancela/reagenda por `notificationId`. O texto não inclui observações clínicas, diagnósticos, medicamentos ou documentos.

## 8. Limitações atuais

A Home continua apenas com um resumo mínimo de Consultas do Patient ativo; não há dashboard de lembretes. Medicamentos, Exames e Documentos/Receitas continuam fora do escopo. As notificações são locais e Android-first; não há notificações remotas, Firebase, backend, compartilhamento, sincronização, calendário do dispositivo, APIs externas ou OCR.

O avatar opcional do Caregiver permanece modelado, mas ainda não possui interface de captura ou seleção. A edição do Patient nesta etapa cobre apenas nome, data de nascimento e observações.

## 9. Dívida técnica e bugs conhecidos

A rota principal concentra onboarding, Home e gerenciamento de familiares; essa decisão reduz o risco nesta janela, mas aumenta o tamanho do arquivo e deverá ser revisitada quando os módulos clínicos forem adicionados.

A preferência do Patient ativo permanece no AsyncStorage, fora do SQLite. O registro clínico continua no SQLite, mas a seleção ativa não acompanha eventual backup ou exportação que contenha apenas o banco SQLite — o que é aceitável enquanto o produto permanece Local-Only.

A exportação web pode depender do artefato WASM do `expo-sqlite` disponível no ambiente de bundling; no web, os Reminders podem permanecer persistidos, mas as notificações locais desta Sprint são suportadas no aplicativo Android. O Expo informa que `RECEIVE_BOOT_COMPLETED` é usado para restaurar notificações agendadas após o boot e que Android 12+ exige `SCHEDULE_EXACT_ALARM` para horários exatos; o app declara essa permissão no `app.json`. A confirmação em aparelho físico continua necessária para validar variações de fabricante, economia de bateria e configurações do usuário.

## 10. Backlog recomendado

| Próxima etapa | Conteúdo |
|---|---|
| PR 2 | Concluído: Consultas locais por Patient, incluindo `A agendar` sem data/hora obrigatória |
| PR 3 | Em andamento nesta branch: lembretes locais de Consultations com `expo-notifications` |
| PR 4 | Medicamentos por Patient, sem catálogo ANVISA e sem OCR |
| PR 5 | Exames por Patient, incluindo status `A agendar` sem data/hora obrigatória |
| PR 6 | Documentos/Receitas locais somente quando o fluxo completo de importação, OCR, conferência e aprovação estiver disponível |
| Evolução posterior | Rotas separadas, relacionamento clínico explícito, testes instrumentados no Android e canais futuros como WhatsApp, SMS e e-mail |

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

A Sprint 2 deve ser validada com criação de consulta `A agendar` sem data/hora, persistência após reabertura, edição para `Agendada` com data/hora, isolamento ao trocar Patient, criação para um segundo familiar, mudança para `Realizada` no histórico, exclusão confirmada e resumo correto na Home. Os próximos PRs deverão acrescentar testes para medicamentos, exames e documentos vinculados ao Patient correto. Além dos testes atuais de typecheck, configuração Expo e workflows GitHub Actions, a Sprint 3 valida cenários puros de planejamento: `A agendar` sem lembrete, `A agendar` com data escolhida, múltiplas antecedências, trigger passado e status concluído/cancelado. A confirmação de disparo visual deve ser feita manualmente em APK instalado, com o app em background, quando houver aparelho Android disponível.
