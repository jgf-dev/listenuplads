/**
 * i18n — bilingual EN/FR string tables for the listenuplads PWA.
 *
 * French UI strings expand 20–35% over English; every consumer layout uses
 * flex-wrap + min-height (never fixed heights) so longer FR copy flows instead
 * of clipping. Locale persists in localStorage and switches <html lang>.
 *
 * Copy gate: every string here is user-facing and ships under the JGF-129 copy
 * gate (tone review by the Gay Male Fiction and Erotica Editor and Author).
 */

export type Locale = "en" | "fr";

export const LOCALE_STORAGE_KEY = "listenuplads_locale_v1";

const en = {
  shell: {
    tagline: "Erotic audio stories, mastered for headphones.",
    ageVerified: "18+ confirmed",
    agePending: "18+ gate pending",
    footer: "Adults only · 18+ · Cancel anytime",
    langSwitchLabel: "Passer au français",
    unlockVip: "Unlock VIP — $2.99/mo",
  },
  discovery: {
    filters: "Filters",
    drawerTitle: "Find your story",
    drawerSub: "Tap chips to mix and match. Nothing applies until you say so.",
    clearAll: "Clear all",
    showStories: (n: number) => (n === 1 ? "Show 1 Story" : `Show ${n} Stories`),
    noMatches: "No stories match that mix yet — loosen one filter and try again.",
    resultsHeading: "Stories",
    matchCount: (n: number) => (n === 1 ? "1 story" : `${n} stories`),
    facetDuration: "Duration",
    facetTrope: "Setups",
    facetStyle: "Audio Style",
    facetHeat: "Heat Index",
    heatOption: (n: number) => `Heat ${n} of 5`,
    removeFilter: (label: string) => `Remove filter: ${label}`,
    duration: {
      quick: "Quick Hit · <10 min",
      standard: "Standard · 10–20 min",
      deep: "Deep Dive · 20 min+",
    },
    trope: {
      rivals: "Rivals",
      proximity: "Close Quarters",
      lockerRoom: "Locker Room",
      protector: "Protector",
      taboo: "Taboo",
    },
    style: {
      soundscape: "Immersive Soundscape",
      whisper: "Intimate Whisper",
      dualPov: "Dual POV",
      raw: "Raw Dialogue",
    },
  },
  player: {
    speed: "Speed",
    sleepTimer: "Sleep timer",
    stories: "Stories",
    play: "Play",
    pause: "Pause",
    playTrack: (title: string) => `Play ${title}`,
    back15: "Back 15 seconds",
    fwd15: "Forward 15 seconds",
    sleepOff: "Off",
    sleepEot: "End of track",
    loading: "Loading audio…",
    buffering: "Buffering…",
    tapToPlay: "Tap play to start listening.",
    loadError: "Couldn't load this story. Check your connection and try again.",
    sleepEnded: "Sleep timer ended playback.",
    sleepingIn: (label: string) => `Sleeping in ${label}`,
    pauseAtEnd: "Pausing at end of track",
    aftercareToWarmth: "Switch to Aftercare",
    aftercareToStory: "Back to the Story",
    aftercareHint: "A softer comedown track paired with this story — same world, lower heat.",
    aftercareUnavailable:
      "No Aftercare track for this story yet. The switch turns on when one is mastered.",
    aftercarePlaying: "Aftercare — a softer landing",
    aftercareError: "The Aftercare track couldn't load. Staying with the story.",
    seekAria: "Seek through story",
  },
  checkout: {
    title: "VIP Membership",
    price: "$2.99 / month",
    tabCard: "Card · Discreet",
    tabCrypto: "Crypto · Anonymous",
    cardBannerTitle: "Discreet billing",
    cardBannerBody:
      "Your statement shows LUL MEDIA QC. No adult title, description, or domain name.",
    cardSsl: "SSL-encrypted checkout on a PCI-DSS compliant processor (CCBill, Segpay, or Epoch).",
    cardHandoff:
      "You finish payment on the processor's secure page — we never see or store your card number.",
    cardCancel:
      "One-click cancellation anytime from your account page. No chat, no call, no questions.",
    cardCta: "Continue to Secure Card Checkout",
    cardCtaNote:
      "Card processing goes live with the launch processor account. Nothing is charged today.",
    cryptoBannerTitle: "Zero-Identity Checkout",
    cryptoBannerBody:
      "No legal name, billing address, or credit card recorded. Anonymous wallet-to-wallet transfer.",
    cryptoLedgerNote:
      "Honest note: public blockchains keep a permanent record of wallet addresses and amounts — but never your name, and never what you listened to.",
    close: "Close",
  },
  crypto: {
    selectAsset: "Select payment asset (NOWPayments rail)",
    conversionNote: "No name or card collected on this rail.",
    proceed: "Proceed to Deposit Address",
    cancel: "Cancel",
    stepCurrency: "1. Currency",
    stepDeposit: "2. Deposit",
    stepConfirm: "3. Confirm",
    sendExactly: "Send exactly",
    depositAddress: (network: string) => `Deposit address (${network})`,
    copy: "Copy",
    copied: "Copied!",
    listening: "Listening for incoming blockchain broadcast…",
    simBroadcast: "[Dev/Test] Simulate Tx Broadcast",
    simConfirm: "[Dev/Test] Simulate Confirmation",
    changeCurrency: "← Change currency",
    detectedBadge: "Broadcast detected",
    detectedBody: "Payment spotted on the mempool. Waiting for 1 blockchain confirmation…",
    successTitle: "VIP Access Unlocked",
    successBody: "Your subscription is active. Listen now in the PWA or save stories offline.",
    startListening: "Start Listening",
    privatePill: "Zero identity · Wallet-to-wallet",
  },
  agegate: {
    badge: "18+ Restricted Audience",
    title: "Adult Erotic Audio",
    body: "Listenuplads features mature audio dramas and performed erotic fiction intended exclusively for adult audiences. By entering, you certify that you are at least 18 years of age (or the legal age of majority in your jurisdiction).",
    enter: "I am 18 or older — Enter",
    exit: "Exit",
    disclaimer: "Card billing shows as LUL MEDIA QC. No adult titles on the statement.",
  },
  ageverify: {
    badge: "Age check not live",
    title: "No statutory check on this build",
    body: "Some regions require an independent age check (UK Online Safety Act, French ARCOM, or US state law). That check is not connected. This step does not verify your age and does not send an identity document.",
    cta: "I understand — this is not an age check",
    verifying: "Continuing without a live check…",
    failed: "This step failed. Check your connection and try again.",
    exit: "Exit",
  },
  geoblock: {
    badge: "Regulatory Restriction",
    title: "Region Unavailable",
    body: "Listenuplads is currently unavailable in your region in accordance with local digital content regulations. If you are traveling, you may access your library upon returning to an eligible region.",
    support: "Check Account Support",
    footer: "JGF MEDIA Compliance · Adult Content Verification Services",
  },
} as const;

