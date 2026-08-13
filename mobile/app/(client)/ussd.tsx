import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, Animated, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { font } from '@/design';

const GREEN = '#00FF00';
const MENU = [
  '1. Send Money',
  '2. Withdraw Cash',
  '3. Virtual Card',
  '4. My Account',
  '5. Help',
];

export default function Ussd() {
  const router = useRouter();
  const [entry, setEntry] = useState('');
  const blink = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [blink]);

  const send = () => {
    const choice = MENU.find((m) => m.startsWith(entry.trim()));
    if (!choice) return Alert.alert('Invalid', 'Enter a number from the menu (1-5).');
    Alert.alert('USSD', `Selected: ${choice.replace(/^\d+\.\s*/, '')}`);
    setEntry('');
  };

  return (
    <SafeAreaView style={s.root}>
      <View style={s.screen}>
        <View style={{ flex: 1 }}>
          <Text style={s.line}>AlphaPay Menu:</Text>
          {MENU.map((m) => (
            <Text key={m} style={s.line}>{m}</Text>
          ))}

          <View style={s.promptWrap}>
            <View style={s.promptRow}>
              <Text style={s.line}>&gt; </Text>
              <TextInput
                style={s.input}
                value={entry}
                onChangeText={setEntry}
                keyboardType="number-pad"
                maxLength={1}
                autoFocus
                caretHidden
                cursorColor={GREEN}
              />
              {entry.length === 0 && <Animated.View style={[s.cursor, { opacity: blink }]} />}
            </View>

            <View style={s.buttons}>
              <Pressable style={({ pressed }) => [s.btn, pressed && s.btnPressed]} onPress={() => router.back()}>
                {({ pressed }) => <Text style={[s.btnText, pressed && s.btnTextPressed]}>CANCEL</Text>}
              </Pressable>
              <Pressable style={({ pressed }) => [s.btn, pressed && s.btnPressed]} onPress={send}>
                {({ pressed }) => <Text style={[s.btnText, pressed && s.btnTextPressed]}>SEND</Text>}
              </Pressable>
            </View>
          </View>
        </View>

        <View style={s.note}>
          <Text style={s.noteText}>
            Low-data fallback for non-smartphones. This USSD gateway ensures financial access for the unbanked 60% of the population.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  screen: { flex: 1, padding: 16 },
  line: { color: GREEN, fontFamily: font.mono, fontSize: 15, lineHeight: 24 },

  promptWrap: { marginTop: 'auto', borderTopWidth: 1, borderTopColor: GREEN, paddingTop: 16 },
  promptRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, minHeight: 24 },
  input: { color: GREEN, fontFamily: font.mono, fontSize: 15, padding: 0, minWidth: 20 },
  cursor: { width: 10, height: 18, backgroundColor: GREEN },

  buttons: { flexDirection: 'row', gap: 16 },
  btn: { flex: 1, borderWidth: 1, borderColor: GREEN, paddingVertical: 12, alignItems: 'center' },
  btnPressed: { backgroundColor: GREEN },
  btnText: { color: GREEN, fontFamily: font.mono, fontSize: 15, fontWeight: '700' },
  btnTextPressed: { color: '#000' },

  note: { marginTop: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', padding: 12 },
  noteText: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontStyle: 'italic', lineHeight: 14 },
});
