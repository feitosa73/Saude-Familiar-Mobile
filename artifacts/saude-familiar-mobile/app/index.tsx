import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import type { Caregiver } from "@/domain/caregiver";
import type { Patient } from "@/domain/patient";
import { useColors } from "@/hooks/useColors";
import { useLocalData } from "@/context/LocalDataContext";

type OnboardingStep = "welcome" | "caregiver-form";

function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

function formatBirthDateInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);

  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function parseCivilDate(value: string): string | null {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;

  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  const currentYear = new Date().getFullYear();

  if (year < 1900 || year > currentYear || month < 1 || month > 12) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${yearText}-${monthText}-${dayText}`;
}

function formatCivilDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function LocalBadge() {
  const colors = useColors();

  return (
    <View
      accessibilityLabel="Dados somente neste aparelho"
      style={[
        styles.localBadge,
        { backgroundColor: colors.secondary, borderColor: colors.border },
      ]}
    >
      <Ionicons name="lock-closed-outline" size={16} color={colors.primary} />
      <Text
        style={[styles.localBadgeText, { color: colors.secondaryForeground }]}
      >
        Somente neste aparelho
      </Text>
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID: string;
}) {
  const colors = useColors();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.primaryButton,
        { backgroundColor: colors.primary },
        pressed && !disabled ? styles.pressed : null,
        disabled ? { backgroundColor: colors.muted } : null,
      ]}
    >
      {disabled ? (
        <ActivityIndicator color={colors.mutedForeground} />
      ) : (
        <>
          <Text
            style={[
              styles.primaryButtonText,
              { color: colors.primaryForeground },
            ]}
          >
            {label}
          </Text>
          <Ionicons
            name="arrow-forward"
            size={20}
            color={colors.primaryForeground}
          />
        </>
      )}
    </Pressable>
  );
}

function WelcomeScreen({ onStart }: { onStart: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[
          styles.welcomeContent,
          { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 28 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandRow}>
          <Image
            accessibilityLabel="Símbolo Saúde Familiar"
            source={require("../assets/images/icon.png")}
            style={styles.logo}
          />
          <View>
            <Text style={[styles.brandName, { color: colors.foreground }]}>
              Saúde Familiar
            </Text>
            <Text
              style={[styles.brandCaption, { color: colors.mutedForeground }]}
            >
              Cuidado simples, no seu ritmo
            </Text>
          </View>
        </View>

        <View style={styles.welcomeHero}>
          <View style={[styles.heroIcon, { backgroundColor: colors.accent }]}>
            <Ionicons
              name="heart-outline"
              size={42}
              color={colors.accentForeground}
            />
          </View>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>
            PRIMEIRO PASSO
          </Text>
          <Text style={[styles.welcomeTitle, { color: colors.foreground }]}>
            Antes de começar, conte quem está cuidando.
          </Text>
          <Text
            style={[
              styles.welcomeDescription,
              { color: colors.mutedForeground },
            ]}
          >
            Diga como podemos chamar você. Depois, vamos cadastrar a pessoa que
            você quer acompanhar.
          </Text>
        </View>

        <View style={styles.promiseList}>
          <PromiseRow
            icon="sparkles-outline"
            text="Uma experiência simples para começar"
          />
          <PromiseRow
            icon="shield-checkmark-outline"
            text="Seus dados ficam neste aparelho"
          />
          <PromiseRow icon="wifi-outline" text="Funciona mesmo sem Internet" />
        </View>

        <View style={styles.welcomeAction}>
          <PrimaryButton
            label="Criar meu perfil"
            onPress={onStart}
            testID="welcome-start"
          />
          <Text style={[styles.actionHint, { color: colors.mutedForeground }]}>
            Leva menos de um minuto
          </Text>
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

function PromiseRow({
  icon,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
}) {
  const colors = useColors();

  return (
    <View style={styles.promiseRow}>
      <View style={[styles.promiseIcon, { backgroundColor: colors.secondary }]}>
        <Ionicons name={icon} size={19} color={colors.primary} />
      </View>
      <Text style={[styles.promiseText, { color: colors.foreground }]}>
        {text}
      </Text>
    </View>
  );
}

function CaregiverForm({
  onBack,
  onSaved,
}: {
  onBack: () => void;
  onSaved: (name: string) => Promise<void>;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit() {
    Keyboard.dismiss();
    setError(null);

    if (name.trim().length < 2) {
      setError("Informe seu nome para continuar.");
      return;
    }

    setIsSaving(true);
    try {
      await onSaved(name.trim());
    } catch {
      setError("Não foi possível salvar agora. Tente novamente.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[
          styles.formContent,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 },
        ]}
        bottomOffset={72}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          accessibilityLabel="Voltar para a introdução"
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [
            styles.backButton,
            { backgroundColor: colors.card, borderColor: colors.border },
            pressed ? styles.pressed : null,
          ]}
          testID="caregiver-form-back"
        >
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </Pressable>

        <View style={[styles.formIcon, { backgroundColor: colors.secondary }]}>
          <Ionicons
            name="person-circle-outline"
            size={30}
            color={colors.primary}
          />
        </View>
        <Text style={[styles.formTitle, { color: colors.foreground }]}>
          Como podemos chamar você?
        </Text>
        <Text
          style={[styles.formDescription, { color: colors.mutedForeground }]}
        >
          Este é o seu perfil de quem está cuidando. Depois, você poderá
          cadastrar o familiar que deseja acompanhar.
        </Text>

        <View style={styles.formFields}>
          <FieldLabel label="Seu nome" required />
          <TextInput
            accessibilityLabel="Seu nome"
            autoCapitalize="words"
            autoCorrect={false}
            onChangeText={setName}
            onSubmitEditing={() => void handleSubmit()}
            placeholder="Ex.: Paulo da Silva"
            placeholderTextColor={colors.mutedForeground}
            returnKeyType="done"
            style={[
              styles.input,
              {
                backgroundColor: colors.card,
                borderColor: colors.input,
                color: colors.foreground,
              },
            ]}
            testID="caregiver-name-input"
            value={name}
          />
        </View>

        {error ? (
          <View style={[styles.errorBox, { backgroundColor: colors.accent }]}>
            <Ionicons
              name="alert-circle-outline"
              size={20}
              color={colors.accentForeground}
            />
            <Text
              style={[styles.errorText, { color: colors.accentForeground }]}
            >
              {error}
            </Text>
          </View>
        ) : null}

        <View style={styles.formAction}>
          <PrimaryButton
            disabled={isSaving}
            label="Salvar meu perfil"
            onPress={() => void handleSubmit()}
            testID="caregiver-save"
          />
          <View style={styles.privacyNote}>
            <Ionicons
              name="lock-closed-outline"
              size={16}
              color={colors.primary}
            />
            <Text
              style={[styles.privacyText, { color: colors.mutedForeground }]}
            >
              Seu nome fica somente neste aparelho
            </Text>
          </View>
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

function PatientForm({
  onBack,
  onSaved,
}: {
  onBack?: () => void;
  onSaved: (name: string, birthDate?: string | null) => Promise<void>;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit() {
    Keyboard.dismiss();
    setError(null);

    if (name.trim().length < 2) {
      setError("Informe o nome do familiar para continuar.");
      return;
    }

    const civilDate = birthDate.trim() ? parseCivilDate(birthDate) : null;
    if (birthDate.trim() && !civilDate) {
      setError("Informe uma data de nascimento válida no formato DD/MM/AAAA.");
      return;
    }

    setIsSaving(true);
    try {
      await onSaved(name.trim(), civilDate);
    } catch {
      setError("Não foi possível salvar agora. Tente novamente.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[
          styles.formContent,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 },
        ]}
        bottomOffset={72}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {onBack ? (
          <Pressable
            accessibilityLabel="Voltar para a introdução"
            accessibilityRole="button"
            onPress={onBack}
            style={({ pressed }) => [
              styles.backButton,
              { backgroundColor: colors.card, borderColor: colors.border },
              pressed ? styles.pressed : null,
            ]}
            testID="patient-form-back"
          >
            <Ionicons name="arrow-back" size={22} color={colors.foreground} />
          </Pressable>
        ) : null}

        <View style={[styles.formIcon, { backgroundColor: colors.secondary }]}>
          <Ionicons name="person-outline" size={30} color={colors.primary} />
        </View>
        <Text style={[styles.formTitle, { color: colors.foreground }]}>
          Quem você quer acompanhar?
        </Text>
        <Text
          style={[styles.formDescription, { color: colors.mutedForeground }]}
        >
          Cadastre um familiar para começar. Você poderá completar outras
          informações depois.
        </Text>

        <View style={styles.formFields}>
          <FieldLabel label="Nome do familiar" required />
          <TextInput
            accessibilityLabel="Nome do familiar"
            autoCapitalize="words"
            autoCorrect={false}
            onChangeText={setName}
            placeholder="Ex.: João da Silva"
            placeholderTextColor={colors.mutedForeground}
            returnKeyType="next"
            style={[
              styles.input,
              {
                backgroundColor: colors.card,
                borderColor: colors.input,
                color: colors.foreground,
              },
            ]}
            testID="patient-name-input"
            value={name}
          />

          <FieldLabel label="Data de nascimento" />
          <TextInput
            accessibilityLabel="Data de nascimento"
            keyboardType="number-pad"
            maxLength={10}
            onChangeText={(value) => setBirthDate(formatBirthDateInput(value))}
            placeholder="DD/MM/AAAA"
            placeholderTextColor={colors.mutedForeground}
            style={[
              styles.input,
              {
                backgroundColor: colors.card,
                borderColor: colors.input,
                color: colors.foreground,
              },
            ]}
            testID="patient-birth-date-input"
            value={birthDate}
          />
          <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>
            Opcional. Você poderá informar depois.
          </Text>
        </View>

        {error ? (
          <View style={[styles.errorBox, { backgroundColor: colors.accent }]}>
            <Ionicons
              name="alert-circle-outline"
              size={20}
              color={colors.accentForeground}
            />
            <Text
              style={[styles.errorText, { color: colors.accentForeground }]}
            >
              {error}
            </Text>
          </View>
        ) : null}

        <View style={styles.formAction}>
          <PrimaryButton
            disabled={isSaving}
            label="Salvar familiar"
            onPress={() => void handleSubmit()}
            testID="patient-save"
          />
          <View style={styles.privacyNote}>
            <Ionicons
              name="lock-closed-outline"
              size={16}
              color={colors.primary}
            />
            <Text
              style={[styles.privacyText, { color: colors.mutedForeground }]}
            >
              Salvo somente neste aparelho
            </Text>
          </View>
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

function FieldLabel({
  label,
  required,
}: {
  label: string;
  required?: boolean;
}) {
  const colors = useColors();

  return (
    <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
      {label}
      {required ? <Text style={{ color: colors.primary }}> *</Text> : null}
    </Text>
  );
}

function HomeScreen({
  caregiver,
  patient,
}: {
  caregiver: Caregiver;
  patient: Patient;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[
          styles.homeContent,
          { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.homeHeader}>
          <View style={styles.homeHeaderCopy}>
            <Text style={[styles.homeEyebrow, { color: colors.primary }]}>
              SEU ESPAÇO
            </Text>
            <Text style={[styles.homeTitle, { color: colors.foreground }]}>
              Olá, {firstNameOf(caregiver.name)}.
            </Text>
            <Text
              style={[styles.homeSubtitle, { color: colors.mutedForeground }]}
            >
              Você está acompanhando {patient.name}.
            </Text>
          </View>
          <View
            style={[styles.homeAvatar, { backgroundColor: colors.primary }]}
          >
            <Ionicons
              name="person"
              size={25}
              color={colors.primaryForeground}
            />
          </View>
        </View>

        <LocalBadge />

        <View
          style={[
            styles.readyCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={[styles.readyIcon, { backgroundColor: colors.accent }]}>
            <Ionicons
              name="checkmark-circle"
              size={28}
              color={colors.accentForeground}
            />
          </View>
          <Text style={[styles.readyTitle, { color: colors.foreground }]}>
            Cadastro concluído
          </Text>
          <Text
            style={[styles.readyDescription, { color: colors.mutedForeground }]}
          >
            {patient.name} já está pronto para ser acompanhado.
          </Text>
          <View
            style={[styles.patientSummary, { borderTopColor: colors.border }]}
          >
            <Ionicons
              name="calendar-outline"
              size={18}
              color={colors.primary}
            />
            <Text
              style={[styles.patientSummaryText, { color: colors.foreground }]}
            >
              {patient.birthDate
                ? `Nascimento: ${formatCivilDate(patient.birthDate)}`
                : "Data de nascimento não informada"}
            </Text>
          </View>
        </View>

        <View style={[styles.infoCard, { backgroundColor: colors.secondary }]}>
          <Ionicons
            name="shield-checkmark-outline"
            size={22}
            color={colors.primary}
          />
          <View style={styles.infoCopy}>
            <Text
              style={[styles.infoTitle, { color: colors.secondaryForeground }]}
            >
              Dados somente neste aparelho
            </Text>
            <Text
              style={[
                styles.infoDescription,
                { color: colors.mutedForeground },
              ]}
            >
              Nesta primeira versão, nada é enviado para a Internet. Você pode
              continuar usando o aplicativo mesmo sem conexão.
            </Text>
          </View>
        </View>

        <Text style={[styles.homeFooter, { color: colors.mutedForeground }]}>
          Saúde Familiar · versão Local-Only
        </Text>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

function DatabaseErrorScreen({ onRetry }: { onRetry: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.centeredPage,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      <View style={[styles.errorPageIcon, { backgroundColor: colors.accent }]}>
        <Ionicons
          name="refresh-outline"
          size={32}
          color={colors.accentForeground}
        />
      </View>
      <Text style={[styles.errorPageTitle, { color: colors.foreground }]}>
        Não conseguimos abrir o app
      </Text>
      <Text style={[styles.errorPageText, { color: colors.mutedForeground }]}>
        Seus dados não foram alterados. Tente abrir novamente.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={({ pressed }) => [
          styles.retryButton,
          { backgroundColor: colors.primary },
          pressed ? styles.pressed : null,
        ]}
        testID="database-retry"
      >
        <Text style={[styles.retryText, { color: colors.primaryForeground }]}>
          Tentar novamente
        </Text>
      </Pressable>
    </View>
  );
}

export default function IndexScreen() {
  const { status, caregiver, patient, createCaregiver, createPatient, retry } =
    useLocalData();
  const [step, setStep] = useState<OnboardingStep>("welcome");

  if (status === "loading") {
    return <LoadingScreen />;
  }

  if (status === "error") {
    return <DatabaseErrorScreen onRetry={() => void retry()} />;
  }

  if (caregiver && patient) {
    return <HomeScreen caregiver={caregiver} patient={patient} />;
  }

  if (!caregiver) {
    if (step === "welcome") {
      return <WelcomeScreen onStart={() => setStep("caregiver-form")} />;
    }

    return (
      <CaregiverForm
        onBack={() => setStep("welcome")}
        onSaved={async (name) => {
          await createCaregiver({ name });
        }}
      />
    );
  }

  return (
    <PatientForm
      onSaved={async (name, birthDate) => {
        await createPatient({ name, birthDate });
      }}
    />
  );
}

function LoadingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.centeredPage,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
        Preparando seu espaço...
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  centeredPage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  welcomeContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    justifyContent: "space-between",
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  logo: { width: 48, height: 48, borderRadius: 14 },
  brandName: { fontSize: 17, fontFamily: "Inter_700Bold" },
  brandCaption: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 2 },
  welcomeHero: { marginTop: 42 },
  heroIcon: {
    width: 76,
    height: 76,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 26,
  },
  eyebrow: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.3,
    marginBottom: 12,
  },
  welcomeTitle: {
    fontSize: 34,
    lineHeight: 40,
    fontFamily: "Inter_700Bold",
    maxWidth: 350,
  },
  welcomeDescription: {
    fontSize: 17,
    lineHeight: 25,
    fontFamily: "Inter_400Regular",
    marginTop: 18,
    maxWidth: 350,
  },
  promiseList: { gap: 14, marginTop: 32 },
  promiseRow: { flexDirection: "row", alignItems: "center", gap: 13 },
  promiseIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  promiseText: { fontSize: 15, fontFamily: "Inter_500Medium", flex: 1 },
  welcomeAction: { marginTop: 38 },
  actionHint: {
    fontSize: 13,
    textAlign: "center",
    fontFamily: "Inter_400Regular",
    marginTop: 12,
  },
  primaryButton: {
    minHeight: 58,
    borderRadius: 18,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  primaryButtonText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  pressed: { opacity: 0.78 },
  formContent: { flexGrow: 1, paddingHorizontal: 24 },
  backButton: {
    width: 46,
    height: 46,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 30,
  },
  formIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  formTitle: { fontSize: 30, lineHeight: 36, fontFamily: "Inter_700Bold" },
  formDescription: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: "Inter_400Regular",
    marginTop: 12,
    maxWidth: 350,
  },
  formFields: { marginTop: 34, gap: 10 },
  fieldLabel: { fontSize: 14, fontFamily: "Inter_700Bold", marginTop: 6 },
  input: {
    minHeight: 56,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
  fieldHint: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  errorBox: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    marginTop: 20,
    alignItems: "flex-start",
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: "Inter_500Medium",
  },
  formAction: { marginTop: "auto", paddingTop: 34 },
  privacyNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 14,
  },
  privacyText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  localBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 22,
  },
  localBadgeText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  homeContent: { paddingHorizontal: 24 },
  homeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  homeHeaderCopy: { flex: 1, paddingRight: 14 },
  homeEyebrow: {
    fontSize: 12,
    letterSpacing: 1.3,
    fontFamily: "Inter_700Bold",
    marginBottom: 8,
  },
  homeTitle: { fontSize: 30, lineHeight: 36, fontFamily: "Inter_700Bold" },
  homeSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: "Inter_400Regular",
    marginTop: 6,
  },
  homeAvatar: {
    width: 56,
    height: 56,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  readyCard: { borderWidth: 1, borderRadius: 24, padding: 22, marginTop: 28 },
  readyIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  readyTitle: { fontSize: 21, fontFamily: "Inter_700Bold" },
  readyDescription: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: "Inter_400Regular",
    marginTop: 7,
  },
  patientSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderTopWidth: 1,
    paddingTop: 16,
    marginTop: 20,
  },
  patientSummaryText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  infoCard: {
    flexDirection: "row",
    gap: 13,
    borderRadius: 20,
    padding: 18,
    marginTop: 16,
    alignItems: "flex-start",
  },
  infoCopy: { flex: 1 },
  infoTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  infoDescription: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: "Inter_400Regular",
    marginTop: 5,
  },
  homeFooter: {
    textAlign: "center",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginTop: 32,
  },
  errorPageIcon: {
    width: 70,
    height: 70,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  errorPageTitle: {
    fontSize: 22,
    textAlign: "center",
    fontFamily: "Inter_700Bold",
  },
  errorPageText: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    fontFamily: "Inter_400Regular",
    marginTop: 10,
    maxWidth: 300,
  },
  retryButton: {
    borderRadius: 16,
    minHeight: 52,
    paddingHorizontal: 22,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  retryText: { fontSize: 15, fontFamily: "Inter_700Bold" },
  loadingText: { fontSize: 14, fontFamily: "Inter_500Medium", marginTop: 14 },
});
