import { ReactNode } from 'react';
import { View, Text, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, STATUS } from './theme';

export function Screen({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, ...(style as object) }} edges={['top']}>
      {children}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return (
    <View
      style={{
        backgroundColor: C.surface,
        borderRadius: 16,
        padding: 16,
        shadowColor: '#0035c5',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
        ...(style as object),
      }}
    >
      {children}
    </View>
  );
}

export function Pill({ status }: { status: string }) {
  const s = STATUS[status as keyof typeof STATUS] ?? {
    label: status,
    color: C.muted,
    bg: C.surfaceContainerHighest,
  };
  return (
    <View style={{ backgroundColor: s.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' }}>
      <Text style={{ color: s.color, fontSize: 11, fontWeight: '700', letterSpacing: 0.3 }}>{s.label}</Text>
    </View>
  );
}

export function SectionLabel({ children }: { children: string }) {
  return (
    <Text style={{ fontSize: 11, fontWeight: '700', color: C.muted, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 }}>
      {children}
    </Text>
  );
}
