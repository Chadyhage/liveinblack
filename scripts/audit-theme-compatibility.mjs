#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const failures = []

function read(file) {
  return readFileSync(join(root, file), 'utf8')
}

function walk(directory) {
  const absolute = join(root, directory)
  if (!existsSync(absolute)) return []
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const item = join(directory, entry.name)
    if (entry.isDirectory()) return walk(item)
    return /\.(css|tsx|ts)$/.test(entry.name) ? [item] : []
  })
}

function fail(message) {
  failures.push(message)
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function hexToRgb(value) {
  const normalized = value.replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return null
  const n = Number.parseInt(normalized, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function luminance(rgb) {
  const [r, g, b] = rgb.map((channel) => {
    const value = channel / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(foreground, background) {
  const fg = hexToRgb(foreground)
  const bg = hexToRgb(background)
  if (!fg || !bg) return 0
  const lighter = Math.max(luminance(fg), luminance(bg))
  const darker = Math.min(luminance(fg), luminance(bg))
  return (lighter + 0.05) / (darker + 0.05)
}

function extractVar(source, name, scope = ':root') {
  const escapedScope = scope.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const block = source.match(new RegExp(`${escapedScope}\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1] || ''
  const hexMatch = block.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (hexMatch) return hexMatch[1]
  const rgbVarMatch = block.match(new RegExp(`${name}:\\s*rgb\\(var\\(--([^)]+)\\)\\)`))
  if (!rgbVarMatch) return null
  const rgbMatch = block.match(new RegExp(`--${rgbVarMatch[1]}:\\s*(\\d+),\\s*(\\d+),\\s*(\\d+)`))
  if (!rgbMatch) return null
  return `#${[rgbMatch[1], rgbMatch[2], rgbMatch[3]].map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`
}

const globals = read('app/globals.css')
const staticTheme = read('lib/shared/staticTheme.ts')
for (const token of ['--primary', '--primary-strong', '--primary-ink', '--accent-text', '--danger', '--danger-ink', '--danger-fill', '--danger-border', '--surface', '--surface-2', '--text', '--text-muted', '--text-faint', '--qr-required-white']) {
  if (!globals.includes(token)) fail(`Token theme global manquant : ${token}`)
}
for (const token of ['--primary-rgb', '--primary-strong-rgb', '--obsidian-rgb', '--surface-rgb', '--text-rgb', '--font-size-body', '--font-size-headline', '--line-height-body']) {
  if (!globals.includes(token)) fail(`Primitive design globale manquante : ${token}`)
}
for (const token of ['--font-size-root', '--font-size-document', '--font-size-article-heading', '--font-size-display-2xl', '--font-size-poster']) {
  if (!globals.includes(token)) fail(`Token typographique global manquant : ${token}`)
}
if (/rgba\(245,\s*61,\s*141|rgba\(176,\s*24,\s*96/.test(globals)) {
  fail('Les variantes alpha de la primaire doivent utiliser --primary-rgb, pas recopier les valeurs RGB.')
}
if (!globals.includes(":root[data-theme='light']")) fail('Palette claire data-theme manquante.')
if (!globals.includes('.lb-theme-toggle')) fail('Toggle de theme global manquant.')
if (!read('app/layout.tsx').includes('lib-theme-boot')) fail('Script anti-flash theme manquant dans app/layout.tsx.')
if (!read('app/layout.tsx').includes('suppressHydrationWarning')) fail('Hydratation <html> non protegée pour data-theme.')
if (!read('app/components/layout/ThemeModeToggle.tsx').includes('useSyncExternalStore')) fail('ThemeModeToggle doit eviter les mismatches hydratation via useSyncExternalStore.')
const buttonSource = read('app/components/ui/Button.tsx')
if (/opacity:\s*isDisabled/.test(buttonSource)) fail('Button web ne doit pas baisser toute son opacite disabled, cela fragilise le contraste.')

const darkPrimary = extractVar(globals, '--primary') || '#F53D8D'
const darkSurface = extractVar(globals, '--surface') || '#241a23'
const darkInk = extractVar(globals, '--primary-ink') || '#050505'
const lightPrimary = extractVar(globals, '--primary', ":root[data-theme='light']") || '#b01860'
const lightSurface = extractVar(globals, '--surface', ":root[data-theme='light']") || '#ffffff'
const lightInk = extractVar(globals, '--primary-ink', ":root[data-theme='light']") || '#ffffff'
const lightAccentText = extractVar(globals, '--accent-text', ":root[data-theme='light']") || lightPrimary
if (!staticTheme.includes(`darkBackground: '${extractVar(globals, '--obsidian')}'`)) fail('STATIC_THEME.darkBackground doit rester synchronise avec --obsidian.')
if (!staticTheme.includes(`lightBackground: '${extractVar(globals, '--obsidian', ":root[data-theme='light']")}'`)) fail('STATIC_THEME.lightBackground doit rester synchronise avec --obsidian clair.')
if (!staticTheme.includes(`primary: '${darkPrimary}'`)) fail('STATIC_THEME.primary doit rester synchronise avec --primary.')
if (contrast(darkPrimary, darkSurface) < 4.5) fail('Primary dark doit rester lisible comme texte sur surface sombre.')
if (contrast(darkInk, darkPrimary) < 4.5) fail('Primary ink dark doit rester lisible sur bouton primaire sombre.')
if (contrast(lightAccentText, lightSurface) < 4.5) fail('Accent text light doit rester lisible sur surface claire.')
if (contrast(lightInk, lightPrimary) < 4.5) fail('Primary ink light doit rester lisible sur bouton primaire clair.')

for (const file of walk('app')) {
  const source = read(file)
  const uncommentedSource = stripComments(source)
  if (/(^|[;{]\s*)color-scheme\s*:\s*dark\b/m.test(source) && file !== 'app/globals.css') fail(`color-scheme force dark hors globals : ${file}`)
  if (/colorScheme:\s*['"]dark['"]/.test(source)) fail(`colorScheme React force dark : ${file}`)
  if (/rgba\(\s*(?:224,\s*90,\s*170|255,\s*143,\s*178|194,\s*52,\s*127|143,\s*86,\s*255|255,\s*107,\s*0|220,\s*100,\s*100|220,\s*50,\s*50|255,\s*150,\s*150)/.test(source)) {
    fail(`Ancienne couleur rgba hardcodee hors tokens theme : ${file}`)
  }
  if (/#(?:e05aaa|c2347f|ff9ed2|ff91c9|ff8fb2|cdb4ff|ff6b00)\b/i.test(source)) {
    fail(`Ancienne couleur hex hardcodee hors tokens theme : ${file}`)
  }
  if (/font-size:\s*[0-9]|fontSize:\s*[0-9]/.test(source)) {
    fail(`Taille de texte hardcodee hors tokens theme : ${file}`)
  }
  if (file !== 'app/globals.css' && /#[0-9a-fA-F]{3,8}\b|rgba\((?!var\()/.test(uncommentedSource)) {
    fail(`Couleur hardcodee hors tokens theme : ${file}`)
  }
}

const sharedPrimitives = [
  'app/components/ui/ActionLink.tsx',
  'app/components/ui/Button.tsx',
  'app/components/ui/Card.tsx',
  'app/components/ui/DashboardPageHeader.module.css',
  'app/components/ui/IconButton.tsx',
  'app/components/ui/ImageCropperModal.tsx',
  'app/components/ui/ImmersiveDialog.module.css',
  'app/components/ui/Input.tsx',
  'app/components/ui/Modal.module.css',
  'app/components/ui/Select.tsx',
  'app/components/ui/Skeleton.tsx',
  'app/components/ui/SlideOverModal.module.css',
  'app/components/ui/Spinner.tsx',
  'app/components/ui/StarRating.tsx',
  'app/components/ui/Toast.tsx',
  'app/components/ui/ToastViewport.module.css',
  'app/components/ui/Textarea.tsx',
  'app/components/ui/charts/DonutChart.module.css',
  'app/components/ui/charts/DonutChart.tsx',
  'app/components/ui/charts/LineChartCard.tsx',
  'app/(public)/public-system.css',
  'app/(public)/_components/PublicNav.tsx',
  'app/(public)/_components/Footer.module.css',
  'app/(public)/_components/AuthSplitLayout.module.css',
  'app/(public)/_components/EventListCard.module.css',
  'app/(public)/home/home.module.css',
  'app/(public)/home/page.tsx',
  'app/(public)/blog/blog.module.css',
  'app/(public)/blog/[slug]/page.tsx',
  'app/(public)/blog/benin/benin.module.css',
  'app/(public)/providers/providers.module.css',
  'app/(public)/providers/[id]/ProviderDetailContent.tsx',
  'app/(public)/providers/page.tsx',
  'app/(public)/organizers/page.tsx',
  'app/(public)/search/search.module.css',
  'app/(public)/login/AuthForm.tsx',
  'app/(public)/about/about.module.css',
  'app/(public)/about/page.tsx',
  'app/(public)/about/TabsSection.tsx',
  'app/components/features/account/PaymentSuccessClient.tsx',
  'app/(app)/_components/AgentWorkspaceShell.tsx',
  'app/(app)/_components/AgentWorkspaceShell.module.css',
  'app/(app)/_components/DashboardShell.tsx',
  'app/(app)/_components/DashboardShell.module.css',
  'app/(app)/notifications/NotificationsClient.module.css',
  'app/(app)/my-events/EventWizard.tsx',
  'app/(app)/offer-services/ProposerServicesClient.tsx',
  'app/components/features/events/EventStaffModal.tsx',
  'app/components/features/events/EventCheckoutPanel.tsx',
  'app/components/features/events/PromoCodesPanel.tsx',
  'app/(app)/order/[eventId]/[ticketCode]/CommanderClient.tsx',
  'app/components/features/organizer/OrganizerOnboardingWizard.tsx',
  'app/components/features/provider/PrestataireOnboardingWizard.tsx',
  'app/components/features/organizer/WizardControls.tsx',
  'app/(app)/profile/TicketWallet.tsx',
  'app/components/layout/AgeGateModal.tsx',
  'app/components/layout/CookieConsentBanner.module.css',
  'app/(app)/agent/agent.module.css',
  'app/(app)/messages/MessagesClient.module.css',
  'app/components/features/messaging/ConversationListPane.tsx',
  'app/components/features/messaging/MessagingComposer.tsx',
  'app/components/features/messaging/PollDraftModal.tsx',
  'app/components/features/messaging/EventPickerModal.tsx',
  'app/components/features/messaging/ReportModal.tsx',
  'app/components/features/messaging/ForwardModal.tsx',
  'app/(app)/my-events/MesEvenementsClient.tsx',
  'app/(app)/my-events/MenuItemEditor.tsx',
  'app/(app)/my-events/GuestlistModal.tsx',
  'app/(app)/my-events/BoostModal.tsx',
  'app/(app)/my-events/EventDashboardCard.tsx',
  'app/(app)/my-events/BookingsPanel.module.css',
  'app/(app)/my-events/CancelModal.tsx',
  'app/(app)/my-events/PostponeModal.tsx',
  'app/(app)/my-events/OrganizerAnalytics.tsx',
  'app/(app)/my-events/eventModalHelpers.tsx',
  'app/(app)/my-events/[id]/statistiques/StatistiquesClient.tsx',
  'app/(app)/my-events/page.tsx',
  'app/(app)/profile/parametres/ParametresClient.module.css',
  'app/(app)/profile/ProfilClient.tsx',
  'app/(app)/profile/ProfileOverview.module.css',
  'app/(app)/profile/interested-events/InterestedEventsClient.tsx',
  'app/(app)/profile/followed-organizers/FollowedOrganizersClient.tsx',
  'app/(app)/profile/HelpPanel.module.css',
  'app/(app)/profile/PreferencesWizard.tsx',
  'app/components/layout/AmbientMusicPlayer.tsx',
  'app/(public)/_components/ProviderDirectoryCard.module.css',
  'app/(public)/_components/AccountMenu.tsx',
  'app/(app)/playlist/[eventId]/PlaylistClient.tsx',
  'app/(app)/organizer-studio/StudioClient.tsx',
  'app/components/features/provider/ProviderReviewsClient.tsx',
  'app/(public)/events/[id]/EventDetailContent.tsx',
  'app/(public)/events/[id]/EventDetailContent.module.css',
  'app/(public)/events/[id]/EventShareButton.tsx',
  'app/(public)/events/events.module.css',
  'app/components/features/events/EventInterestButtonClient.tsx',
  'app/components/features/events/ResaleListingsSection.tsx',
  'app/(public)/organizers/organizers.module.css',
  'app/(public)/organizers/[slug]/OrganizerDetailContent.tsx',
  'app/(public)/contact/ContactClient.tsx',
  'app/(app)/my-application/page.tsx',
  'app/(app)/my-shifts/page.tsx',
  'app/(app)/scanner/[eventId]/ScannerClient.tsx',
  'app/(app)/offer-services/SubscriptionPanel.tsx',
  'app/components/features/account/BoostActiveClient.tsx',
  'app/components/features/account/PublicProfileActions.tsx',
  'app/components/features/auth/ConfirmEmailChangeClient.tsx',
  'app/components/features/auth/ResetPasswordClient.tsx',
  'app/components/features/auth/VerifyEmailClient.tsx',
  'app/components/features/messaging/MessageThreadParts.tsx',
  'app/components/features/messaging/MessagingPanels.tsx',
  'app/components/features/organizer/OrganizerFollowButtonClient.tsx',
  'app/components/layout/AgeVerificationGate.tsx',
  'app/components/layout/LegalBackButton.tsx',
  'app/components/layout/LegalPageLayout.tsx',
  'app/ticket/[token]/page.tsx',
  'app/error.tsx',
  'app/not-found.tsx',
  ...walk('app/components/features/agent'),
]
for (const file of sharedPrimitives) {
  let source = read(file)
  if (file === 'app/(app)/profile/TicketWallet.tsx') {
    source = source.replace("background: '#ffffff'", "background: 'var(--qr-required-white)'")
  }
  if (/rgba\(255,\s*255,\s*255/.test(source)) fail(`Blanc transparent hardcode dans primitive partagee : ${file}`)
  if (/#f5f5f7|#fff\b|#ffffff/i.test(source)) fail(`Blanc hardcode dans primitive partagee : ${file}`)
  if (/rgba\(245,\s*245,\s*247/.test(source)) fail(`Texte clair transparent hardcode dans primitive partagee : ${file}`)
  if (/rgba\(10,\s*10,\s*13|rgba\(18,\s*14,\s*22|#101012|#18181c/i.test(source)) fail(`Surface sombre hardcode dans primitive partagee : ${file}`)
  if (/rgba\((?:16|19|20|22|24|25|28|31|35|38),\s*(?:17|20|21|23|25|26|28|32|35|38),\s*(?:20|23|24|27|29|30|36|37|41)/i.test(source)) fail(`Surface sombre RGB hardcode dans primitive partagee : ${file}`)
  if (/#0a0a0b|#131315|#080809|#1c1c1e|#222225|#18191d/i.test(source)) fail(`Surface sombre hex hardcode dans primitive partagee : ${file}`)
  if (/rgba\(99,\s*99,\s*102/i.test(source)) fail(`Fill gris iOS hardcode dans primitive partagee : ${file}`)
}

if (failures.length > 0) {
  console.error(`Audit theme web : ECHEC (${failures.length} probleme${failures.length > 1 ? 's' : ''}).`)
  for (const failure of failures) console.error('- ' + failure)
  process.exit(1)
}

console.log('Audit theme web : OK (palettes, toggle, contrastes et primitives partagees).')
