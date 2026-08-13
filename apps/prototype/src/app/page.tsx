'use client';
import { useEffect } from 'react';

// Point d'entree de l'app : redirige vers l'ecran wallet (home).
// La landing marketing reste accessible via /landing (et le lanceur d'ecrans).
export default function Index() {
  useEffect(() => {
    window.location.replace('/standard/home/');
  }, []);
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f5f7fa' }}>
      <noscript>
        <a href="/standard/home/">Ouvrir AlphaPay</a>
      </noscript>
    </div>
  );
}
