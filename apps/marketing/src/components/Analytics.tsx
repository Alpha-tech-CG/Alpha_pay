'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import posthog from 'posthog-js';

/**
 * Analytics PostHog (auto-hébergé) — ALP-133.
 *
 * No-op tant que NEXT_PUBLIC_POSTHOG_KEY n'est pas défini (dev local sans
 * instance). En prod, pointe NEXT_PUBLIC_POSTHOG_HOST vers l'instance
 * auto-hébergée. Capture les pages vues à chaque navigation.
 */
export default function Analytics() {
  const pathname = usePathname();

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;
    if (!posthog.__loaded) {
      posthog.init(key, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.posthog.com',
        capture_pageview: false, // on gère manuellement (App Router)
        person_profiles: 'identified_only',
      });
    }
  }, []);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_POSTHOG_KEY && posthog.__loaded) {
      posthog.capture('$pageview', { $current_url: window.location.href });
    }
  }, [pathname]);

  return null;
}
