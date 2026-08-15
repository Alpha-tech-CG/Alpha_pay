/*
 * Icônes SVG (lucide-react-native) — remplacent @expo/vector-icons dont les
 * glyphes (police) ne se rendaient pas en build release. Rendu via
 * react-native-svg (fiable). Même famille d'icônes que le web.
 *
 * L'API imite MaterialIcons : <Icon name="north-east" size={24} color="#fff" />.
 * Les noms sont ceux de MaterialIcons / MaterialCommunityIcons déjà utilisés.
 */
import {
  Landmark, Wallet, CircleUserRound, Snowflake, Plus, PlusCircle, ArrowLeft,
  ArrowDownCircle, ArrowUpCircle, ChevronDown, ArrowRight, Delete, Bell,
  ArrowDownLeft, XCircle, Check, CheckCircle2, ChevronRight, Code2, Nfc, Copy,
  CreditCard, Trash2, Download, Pencil, AlertCircle, History, Home, Hourglass,
  Info, Lock, LogIn, LogOut, Mail, ArrowUpRight, ExternalLink, Banknote, QrCode,
  ScanLine, Receipt, RefreshCw, RotateCcw, Clock, Search, Send, Settings, Share2,
  Shield, ShieldCheck, ShoppingCart, Smartphone, Store, ArrowLeftRight, TrendingUp,
  BadgeCheck, KeyRound, Server, Fingerprint, MonitorSmartphone, Phone, Globe,
  MessageCircle, Link2, User, Eye, EyeOff, Circle, type LucideIcon,
  LayoutDashboard, ShoppingBag, BarChart3, Moon, Languages, Edit3,
  SlidersHorizontal, Bell as BellIcon, Users,
} from 'lucide-react-native';

const MAP: Record<string, LucideIcon> = {
  'ac-unit': Snowflake,
  'account-balance': Landmark,
  'account-balance-wallet': Wallet,
  'account-circle': CircleUserRound,
  'account-multiple': Users,
  add: Plus,
  'add-circle': PlusCircle,
  'arrow-back': ArrowLeft,
  'arrow-circle-down': ArrowDownCircle,
  'arrow-circle-up': ArrowUpCircle,
  'arrow-drop-down': ChevronDown,
  'arrow-forward': ArrowRight,
  backspace: Delete,
  'bell-outline': Bell,
  call: Phone,
  'call-received': ArrowDownLeft,
  cancel: XCircle,
  check: Check,
  'check-circle': CheckCircle2,
  'chevron-right': ChevronRight,
  code: Code2,
  contactless: Nfc,
  'content-copy': Copy,
  'credit-card': CreditCard,
  'credit-card-outline': CreditCard,
  'delete-outline': Trash2,
  devices: MonitorSmartphone,
  dns: Server,
  download: Download,
  edit: Pencil,
  'error-outline': AlertCircle,
  eye: Eye,
  'eye-outline': Eye,
  'eye-off': EyeOff,
  'eye-off-outline': EyeOff,
  fingerprint: Fingerprint,
  history: History,
  home: Home,
  'hourglass-empty': Hourglass,
  info: Info,
  'info-outline': Info,
  'information-outline': Info,
  'link-variant': Link2,
  lock: Lock,
  login: LogIn,
  logout: LogOut,
  mail: Mail,
  'mail-outline': Mail,
  'north-east': ArrowUpRight,
  'notifications-active': Bell,
  'notifications-none': Bell,
  'open-in-new': ExternalLink,
  payments: Banknote,
  'pencil-outline': Pencil,
  person: User,
  public: Globe,
  'qr-code': QrCode,
  'qr-code-scanner': ScanLine,
  'receipt-long': Receipt,
  refresh: RefreshCw,
  replay: RotateCcw,
  schedule: Clock,
  search: Search,
  send: Send,
  settings: Settings,
  'share-variant': Share2,
  shield: Shield,
  'shield-check-outline': ShieldCheck,
  'shopping-cart': ShoppingCart,
  smartphone: Smartphone,
  'south-west': ArrowDownLeft,
  store: Store,
  storefront: Store,
  'swap-horiz': ArrowLeftRight,
  'trending-up': TrendingUp,
  verified: BadgeCheck,
  'verified-user': ShieldCheck,
  'vpn-key': KeyRound,
  whatsapp: MessageCircle,

  // Noms « lucide » directs, utilisés par les écrans AlphaPay restylés.
  'layout-dashboard': LayoutDashboard,
  bell: BellIcon,
  'chevron-down': ChevronDown,
  'arrow-up-right': ArrowUpRight,
  'arrow-down-left': ArrowDownLeft,
  'arrow-left': ArrowLeft,
  'scan-line': ScanLine,
  wallet: Wallet,
  plus: Plus,
  'shopping-bag': ShoppingBag,
  globe: Globe,
  link: Link2,
  snowflake: Snowflake,
  'bar-chart-3': BarChart3,
  'shield-check': ShieldCheck,
  moon: Moon,
  languages: Languages,
  'log-out': LogOut,
  'edit-3': Edit3,
  'sliders-horizontal': SlidersHorizontal,
};

export type IconName = string;

import { Pressable, type StyleProp, type ViewStyle } from 'react-native';

export function Icon({
  name, size = 24, color = '#000', style, onPress,
}: {
  name: string; size?: number; color?: string; style?: StyleProp<ViewStyle>; onPress?: () => void;
}) {
  const Cmp = MAP[name] ?? Circle;
  const el = <Cmp size={size} color={color} strokeWidth={2} style={style as never} />;
  return onPress ? <Pressable onPress={onPress} hitSlop={8}>{el}</Pressable> : el;
}
