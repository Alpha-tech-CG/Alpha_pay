import { createContext, useContext, useMemo, useState } from 'react'

const DICT = {
  fr: {
    'nav.dashboard': 'Tableau de bord',
    'nav.developers': 'Développeurs',
    'nav.profile': 'Profil',
    'nav.signout': 'Déconnexion',
    'common.loading': 'Chargement…',
    'common.save': 'Enregistrer',
    'common.next': 'Suivant',
    'common.back': 'Retour',
    'common.finish': 'Terminer',
    'auth.signin.title': 'Connexion marchand',
    'auth.signup.title': 'Créer un compte marchand',
    'auth.toSignup': 'Pas encore de compte ? S’inscrire',
    'auth.toSignin': 'Déjà un compte ? Se connecter',
    'onboarding.title': 'Bienvenue chez PayBrain',
    'onboarding.step.company': 'Entreprise',
    'onboarding.step.contact': 'Contact',
    'onboarding.step.verify': 'Vérification email',
    'onboarding.step.welcome': 'Bienvenue',
    'onboarding.company.legalName': 'Raison sociale',
    'onboarding.company.tradeName': 'Nom commercial',
    'onboarding.company.country': 'Pays',
    'onboarding.contact.fullName': 'Nom du contact',
    'onboarding.contact.phone': 'Téléphone',
    'onboarding.contact.address': 'Adresse',
    'onboarding.verify.text': 'Confirme ton adresse email pour sécuriser ton compte.',
    'onboarding.verify.verified': 'Email vérifié ✓',
    'onboarding.verify.pending': 'Email non vérifié — vérifie ta boîte mail.',
    'onboarding.welcome.text': 'Ton espace marchand est prêt. Tu peux maintenant encaisser des paiements.',
    'onboarding.welcome.cta': 'Accéder au tableau de bord',
    'profile.title': 'Profil marchand',
    'profile.legalName': 'Raison sociale',
    'profile.tradeName': 'Nom commercial',
    'profile.address': 'Adresse',
    'profile.contactName': 'Nom du contact',
    'profile.contactPhone': 'Téléphone du contact',
    'profile.contactEmail': 'Email du contact',
    'profile.saved': 'Profil enregistré',
    'dash.title': 'Dashboard Marchand',
    'dash.realtime': 'Temps réel actif',
    'dash.reconnecting': 'Reconnexion…',
  },
  en: {
    'nav.dashboard': 'Dashboard',
    'nav.developers': 'Developers',
    'nav.profile': 'Profile',
    'nav.signout': 'Sign out',
    'common.loading': 'Loading…',
    'common.save': 'Save',
    'common.next': 'Next',
    'common.back': 'Back',
    'common.finish': 'Finish',
    'auth.signin.title': 'Merchant sign in',
    'auth.signup.title': 'Create a merchant account',
    'auth.toSignup': 'No account yet? Sign up',
    'auth.toSignin': 'Already have an account? Sign in',
    'onboarding.title': 'Welcome to PayBrain',
    'onboarding.step.company': 'Company',
    'onboarding.step.contact': 'Contact',
    'onboarding.step.verify': 'Email verification',
    'onboarding.step.welcome': 'Welcome',
    'onboarding.company.legalName': 'Legal name',
    'onboarding.company.tradeName': 'Trade name',
    'onboarding.company.country': 'Country',
    'onboarding.contact.fullName': 'Contact name',
    'onboarding.contact.phone': 'Phone',
    'onboarding.contact.address': 'Address',
    'onboarding.verify.text': 'Confirm your email address to secure your account.',
    'onboarding.verify.verified': 'Email verified ✓',
    'onboarding.verify.pending': 'Email not verified — check your inbox.',
    'onboarding.welcome.text': 'Your merchant space is ready. You can now collect payments.',
    'onboarding.welcome.cta': 'Go to dashboard',
    'profile.title': 'Merchant profile',
    'profile.legalName': 'Legal name',
    'profile.tradeName': 'Trade name',
    'profile.address': 'Address',
    'profile.contactName': 'Contact name',
    'profile.contactPhone': 'Contact phone',
    'profile.contactEmail': 'Contact email',
    'profile.saved': 'Profile saved',
    'dash.title': 'Merchant Dashboard',
    'dash.realtime': 'Realtime on',
    'dash.reconnecting': 'Reconnecting…',
  },
}

const I18nContext = createContext(null)

export function I18nProvider({ children }) {
  const [locale, setLocale] = useState(() => localStorage.getItem('pb_locale') || 'fr')

  const value = useMemo(() => {
    const setAndPersist = (l) => {
      localStorage.setItem('pb_locale', l)
      setLocale(l)
    }
    const t = (key) => DICT[locale]?.[key] ?? DICT.fr[key] ?? key
    return { locale, setLocale: setAndPersist, t, toggle: () => setAndPersist(locale === 'fr' ? 'en' : 'fr') }
  }, [locale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useT() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useT must be used within I18nProvider')
  return ctx
}
