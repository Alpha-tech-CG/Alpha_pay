import { useState } from 'react';
import { View, Text, Pressable, Image, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { AP, radius, font } from '@/design';
import { sandboxLogs as SEED } from '@/merchant-data';

const AVATAR = 'https://lh3.googleusercontent.com/a/ACg8ocLiYBSFTKYcXZ-BjTNzJ-4KhUXVuWbDuZ14FLZIa3tdLwX9_g=s96-c';

export default function DevSandbox() {
  const [logs, setLogs] = useState(SEED);
  const [open, setOpen] = useState<string | null>(SEED[0]?.id ?? null);

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.topbar}>
        <View style={s.brandRow}>
          <Text style={s.brand}>AlphaPay <Text style={s.brandTag}>Console</Text></Text>
          <View style={s.sandboxBadge}>
            <Icon name="code" size={12} color={AP.chart5} />
            <Text style={s.sandboxText}>Sandbox</Text>
          </View>
        </View>
        <Image source={{ uri: AVATAR }} style={s.avatar} />
      </View>

      <View style={s.header}>
        <Text style={s.title}>Sandbox Activity</Text>
        <Pressable style={s.clearBtn} onPress={() => setLogs([])}>
          <Text style={s.clearText}>Clear Logs</Text>
        </Pressable>
      </View>

      <View style={s.streamRow}>
        <View style={s.streamDot} />
        <Text style={s.streamText}>Streaming...</Text>
        <Text style={s.filter}>Filter: All Events</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {logs.length === 0 && <Text style={s.empty}>Logs cleared. Waiting for new events...</Text>}
        {logs.map((l) => {
          const expanded = open === l.id;
          return (
            <Pressable key={l.id} style={s.log} onPress={() => setOpen(expanded ? null : l.id)}>
              <Text style={s.logTime}>{l.time}</Text>
              <View style={{ flex: 1, gap: 6 }}>
                <View style={s.logHead}>
                  <Text style={[s.logCode, { color: l.ok ? AP.chart3 : AP.chart4 }]}>{l.code}</Text>
                  <Text style={s.logMethod}>{l.method}</Text>
                  <View style={s.msChip}><Text style={s.msText}>{l.ms}</Text></View>
                </View>
                {expanded && l.body ? (
                  <Text style={[s.logBody, { color: l.ok ? 'rgba(255,255,255,0.4)' : 'rgba(229,62,62,0.8)' }]}>{l.body}</Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#161b22' },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brand: { fontSize: 16, fontWeight: '900', color: AP.primary },
  brandTag: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.4)' },
  sandboxBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm, backgroundColor: 'rgba(246,173,85,0.1)', borderWidth: 1, borderColor: 'rgba(246,173,85,0.2)' },
  sandboxText: { fontSize: 9, fontWeight: '800', letterSpacing: 1, color: AP.chart5, textTransform: 'uppercase' },
  avatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  title: { fontSize: 24, fontWeight: '900', color: '#fff' },
  clearBtn: { height: 40, paddingHorizontal: 18, backgroundColor: AP.primary, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  clearText: { fontSize: 12, fontWeight: '800', color: AP.secondary },

  streamRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 12 },
  streamDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: AP.chart3 },
  streamText: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 0.5 },
  filter: { marginLeft: 'auto', fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: font.mono },

  scroll: { paddingHorizontal: 16, paddingBottom: 120 },
  empty: { color: 'rgba(255,255,255,0.35)', textAlign: 'center', marginTop: 40, fontFamily: font.mono, fontSize: 12 },
  log: { flexDirection: 'row', gap: 16, padding: 12, borderRadius: radius.sm, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  logTime: { color: 'rgba(255,255,255,0.2)', fontFamily: font.mono, fontSize: 11, paddingTop: 1 },
  logHead: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  logCode: { fontFamily: font.mono, fontSize: 11, fontWeight: '800' },
  logMethod: { color: 'rgba(255,255,255,0.9)', fontFamily: font.mono, fontSize: 11 },
  msChip: { backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  msText: { color: 'rgba(255,255,255,0.4)', fontFamily: font.mono, fontSize: 10 },
  logBody: { fontFamily: font.mono, fontSize: 11, lineHeight: 18 },
});
