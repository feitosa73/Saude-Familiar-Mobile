# Handover técnico — Saúde Familiar Mobile Lite

## 1. Estado do repositório

O aplicativo está implementado no monorepo `feitosa73/Saude-Familiar-Mobile`, no pacote `artifacts/saude-familiar-mobile`. A stack atual é React Native com Expo SDK 54, Expo Router, TypeScript, `expo-sqlite`, AsyncStorage e o padrão Repository Pattern. O aplicativo continua **Local-Only**: não há backend, autenticação online, sincronização cloud ou envio de dados de saúde para a Internet.

A `main` atual inclui as Sprints 1, 2, 3, 3.1, 4 e 4.1, incorporadas pelo commit `6cd3566aa63f42f9bf1e9b1af8f626757250c625`, com perfil local de `Caregiver`, múltiplos Patients, Agendamentos unificados de Consultas e Exames, lembretes locais e resumo contextual de Agendamentos na Home. Esta branch acrescenta apenas o acabamento final de release, sem alterar diretamente a `main`.

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

As Sprints iniciais mantêm o fluxo em `app/index.tsx` para evitar uma refatoração ampla de navegação. A tela usa estados internos para alternar entre onboarding, Home, familiares e Agendamentos, com cadastro e edição locais.

## 3. Entidades atuais

`Caregiver` representa a pessoa que utiliza o aplicativo e permanece limitada a um registro local por aparelho. `Patient` representa cada familiar ou pessoa acompanhada. A tabela `patients` não possui restrição de registro único e está preparada para múltiplos registros.

No Sprint 1, `Patient` mantém os campos existentes de identificação, data de nascimento, informações clínicas legadas e timestamps. O cadastro e a edição passam a aceitar também `notes`, uma observação opcional de texto simples.

As operações locais de Patient são `list`, `getFirst`, `getById`, `create`, `update` e `delete`. A seleção do Patient ativo é uma preferência de interface, armazenada localmente sob a chave `saude-familiar.active-patient-id`, sem alterar a cardinalidade do banco. `Consultation` permanece como o nome interno histórico da entidade de Agendamentos e agora possui `type` (`consultation` ou `exam`), vínculo obrigatório a `patientId`, status `pending`, `scheduled`, `completed` ou `cancelled`, e data/hora opcionais. Linhas legadas sem `type` assumem `consultation`. `Reminder` representa zero ou mais lembretes locais vinculados a essa entidade, com `alertMode` (`silent`, `normal` ou `highlight`), `triggerAt`, antecedência opcional e `notificationId` devolvido pelo Android; o mesmo fluxo atende Consultas e Exames.

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
| 7 | Adiciona `alert_mode TEXT NOT NULL DEFAULT 'normal'` em `reminders`, com `CHECK` para `silent`, `normal` e `highlight`; preserva os registros existentes e registra a alteração em `schema_migrations` | Sim |
| 8 | Adiciona `type TEXT NOT NULL DEFAULT 'consultation'` em `consultations`, com `CHECK` para `consultation` e `exam`; preserva todas as Consultations existentes como `consultation` e registra a alteração em `schema_migrations` | Sim |

O Sprint 1 não precisou de migration de schema para permitir múltiplos Patients, porque a tabela já aceita vários registros e a coluna `notes` já existia no schema. A Sprint 2 adiciona a migration 5 de Consultations de forma incremental, idempotente e transacional, sem foreign key destrutiva. A Sprint 3 adiciona a migration 6 de Reminders e a Sprint 3.1 adiciona a migration 7 de `alert_mode`, ambas pelo mesmo padrão. A Sprint 4 adiciona somente a migration 8, que classifica as linhas legadas como `consultation` e permite novos Agendamentos do tipo `exam`, sem criar uma tabela paralela. Essa é a menor evolução segura: preserva IDs e `consultation_id` dos Reminders, mantém a exclusão transacional existente e evita reescrever migrations ou duplicar o serviço de notificações.
 Quando o usuário confirma a exclusão explícita de um Patient, as notificações locais relacionadas são canceladas antes da remoção e seus Reminders e Agendamentos são removidos na mesma transação SQLite, evitando registros órfãos sem cascade silenciosa.

## 5. Repositories

`SQLitePatientRepository` converte as colunas snake_case do SQLite para o domínio camelCase. A listagem ordena os registros por `created_at`, a seleção usa o `id`, a edição atualiza somente os campos básicos previstos pelo Sprint 1 e a exclusão remove o registro após confirmação na interface. `SQLiteConsultationRepository` mantém o nome histórico, mas agora expõe a coleção única de Agendamentos por `patientId`, incluindo `type`, criação, edição, listagem e exclusão; a exclusão também remove os Reminders vinculados. `SQLiteReminderRepository` continua ligado por `consultation_id`, sem alteração estrutural, e atende igualmente Consultas e Exames.