/** Widen the literal `en` table so the FR mirror can hold its own strings. */
type Widen<T> = {
  [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends (...args: infer A) => string
      ? (...args: A) => string
      : Widen<T[K]>;
};

export type Strings = Widen<typeof en>;

/** FR mirror — keep key structure identical to `en`. */
const fr: Strings = {
  shell: {
    tagline: "Récits audio érotiques, masterisés pour le casque.",
    ageVerified: "18+ confirmé",
    agePending: "Contrôle 18+ en attente",
    footer: "Réservé aux adultes · 18+ · Résiliable à tout moment",
    langSwitchLabel: "Switch to English",
    unlockVip: "Débloquer le VIP — 2,99 $/mois",
  },
  discovery: {
    filters: "Filtres",
    drawerTitle: "Trouvez votre récit",
    drawerSub:
      "Touchez les pastilles pour composer votre sélection. Rien ne s'applique avant votre validation.",
    clearAll: "Tout effacer",
    showStories: (n: number) => (n === 1 ? "Afficher 1 récit" : `Afficher ${n} récits`),
    noMatches: "Aucun récit ne correspond à cette combinaison — élargissez un filtre et réessayez.",
    resultsHeading: "Récits",
    matchCount: (n: number) => (n === 1 ? "1 récit" : `${n} récits`),
    facetDuration: "Durée",
    facetTrope: "Situations",
    facetStyle: "Style audio",
    facetHeat: "Indice de chaleur",
    heatOption: (n: number) => `Chaleur ${n} sur 5`,
    removeFilter: (label: string) => `Retirer le filtre : ${label}`,
    duration: {
      quick: "Coup rapide · <10 min",
      standard: "Standard · 10–20 min",
      deep: "Immersion · 20 min et +",
    },
    trope: {
      rivals: "Rivaux",
      proximity: "Coincés ensemble",
      lockerRoom: "Vestiaire",
      protector: "Protecteur",
      taboo: "Tabou",
    },
    style: {
      soundscape: "Paysage sonore immersif",
      whisper: "Murmure intime",
      dualPov: "Double point de vue",
      raw: "Dialogue brut",
    },
  },
  player: {
    speed: "Vitesse",
    sleepTimer: "Minuterie",
    stories: "Récits",
    play: "Lecture",
    pause: "Pause",
    playTrack: (title: string) => `Lire : ${title}`,
    back15: "Reculer de 15 secondes",
    fwd15: "Avancer de 15 secondes",
    sleepOff: "Désactivée",
    sleepEot: "Fin de piste",
    loading: "Chargement audio…",
    buffering: "Mise en mémoire tampon…",
    tapToPlay: "Touchez lecture pour écouter.",
    loadError: "Impossible de charger ce récit. Vérifiez votre connexion et réessayez.",
    sleepEnded: "La minuterie a arrêté la lecture.",
    sleepingIn: (label: string) => `Arrêt dans ${label}`,
    pauseAtEnd: "Pause en fin de piste",
    aftercareToWarmth: "Passer en Aftercare",
    aftercareToStory: "Retour au récit",
    aftercareHint: "Piste de redescente liée à ce récit — même univers, chaleur plus basse.",
    aftercareUnavailable:
      "Pas encore de piste Aftercare pour ce récit. L'option s'active dès qu'elle est masterisée.",
    aftercarePlaying: "Aftercare — redescente",
    aftercareError: "La piste Aftercare n'a pas chargé. On reste sur le récit.",
    seekAria: "Naviguer dans le récit",
  },
  checkout: {
    title: "Adhésion VIP",
    price: "2,99 $ / mois",
    tabCard: "Carte · Discret",
    tabCrypto: "Crypto · Anonyme",
    cardBannerTitle: "Facturation discrète",
    cardBannerBody:
      "Votre relevé affiche LUL MEDIA QC. Aucun titre, description ni nom de domaine pour adultes.",
    cardSsl: "Paiement chiffré SSL chez un prestataire conforme PCI-DSS (CCBill, Segpay ou Epoch).",
    cardHandoff:
      "Vous finalisez le paiement sur la page sécurisée du prestataire — nous ne voyons ni ne stockons jamais votre numéro de carte.",
    cardCancel:
      "Résiliation en un clic à tout moment depuis votre espace compte. Sans chat, sans appel, sans justification.",
    cardCta: "Continuer vers le paiement sécurisé",
    cardCtaNote:
      "Le paiement par carte sera activé avec le compte prestataire de lancement. Aucun débit aujourd'hui.",
    cryptoBannerTitle: "Paiement zéro identité",
    cryptoBannerBody:
      "Aucun nom légal, adresse de facturation ni carte bancaire enregistrés. Transfert anonyme de portefeuille à portefeuille.",
    cryptoLedgerNote:
      "Note transparente : les blockchains publiques conservent une trace permanente des adresses et montants — jamais votre nom, jamais ce que vous écoutez.",
    close: "Fermer",
  },
  crypto: {
    selectAsset: "Choisir l'actif (NOWPayments)",
    conversionNote: "Aucun nom ni carte sur ce paiement.",
    proceed: "Voir l'adresse de dépôt",
    cancel: "Annuler",
    stepCurrency: "1. Crypto",
    stepDeposit: "2. Dépôt",
    stepConfirm: "3. Confirmation",
    sendExactly: "Envoyez exactement",
    depositAddress: (network: string) => `Adresse de dépôt (${network})`,
    copy: "Copier",
    copied: "Copié !",
    listening: "En attente d'une diffusion sur la blockchain…",
    simBroadcast: "[Dev/Test] Simuler la diffusion Tx",
    simConfirm: "[Dev/Test] Simuler la confirmation",
    changeCurrency: "← Changer de crypto",
    detectedBadge: "Diffusion détectée",
    detectedBody: "Paiement repéré sur la mempool. En attente d'1 confirmation blockchain…",
    successTitle: "Accès VIP débloqué",
    successBody:
      "Votre abonnement est actif. Écoutez dans la PWA ou enregistrez les récits hors ligne.",
    startListening: "Commencer l'écoute",
    privatePill: "Zéro identité · Portefeuille à portefeuille",
  },
  agegate: {
    badge: "Réservé aux 18 ans et plus",
    title: "Audio érotique pour adultes",
    body: "Listenuplads propose des drames audio matures et des fictions érotiques interprétées, destinés exclusivement à un public adulte. En entrant, vous certifiez avoir au moins 18 ans (ou l'âge légal de la majorité dans votre juridiction).",
    enter: "J'ai 18 ans ou plus — Entrer",
    exit: "Quitter",
    disclaimer: "La facture carte affiche LUL MEDIA QC. Aucun titre pour adultes sur le relevé.",
  },
  ageverify: {
    badge: "Contrôle d'âge non branché",
    title: "Pas de contrôle légal sur cette version",
    body: "Certaines régions exigent un contrôle d'âge indépendant (Online Safety Act britannique, ARCOM, ou loi d'un État américain). Ce contrôle n'est pas branché. Cette étape ne vérifie pas votre âge et n'envoie aucune pièce d'identité.",
    cta: "J'ai compris — ce n'est pas un contrôle d'âge",
    verifying: "Poursuite sans contrôle en direct…",
    failed: "Cette étape a échoué. Vérifiez votre connexion et réessayez.",
    exit: "Quitter",
  },
  geoblock: {
    badge: "Restriction réglementaire",
    title: "Région non disponible",
    body: "Listenuplads est actuellement indisponible dans votre région, conformément aux réglementations locales sur les contenus numériques. Si vous voyagez, vous retrouverez votre bibliothèque dans une région éligible.",
    support: "Contacter le support compte",
    footer: "Conformité JGF MEDIA · Services de vérification de contenu adulte",
  },
};

const TABLES: Record<Locale, Strings> = { en, fr };

type StringLeaf = string | ((...args: (string | number)[]) => string);

function lookup(table: Strings, key: string): StringLeaf | undefined {
  let node: unknown = table;
  for (const part of key.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  if (typeof node === "string" || typeof node === "function") {
    return node as StringLeaf;
  }
  return undefined;
}

let currentLocale: Locale = "en";
const listeners = new Set<(locale: Locale) => void>();

export function getLocale(): Locale {
  return currentLocale;
}

/** Initial locale: persisted choice wins; otherwise FR browser → fr, else en. */
export function detectInitialLocale(
  nav: Pick<Navigator, "language"> | null = typeof navigator !== "undefined" ? navigator : null,
): Locale {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored === "en" || stored === "fr") return stored;
  } catch {
    // storage unavailable — fall through to browser detection
  }
  const lang = (nav?.language ?? "").toLowerCase();
  return lang.startsWith("fr") ? "fr" : "en";
}

/** Apply a locale without persisting (used at boot before first paint). */
export function initLocale(locale: Locale): void {
  currentLocale = locale;
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
  }
}

export function setLocale(locale: Locale): void {
  if (locale === currentLocale) return;
  initLocale(locale);
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // non-persistent session still switches
  }
  listeners.forEach((fn) => fn(locale));
}

export function onLocaleChange(fn: (locale: Locale) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Translate a dotted key ("checkout.cardCta") with optional interpolation args
 * for function-valued strings. Falls back to English, then to the key itself.
 */
export function t(key: string, ...args: (string | number)[]): string {
  const entry = lookup(TABLES[currentLocale], key) ?? lookup(TABLES.en, key);
  if (entry === undefined) return key;
  if (typeof entry === "function") {
    return (entry as (...a: (string | number)[]) => string)(...args);
  }
  return entry;
}
