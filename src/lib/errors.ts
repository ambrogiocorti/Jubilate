/**
 * Maps backend / network errors to clear Italian messages. Raw technical
 * messages are never shown to end users (they go to the console only).
 */
const MESSAGES: Record<string, string> = {
  not_authenticated: 'Accedi per continuare.',
  not_authorized: 'Non hai i permessi per questa operazione.',
  not_found: 'Contenuto non trovato o non più disponibile.',
  rate_limited: 'Troppi tentativi. Attendi qualche minuto e riprova.',
  room_not_found: 'Nessuna stanza attiva con questo codice.',
  room_closed: 'La stanza è terminata.',
  membership_revoked: 'Il direttore ha revocato la tua partecipazione a questa stanza.',
  stale_state: 'Lo stato della stanza è cambiato da un altro dispositivo. Aggiornato.',
  duplicate_song_number: 'Esiste già un canto con questo numero.',
  cannot_publish_without_content: 'Non è possibile pubblicare un canto senza testo.',
  request_already_pending: 'Hai già una richiesta in attesa di valutazione.',
  already_director: 'Hai già il ruolo di direttore.',
  request_not_pending: 'Questa richiesta è già stata valutata.',
  cannot_revoke_own_admin: 'Non puoi revocare il tuo stesso ruolo di amministratore.',
  last_admin: "Sei l'unico amministratore: nomina un altro amministratore prima di eliminare il tuo account.",
  cannot_suspend_self: 'Non puoi sospendere il tuo account.',
  contribution_locked: 'La proposta è già in revisione e non può essere modificata.',
  contribution_not_reviewable: 'La proposta non è in uno stato valutabile.',
  conflict_outdated_base: 'La versione ufficiale è cambiata dopo questa proposta. Confronta le differenze prima di approvare.',
  reason_required: 'Indica una motivazione.',
  media_not_found: 'La registrazione collegata non esiste più.',
  missing_musicxml: 'La proposta non contiene uno spartito.',
  arrangement_not_accessible: 'Non hai accesso a questa versione personale.',
  song_not_found: 'Canto non disponibile.',
  no_setlist: 'Questa stanza non ha una scaletta.',
  celebration_not_found: 'Celebrazione non trovata.',
  invalid_content: 'Il contenuto del canto non è valido.',
  invalid_status: 'Operazione non consentita sullo stato della proposta.',
  'Invalid login credentials': 'E-mail o password non corretti.',
  'Email not confirmed': 'Conferma il tuo indirizzo e-mail prima di accedere.',
  'User already registered': 'Esiste già un account con questa e-mail.',
};

export function errorCode(err: unknown): string {
  if (!err) return '';
  if (typeof err === 'string') return err;
  const e = err as { message?: string; code?: string };
  return e.message ?? e.code ?? '';
}

export function friendlyError(err: unknown, fallback = 'Si è verificato un problema. Riprova.'): string {
  const raw = errorCode(err);
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'Sei offline. Riprova quando torna la connessione.';
  for (const [k, v] of Object.entries(MESSAGES)) {
    if (raw === k || raw.startsWith(k + ':') || raw.startsWith(k + ' ') || raw.includes(k)) return v;
  }
  if (/password should be at least/i.test(raw)) return 'La password deve contenere almeno 8 caratteri.';
  if (/rate limit|too many/i.test(raw)) return MESSAGES.rate_limited!;
  if (/failed to fetch|network/i.test(raw)) return 'Impossibile contattare il server. Controlla la connessione.';
  if (/permission denied|row-level security|42501/i.test(raw)) return MESSAGES.not_authorized!;
  if (raw) console.warn('[jubilate]', err);
  return fallback;
}