A Sprint 2 foi o primeiro módulo clínico local. A Sprint 4 acrescenta Exames dentro da coleção compatível de Agendamentos, sem implementar resultados, laudos ou análise clínica. Medicamentos e Documentos/Receitas deverão possuir evoluções próprias, sempre com vínculo lógico obrigatório a `patientId`.

## 6. Fluxo de navegação atual

O primeiro uso segue `boas-vindas → perfil do cuidador → cadastro do primeiro familiar → Home`. Depois que existe um cuidador e pelo menos um Patient, a Home mostra o cuidador e o familiar selecionado.

A Home permite selecionar outro Patient, abrir o gerenciamento de familiares e acessar Agendamentos. Após o onboarding, não mantém o banner persistente `Cadastro concluído`; o familiar selecionado, `Gerenciar familiares` e o resumo de Agendamentos ocupam o fluxo principal. A tela única mostra `Agendamentos de {Patient}`, pergunta `O que deseja registrar?` e oferece Consulta ou Exame no mesmo formulário. A listagem agrupa os registros em `A agendar`, `Próximos` e `Histórico`, incluindo itens de ambos os tipos e agendamentos com data passada. O formulário inclui lembretes opcionais: múltiplas antecedências para itens agendados e uma tarefa com data/hora escolhida para itens `A agendar`; os cards diferenciam Consulta e Exame por ícone e label, sem depender somente de cor.
Ao trocar o Patient ativo, o contexto carrega somente os Agendamentos do novo familiar. Se o Patient ativo for excluído, o aplicativo seleciona o primeiro Patient restante; se não restar nenhum, retorna ao cadastro de familiar. Com Consultas e Exames no mesmo ciclo de cadastro, acompanhamento, lembretes, realização e cancelamento, esta Sprint fecha o principal ciclo funcional do Mobile Lite 1.0.

A navegação ainda está concentrada na rota principal para manter o diff pequeno. Uma evolução futura poderá separar as telas em rotas Expo Router quando os módulos clínicos forem introduzidos.

## 7. Decisões de arquitetura

A decisão principal é separar **Caregiver único por aparelho** de **N Patients** e vincular cada módulo clínico ao `patientId` do familiar ativo. A seleção ativa é estado de interface, não uma relação estrutural `Caregiver : Patient`. Consultas não usam foreign key destrutiva; a exclusão de dados vinculados ocorre somente após confirmação explícita do Patient e dentro da mesma transação. As escritas de Consultation e a limpeza de Patient compartilham um mutex em memória; no native a limpeza usa transação exclusiva e no web usa transação comum protegida pelo mutex.

A lista usa `FlatList` para evitar renderização manual de listas longas. As ações principais têm labels acessíveis e áreas de toque grandes. A exclusão é confirmada por `Alert` antes da remoção local. O módulo usa `expo-notifications` exclusivamente para notificações locais: cria canais Android estáveis para `silent`, `normal` e `highlight`, solicita permissão no primeiro uso com lembrete, agenda triggers de data e cancela/reagenda por `notificationId`. Os Reminders são reutilizados para Consultas e Exames; o texto identifica apenas o tipo e o nome principal, sem observações clínicas, diagnósticos, resultados, laudos, medicamentos ou documentos.

## 8. Limitações atuais

A Home mantém o resumo contextual de Agendamentos do Patient ativo, sem o banner persistente `Cadastro concluído` e sem dashboard de lembretes. Resultados de Exames, interpretação clínica, comparação, laudos, anexos, Documentos/Receitas, OCR e Medicamentos continuam fora do escopo. As notificações são locais e Android-first; não há notificações remotas, Firebase, backend, compartilhamento, sincronização, calendário do dispositivo ou APIs externas. `silent` usa apenas a notificação; `normal` usa som padrão, vibração e importância HIGH; `highlight` usa som padrão, vibração e importância MAX para solicitar heads-up quando permitido.

O avatar opcional do Caregiver permanece modelado, mas ainda não possui interface de captura ou seleção. A edição do Patient nesta etapa cobre apenas nome, data de nascimento e observações.

## 9. Dívida técnica e bugs conhecidos

A rota principal concentra onboarding, Home e gerenciamento de familiares; essa decisão reduz o risco nesta janela, mas aumenta o tamanho do arquivo e deverá ser revisitada quando os módulos clínicos forem adicionados.

