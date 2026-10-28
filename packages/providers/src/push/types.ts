/** Abonnement web push fourni par le navigateur (PushSubscription.toJSON()). */
export interface PushSubscriptionKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Contenu d'une notification affichée par le service worker. */
export interface PushPayload {
  title: string;
  body: string;
  /** Regroupe les notifications d'un même sujet (ex. une caisse). */
  tag?: string;
  /** Page ouverte au clic. */
  url?: string;
  data?: Record<string, unknown>;
}

/**
 * Notifications web push (§M5, VAPID). Un abonnement expiré lève
 * ProviderError `not_found` (non réessayable) : l'appelant le supprime.
 */
export interface WebPushProvider {
  readonly name: string;
  /** Clé publique VAPID transmise au navigateur pour s'abonner. */
  readonly publicKey: string;
  send(subscription: PushSubscriptionKeys, payload: PushPayload, opts?: { ttlSeconds?: number }): Promise<void>;
}
