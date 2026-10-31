// Composants de formulaire et d'état partagés par les écrans V1 (design banque, @/design).
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { Icon } from '@/components/Icon';
import { AP, radius, soft } from '@/design';
import { ucFont } from '@/uc';
import type { Mode } from '@/api';

export function Button({ label, onPress, busy, disabled, variant = 'primary', style }: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'dark' | 'ghost' | 'danger';
  style?: StyleProp<ViewStyle>;
}) {
  const bg = { primary: AP.primary, dark: AP.secondary, ghost: 'transparent', danger: AP.destructive }[variant];
  const fg = variant === 'ghost' ? AP.primary : '#fff';
  const off = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [k.btn, { backgroundColor: bg, opacity: off ? 0.5 : pressed ? 0.85 : 1 }, variant === 'ghost' && k.btnGhost, style]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[k.btnText, { color: fg }]}>{label}</Text>}
    </Pressable>
  );
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={k.label}>{label}</Text>
      <TextInput placeholderTextColor={AP.mutedForeground} {...props} style={[k.input, props.multiline && { height: 90, textAlignVertical: 'top' }]} />
      {hint ? <Text style={k.hint}>{hint}</Text> : null}
    </View>
  );
}

export function ErrorBox({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <View style={k.error}>
      <Icon name="error-outline" size={18} color={AP.destructive} />
      <Text style={k.errorText}>{message}</Text>
    </View>
  );
}

export function Empty({ icon = 'receipt-long', title, body }: { icon?: string; title: string; body?: string }) {
  return (
    <View style={k.empty}>
      <Icon name={icon} size={36} color={AP.mutedForeground} />
      <Text style={k.emptyTitle}>{title}</Text>
      {body ? <Text style={k.emptyBody}>{body}</Text> : null}
    </View>
  );
}

export function Loading() {
  return (
    <View style={k.empty}>
      <ActivityIndicator color={AP.primary} />
    </View>
  );
}

export function Header({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <View style={k.header}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={k.title}>{title}</Text>
        {subtitle ? <Text style={k.subtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function ModeBadge({ mode }: { mode: Mode }) {
  const live = mode === 'live';
  return (
    <View style={[k.mode, { backgroundColor: live ? soft.chart3_10 : soft.chart5_10 }]}>
      <View style={[k.modeDot, { backgroundColor: live ? AP.chart3 : AP.chart5 }]} />
      <Text style={[k.modeText, { color: live ? AP.chart3 : AP.chart5 }]}>{live ? 'Live' : 'Test'}</Text>
    </View>
  );
}

export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[k.chip, active && k.chipActive]}>
      <Text style={[k.chipText, active && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

export function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <View style={k.infoRow}>
      <Text style={k.infoLabel}>{label}</Text>
      <Text style={k.infoValue} selectable>{value || '—'}</Text>
    </View>
  );
}

export const k = StyleSheet.create({
  btn: { height: 50, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  btnGhost: { borderWidth: 1, borderColor: AP.primary },
  btnText: { fontSize: 15, fontFamily: ucFont.condensed, fontWeight: '700', letterSpacing: 0.4 },
  label: { fontSize: 13, fontFamily: ucFont.condensed, fontWeight: '700', color: AP.secondary },
  hint: { fontSize: 12, color: AP.mutedForeground },
  input: { height: 50, borderWidth: 1, borderColor: AP.border, borderRadius: radius.md, paddingHorizontal: 14, fontSize: 16, color: AP.foreground, backgroundColor: AP.input },
  error: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: soft.destructive10, borderRadius: radius.md, padding: 12 },
  errorText: { flex: 1, color: AP.destructive, fontSize: 14 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 10, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 16, fontFamily: ucFont.condensed, fontWeight: '700', color: AP.secondary, textAlign: 'center' },
  emptyBody: { fontSize: 14, color: AP.mutedForeground, textAlign: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 16 },
  title: { fontSize: 26, fontFamily: ucFont.condensed, fontWeight: '700', color: AP.secondary },
  subtitle: { fontSize: 14, color: AP.mutedForeground },
  mode: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full, alignSelf: 'flex-start' },
  modeDot: { width: 6, height: 6, borderRadius: 3 },
  modeText: { fontSize: 11, fontFamily: ucFont.condensed, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, borderWidth: 1, borderColor: AP.border, backgroundColor: AP.bg },
  chipActive: { backgroundColor: AP.secondary, borderColor: AP.secondary },
  chipText: { fontSize: 13, fontFamily: ucFont.condensed, fontWeight: '700', color: AP.secondary },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: AP.border },
  infoLabel: { fontSize: 14, color: AP.mutedForeground },
  infoValue: { fontSize: 14, color: AP.secondary, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
});