A preferência do Patient ativo permanece no AsyncStorage, fora do SQLite. O registro clínico continua no SQLite, mas a seleção ativa não acompanha eventual backup ou exportação que contenha apenas o banco SQLite — o que é aceitável enquanto o produto permanece Local-Only.

A exportação web pode depender do artefato WASM do `expo-sqlite` disponível no ambiente de bundling; no web, os Reminders podem permanecer persistidos, mas as notificações locais desta Sprint são suportadas no aplicativo Android. O modo `highlight` apenas solicita apresentação de alta prioridade: o Android pode impedir heads-up/banner conforme as configurações do usuário, e o usuário pode alterar som, vibração e importância do canal no sistema. Fabricantes podem aplicar economia de bateria ou outras restrições. O aplicativo não promete tela cheia e não trata `highlight` como alarme. O Expo informa que `RECEIVE_BOOT_COMPLETED` é usado para restaurar notificações agendadas após o boot e que Android 12+ exige `SCHEDULE_EXACT_ALARM` para horários exatos; o app declara essa permissão no `app.json`. A confirmação em aparelho físico continua necessária.

## 10. Backlog recomendado

| Sprint | Conteúdo |
|---|---|
| Sprint 2 | Concluído: Consultas locais por Patient, incluindo `A agendar` sem data/hora obrigatória |
| Sprint 3 | Concluído: lembretes locais de Consultations com `expo-notifications` |
| Sprint 3.1 | Concluído: modos `silent`, `normal` e `highlight` para alertas locais |
| Sprint 4 | Concluído: Agendamentos unificados de Consultas e Exames |
| Sprint 4.1 | Concluído: resumo contextual de Agendamentos na Home |
| Release 1.0 | Concluído: versionamento Android automático, remoção do banner persistente da Home e compatibilidade de distribuição Android |
| Evolução posterior | Medicamentos por Patient; resultados/laudos de Exames; fluxo completo de Documentos/Receitas quando autorizado; rotas separadas, testes instrumentados e canais futuros |

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

O workflow `Validate Mobile` roda em Pull Requests e em pushes para `main`. Ele instala as dependências com `pnpm install --frozen-lockfile --ignore-scripts`, executa o typecheck do workspace e valida a configuração Expo. O workflow `Build installable APK` é disparado manualmente, em Pull Requests e em pushes para `main`; ele configura Node 22, pnpm 11.22, Java 17, deriva `android.versionCode` de `github.run_number`, valida e registra `Android version: 1.0.0 (N)`, executa `expo prebuild --platform android --no-install --clean`, gera `assembleRelease` e publica o APK com checksum por 14 dias.

O `versionName` (`1.0.0`) identifica a versão funcional do produto. O `versionCode` é um inteiro positivo e crescente que identifica cada build Android; localmente usa fallback seguro `1`, enquanto o CI usa `GITHUB_RUN_NUMBER` sem exigir commit manual. Como o APK mantém `versionName` e `versionCode` Android válidos e crescentes, permanece compatível com o Firebase App Distribution ou outro distribuidor externo, embora nenhuma integração Firebase seja configurada neste repositório.

Não há atualmente integração automatizada com Firebase App Distribution no repositório. O APK pode ser distribuído por esse serviço externamente porque mantém `versionName = 1.0.0` e `versionCode` crescente por build; a integração de upload, credenciais e grupos de distribuição deverá ser tratada como mudança de infraestrutura separada, com autorização explícita.

## 12. Pontos que ainda precisam de testes

Os testes funcionais prioritários do Sprint 1 são: primeira execução; atualização de uma instalação que já possui Caregiver e Patient; persistência após fechar e reabrir; criação de múltiplos Patients; alternância do Patient ativo; garantia de que dados de um Patient não aparecem em outro; edição de dados; exclusão com confirmação; exclusão do Patient ativo; e retorno ao cadastro quando não houver Patients restantes.

A Sprint 2 deve ser validada com criação de consulta `A agendar` sem data/hora, persistência após reabertura, edição para `Agendada` com data/hora, isolamento ao trocar Patient, criação para um segundo familiar, mudança para `Realizada` no histórico, exclusão confirmada e resumo correto na Home. Além dos testes atuais de typecheck, configuração Expo e workflows GitHub Actions, a Sprint 3 valida cenários puros de planejamento e a Sprint 3.1 valida fallback de Reminders antigos, os três modos de alerta, reagendamento e cancelamento. A Sprint 4 valida Consulta e Exame `A agendar` sem data/hora, posterior agendamento, realização, cancelamento, isolamento por Patient, persistência após reabertura, Reminder para ambos os tipos, troca de data/hora, exclusão e migration sem perda de IDs ou `notificationId`. A confirmação de disparo visual deve ser feita manualmente em APK instalado, com o app em background, quando houver aparelho Android disponível.

