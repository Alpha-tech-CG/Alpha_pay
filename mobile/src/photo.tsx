import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';

const KEY = 'alphapay_photo';

type PhotoCtx = { uri: string | null; pick: () => Promise<void>; remove: () => Promise<void> };
const Ctx = createContext<PhotoCtx>({ uri: null, pick: async () => {}, remove: async () => {} });

export function PhotoProvider({ children }: { children: React.ReactNode }) {
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => { if (v) setUri(v); });
  }, []);

  const pick = useCallback(async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
      });
      if (!res.canceled && res.assets[0]?.uri) {
        setUri(res.assets[0].uri);
        AsyncStorage.setItem(KEY, res.assets[0].uri).catch(() => {});
      }
    } catch {
      /* annulé / indisponible : on garde l'avatar par initiales */
    }
  }, []);

  const remove = useCallback(async () => {
    setUri(null);
    AsyncStorage.removeItem(KEY).catch(() => {});
  }, []);

  return <Ctx.Provider value={{ uri, pick, remove }}>{children}</Ctx.Provider>;
}

export const usePhoto = () => useContext(Ctx);
