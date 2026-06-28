import { ReactNode } from 'react';
import { View, Text, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, STATUS } from './theme';

export function Screen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 }}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: C.text }}>{title}</Text>
      </View>
      {children}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return (
    <View
      style={{
        backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
        borderRadius: 14, padding: 16, ...style,
      }}
    >
      {children}
    </View>
  );
}

export function Pill({ status }: { status: string }) {
  const s = STATUS[status as keyof typeof STATUS] ?? { label: status, color: C.muted, bg: C.surfaceAlt };
  return (
    <View style={{ backgroundColor: s.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' }}>
      <Text style={{ color: s.color, fontSize: 12, fontWeight: '700' }}>{s.label}</Text>
    </View>
  );
}