## 13. iOS Foundation — Sprint 0.1

A Sprint iOS 0.1 mantém Android e iOS na mesma aplicação Expo, sem repositories, banco, domínio, telas ou lógica duplicados. O código de Patient, Caregiver, Agendamentos, Reminders, SQLite e LocalDataContext continua compartilhado; a bifurcação existente permanece limitada ao caminho `Platform.OS === 'web'` onde aplicável.

A configuração iOS agora usa `version = 1.0.0`, `ios.bundleIdentifier = br.com.fiqueok.saudefamiliar` e `ios.supportsTablet = false`, mantendo o primeiro ciclo focado em iPhone. No `expo config`/prebuild local fora de CI e EAS, o `ios.buildNumber` usa o valor seguro `1` quando nenhuma fonte existe. Em GitHub Actions, `IOS_BUILD_NUMBER` tem prioridade, `GITHUB_RUN_NUMBER` é a fonte de fallback e ausência de fonte ou valor inválido falha claramente com a identificação da variável usada. Em builds EAS, o `eas.json` define `cli.appVersionSource = remote` e `autoIncrement = true` em `development`, `preview` e `production`, usando o valor local para inicializar a primeira versão remota quando aplicável; após essa inicialização, o versionamento remoto do EAS é a fonte de verdade e `autoIncrement = true` preserva a sequência, sem reutilização manual do fallback local. O Android mantém o campo `android.package = br.com.fiqueok.saudefamiliar`, o `versionCode` e as permissões atuais sem alteração funcional. O fluxo local e o APK Android do GitHub Actions continuam usando a resolução local/CI existente; somente builds Android do EAS usam versionamento remoto com `appVersionSource = remote` e `autoIncrement = true`.

Foi adicionado `artifacts/saude-familiar-mobile/eas.json` com `cli.appVersionSource = remote` e perfis separados `development`, `preview` e `production`. O perfil `development` usa `expo-dev-client`, `developmentClient = true`, distribuição interna e `autoIncrement = true`; `preview` usa distribuição interna e `autoIncrement = true`; `production` permanece disponível para futura build de loja com `autoIncrement = true`. Não há publicação automática, credenciais Apple, App Store Connect, provisioning profile, certificado, dispositivo registrado ou upload para TestFlight configurado nesta Sprint.

O workflow separado `.github/workflows/ios-validate.yml` preserva `Mobile CI` e `Android APK`. Ele instala dependências, executa typecheck, exporta e valida a configuração Expo, confirma versão, bundle identifier, build number e perfis EAS e executa `expo prebuild --platform ios --no-install --clean` sem assinatura. O workflow não executa build `.ipa`, login Apple ou publicação. O ambiente Ubuntu pode validar o prebuild/configuração, mas não substitui macOS/Xcode para compilação local nem uma build assinada em iPhone.

SQLite permanece em `expo-sqlite` com as migrations 1–8 intactas e repositories compartilhados. O caminho iOS não cria schema separado. O AsyncStorage continua reservado à seleção do Patient ativo. Local-Only significa que os dados não são enviados pelo Mobile à plataforma Saúde Familiar ou a backend/cloud próprio; no iOS, dados do app podem estar sujeitos às funções de backup e restauração do sistema operacional. Esta Sprint não implementa exclusão nativa de backup.

As notificações continuam locais e preservam `silent`, `normal` e `highlight`. Canais Android não são reproduzidos no iOS; a tradução semântica e a validação física dos modos ficam para Sprint posterior. `highlight` no iOS será best effort, sujeito a autorização, Focus, Scheduled Summary, modo silencioso e configurações do sistema. Não foram introduzidos push remoto, APNs server, background remote notifications, alertas críticos ou full-screen alerts.

O deployment target iOS não foi escolhido arbitrariamente nesta Sprint. O valor gerado pelo Expo SDK atual deve ser inspecionado no prebuild e, caso seja necessário explicitá-lo, a decisão deverá considerar Expo SDK 54, React Native 0.81.5 e as bibliotecas nativas instaladas, sem reduzir suporte a dispositivos sem justificativa.

Próximos passos: confirmar o deployment target gerado; executar a build iOS em macOS/Xcode ou EAS quando houver autorização e credenciais; validar SQLite/migrations em dispositivo; testar permissões e lembretes em foreground, background e app encerrado; revisar Safe Area, teclado, VoiceOver, Dynamic Type e iPhones compactos; e somente depois preparar TestFlight. Esta Sprint não altera funcionalidades do Mobile Lite nem autoriza publicação.
