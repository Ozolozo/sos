/**
 * SOS QR – API de fiches d'urgence (Google Apps Script lié à un Google Sheet)
 *
 * Installation : voir README.md
 *   1. Exécuter setup() une fois (crée les onglets + le code club).
 *   2. Propriétés du script : renseigner URL_SITE (ex. https://monclub.github.io/sos/).
 *   3. Déployer > Nouveau déploiement > Application Web
 *        Exécuter en tant que : Moi
 *        Qui a accès : Tout le monde
 */

const VERSION = '2026-10-30-v3';

const CFG = {
  ONGLET_FICHES: 'Fiches',
  ONGLET_JOURNAL: 'Journal',
  NOM_EXPEDITEUR: 'SOS Club',
  DELAI_NOTIF_SCAN_MIN: 15, // 1 e-mail "fiche consultée" max par période
  DELAI_ALERTE_MIN: 5,      // 1 alerte e-mail aux proches max par période
  DELAI_RETROUVER_MIN: 5,   // 1 renvoi du lien personnel max par adresse et par période
  LONGUEUR_MAX: 600
};

const COLS = [
  'id', 'cleEdition', 'actif',
  'prenom', 'nom', 'dateNaissance', 'groupeSanguin',
  'allergies', 'traitements', 'antecedents', 'infos', 'langues',
  'contact1Nom', 'contact1Lien', 'contact1Tel', 'contact1Email',
  'contact2Nom', 'contact2Lien', 'contact2Tel', 'contact2Email',
  'emailMembre', 'notifierScan', 'creeLe', 'majLe'
];

// Champs renvoyés à toute personne qui scanne le QR
const CHAMPS_PUBLICS = [
  'prenom', 'nom', 'dateNaissance', 'groupeSanguin',
  'allergies', 'traitements', 'antecedents', 'infos', 'langues',
  'contact1Nom', 'contact1Lien', 'contact1Tel',
  'contact2Nom', 'contact2Lien', 'contact2Tel'
];

// Champs modifiables par le membre (avec sa clé d'édition)
const CHAMPS_EDITABLES = [
  'actif', 'prenom', 'nom', 'dateNaissance', 'groupeSanguin',
  'allergies', 'traitements', 'antecedents', 'infos', 'langues',
  'contact1Nom', 'contact1Lien', 'contact1Tel', 'contact1Email',
  'contact2Nom', 'contact2Lien', 'contact2Tel', 'contact2Email',
  'emailMembre', 'notifierScan'
];

/* ------------------------------------------------------------------ */
/* Installation                                                        */
/* ------------------------------------------------------------------ */

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const sh = ss.getSheetByName(CFG.ONGLET_FICHES) || ss.insertSheet(CFG.ONGLET_FICHES);
  sh.getRange(1, 1, sh.getMaxRows(), COLS.length).setNumberFormat('@');
  sh.getRange(1, 1, 1, COLS.length).setValues([COLS]).setFontWeight('bold');
  sh.setFrozenRows(1);
  const ouiNon = SpreadsheetApp.newDataValidation().requireValueInList(['OUI', 'NON'], true).build();
  ['actif', 'notifierScan'].forEach(function (c) {
    sh.getRange(2, COLS.indexOf(c) + 1, sh.getMaxRows() - 1, 1).setDataValidation(ouiNon);
  });

  const jr = ss.getSheetByName(CFG.ONGLET_JOURNAL) || ss.insertSheet(CFG.ONGLET_JOURNAL);
  jr.getRange(1, 1, 1, 5).setValues([['date', 'type', 'id', 'detail', 'position']]).setFontWeight('bold');
  jr.setFrozenRows(1);

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('CODE_CLUB')) props.setProperty('CODE_CLUB', genererCle_(8));
  if (!props.getProperty('URL_SITE')) props.setProperty('URL_SITE', '');
  Logger.log('CODE_CLUB = ' + props.getProperty('CODE_CLUB'));
  Logger.log('Renseignez la propriété URL_SITE (ex. https://monclub.github.io/sos/)');
}

/* ------------------------------------------------------------------ */
/* Points d'entrée HTTP                                                */
/* ------------------------------------------------------------------ */

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    if (p.action === 'fiche') return json_(fichePublique_(p.id));
    return json_({ ok: true, service: 'sos-qr', version: VERSION });
  } catch (err) {
    return json_({ ok: false, erreur: 'serveur', detail: String(err) });
  }
}

function doPost(e) {
  try {
    const b = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    switch (b.action) {
      case 'lire':        return json_(ficheEdition_(b.k));
      case 'enregistrer': return json_(enregistrer_(b));
      case 'nouveauQR':   return json_(nouveauQR_(b.k));
      case 'alerte':      return json_(alerte_(b));
      case 'retrouver':   return json_(retrouver_(b.email));
      default:            return json_({ ok: false, erreur: 'action' });
    }
  } catch (err) {
    return json_({ ok: false, erreur: 'serveur', detail: String(err) });
  }
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

function fichePublique_(id) {
  const t = trouver_('id', id);
  if (!t) return { ok: false, erreur: 'introuvable' };
  if (t.fiche.actif !== 'OUI') return { ok: false, erreur: 'inactif' };

  const pub = {};
  CHAMPS_PUBLICS.forEach(function (c) { pub[c] = t.fiche[c]; });

  journal_('scan', id, '', '');
  if (t.fiche.notifierScan === 'OUI' && t.fiche.emailMembre && !limite_('scan_' + id, CFG.DELAI_NOTIF_SCAN_MIN)) {
    envoyer_(t.fiche.emailMembre,
      'Votre fiche d’urgence a été consultée',
      '<p>Bonjour ' + esc_(t.fiche.prenom) + ',</p>' +
      '<p>Votre fiche d’urgence vient d’être consultée (' + esc_(maintenant_()) + ').</p>' +
      '<p>Si ce n’est pas vous et que votre QR code a été perdu, ouvrez votre lien d’édition ' +
      'et désactivez la fiche ou générez un nouveau QR code.</p>');
  }
  return { ok: true, fiche: pub };
}

function ficheEdition_(k) {
  const t = trouver_('cleEdition', k);
  if (!t) return { ok: false, erreur: 'cle' };
  const f = { id: t.fiche.id };
  CHAMPS_EDITABLES.forEach(function (c) { f[c] = t.fiche[c]; });
  return { ok: true, fiche: f, k: k };
}

function enregistrer_(b) {
  const f = nettoyer_(b.fiche || {});
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    // Mise à jour d'une fiche existante
    if (b.k) {
      const t = trouver_('cleEdition', b.k);
      if (!t) return { ok: false, erreur: 'cle' };
      const maj = Object.assign({}, t.fiche, f, { majLe: maintenant_() });
      const err = valider_(maj);
      if (err) return { ok: false, erreur: 'champs', detail: err };
      ecrireLigne_(t.sh, t.ligne, t.idx, maj);
      return { ok: true, id: maj.id, k: maj.cleEdition };
    }

    // Création : code club obligatoire
    const code = PropertiesService.getScriptProperties().getProperty('CODE_CLUB');
    if (!code || String(b.codeClub || '').trim() !== code) return { ok: false, erreur: 'codeClub' };

    const nouv = Object.assign({ actif: 'OUI', notifierScan: 'OUI' }, f, {
      id: genererCle_(10),
      cleEdition: genererCle_(24),
      creeLe: maintenant_(),
      majLe: maintenant_()
    });
    const err = valider_(nouv);
    if (err) return { ok: false, erreur: 'champs', detail: err };

    const d = lireFiches_();
    ecrireLigne_(d.sh, d.sh.getLastRow() + 1, d.idx, nouv);

    if (nouv.emailMembre) envoyerLiens_(nouv);
    return { ok: true, id: nouv.id, k: nouv.cleEdition, nouveau: true };
  } finally {
    lock.releaseLock();
  }
}

function nouveauQR_(k) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const t = trouver_('cleEdition', k);
    if (!t) return { ok: false, erreur: 'cle' };
    const maj = Object.assign({}, t.fiche, { id: genererCle_(10), majLe: maintenant_() });
    ecrireLigne_(t.sh, t.ligne, t.idx, maj);
    journal_('nouveauQR', maj.id, 'ancien id : ' + t.fiche.id, '');
    return { ok: true, id: maj.id, k: k };
  } finally {
    lock.releaseLock();
  }
}

function alerte_(b) {
  const t = trouver_('id', b.id);
  if (!t || t.fiche.actif !== 'OUI') return { ok: false, erreur: 'introuvable' };
  if (limite_('alerte_' + b.id, CFG.DELAI_ALERTE_MIN)) return { ok: true, dejaEnvoyee: true };

  const aPos = typeof b.lat === 'number' && typeof b.lng === 'number' && isFinite(b.lat) && isFinite(b.lng);
  const lienPos = aPos ? 'https://www.google.com/maps?q=' + b.lat.toFixed(6) + ',' + b.lng.toFixed(6) : '';
  const precision = aPos && typeof b.precision === 'number' ? ' (précision ≈ ' + Math.round(b.precision) + ' m)' : '';

  const dest = [t.fiche.contact1Email, t.fiche.contact2Email, t.fiche.emailMembre]
    .filter(function (x, i, a) { return x && a.indexOf(x) === i; });

  const html =
    '<p><b>Alerte concernant ' + esc_(t.fiche.prenom + ' ' + t.fiche.nom) + '</b></p>' +
    '<p>Une personne sur place a scanné sa fiche d’urgence et a déclenché une alerte le ' + esc_(maintenant_()) + '.</p>' +
    (aPos
      ? '<p>Position transmise' + esc_(precision) + ' : <a href="' + lienPos + '">' + lienPos + '</a></p>'
      : '<p>La position n’a pas pu être obtenue.</p>') +
    '<p>Si les secours n’ont pas été appelés : composez le <b>112</b>.</p>';

  dest.forEach(function (to) {
    envoyer_(to, 'ALERTE – ' + t.fiche.prenom + ' ' + t.fiche.nom, html);
  });
  journal_('alerte', b.id, dest.length + ' e-mail(s)', lienPos);
  return { ok: true, envoyes: dest.length };
}

// Renvoie le(s) lien(s) personnel(s) à l'adresse enregistrée dans la fiche.
function retrouver_(email) {
  const mail = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return { ok: false, erreur: 'champs', detail: 'Adresse e-mail invalide.' };

  const url = PropertiesService.getScriptProperties().getProperty('URL_SITE') || '';
  const d = lireFiches_();
  const liens = [];
  for (let r = 1; r < d.values.length; r++) {
    if (String(d.values[r][d.idx.emailMembre]).trim().toLowerCase() === mail) {
      liens.push({
        nom: String(d.values[r][d.idx.prenom]) + ' ' + String(d.values[r][d.idx.nom]),
        lien: url + '?k=' + String(d.values[r][d.idx.cleEdition])
      });
    }
  }
  if (!liens.length) {
    journal_('retrouver', '', 'adresse inconnue', '');
    return { ok: false, erreur: 'inconnu' };
  }
  if (!url) return { ok: false, erreur: 'serveur', detail: 'Propriété URL_SITE non renseignée dans le script.' };
  if (limite_('retrouver_' + mail, CFG.DELAI_RETROUVER_MIN)) return { ok: true, dejaEnvoye: true };

  envoyer_(mail, 'Votre lien personnel – fiche d’urgence SOS',
    '<p>Bonjour,</p><p>Voici le lien personnel pour modifier votre fiche d’urgence (ne le partagez pas) :</p>' +
    liens.map(function (l) {
      return '<p><b>' + esc_(l.nom) + '</b><br><a href="' + l.lien + '">' + l.lien + '</a></p>';
    }).join('') +
    '<p>Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.</p>');
  journal_('retrouver', '', liens.length + ' fiche(s)', '');
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Accès au Google Sheet                                               */
/* ------------------------------------------------------------------ */

function lireFiches_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CFG.ONGLET_FICHES);
  const values = sh.getDataRange().getValues();
  const idx = {};
  values[0].forEach(function (h, i) { idx[String(h)] = i; });
  return { sh: sh, values: values, idx: idx };
}

function trouver_(col, val) {
  if (!val) return null;
  const d = lireFiches_();
  for (let r = 1; r < d.values.length; r++) {
    if (String(d.values[r][d.idx[col]]) === String(val)) {
      const fiche = {};
      COLS.forEach(function (c) {
        const v = d.idx[c] === undefined ? '' : d.values[r][d.idx[c]];
        fiche[c] = v === null || v === undefined ? '' : String(v).replace(/^'(?==)/, '');
      });
      return { ligne: r + 1, fiche: fiche, sh: d.sh, idx: d.idx };
    }
  }
  return null;
}

function ecrireLigne_(sh, ligne, idx, obj) {
  const n = Math.max(sh.getLastColumn(), COLS.length);
  const row = new Array(n).fill('');
  if (ligne <= sh.getLastRow()) {
    sh.getRange(ligne, 1, 1, n).getValues()[0].forEach(function (v, i) { row[i] = v; });
  }
  COLS.forEach(function (c) {
    if (idx[c] !== undefined) row[idx[c]] = obj[c] === undefined ? '' : obj[c];
  });
  sh.getRange(ligne, 1, 1, n).setNumberFormat('@').setValues([row]);
}

function journal_(type, id, detail, position) {
  const jr = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CFG.ONGLET_JOURNAL);
  if (jr) jr.appendRow([maintenant_(), type, id, detail, position]);
}

/* ------------------------------------------------------------------ */
/* Utilitaires                                                         */
/* ------------------------------------------------------------------ */

function nettoyer_(src) {
  const f = {};
  CHAMPS_EDITABLES.forEach(function (c) {
    if (src[c] === undefined || src[c] === null) return;
    let v = String(src[c]).trim().slice(0, CFG.LONGUEUR_MAX);
    if (v.charAt(0) === '=') v = "'" + v; // empêche l'interprétation comme formule
    if (c === 'actif' || c === 'notifierScan') v = v === 'OUI' ? 'OUI' : 'NON';
    if (/Tel$/.test(c)) v = v.replace(/[^\d+ .]/g, '');
    if (/Email$|^emailMembre$/.test(c)) v = v.toLowerCase();
    f[c] = v;
  });
  return f;
}

function valider_(f) {
  if (!f.prenom || !f.nom) return 'Le prénom et le nom sont obligatoires.';
  if (!f.contact1Tel) return 'Le téléphone du contact d’urgence n°1 est obligatoire.';
  if (!f.emailMembre) return 'Votre adresse e-mail est obligatoire (elle permet de retrouver votre lien personnel).';
  const reMail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const mails = ['contact1Email', 'contact2Email', 'emailMembre'];
  for (let i = 0; i < mails.length; i++) {
    if (f[mails[i]] && !reMail.test(f[mails[i]])) return 'Adresse e-mail invalide : ' + f[mails[i]];
  }
  return '';
}

function envoyerLiens_(f) {
  const url = PropertiesService.getScriptProperties().getProperty('URL_SITE') || '';
  if (!url) return;
  const lienEdit = url + '?k=' + f.cleEdition;
  envoyer_(f.emailMembre, 'Votre fiche d’urgence SOS',
    '<p>Bonjour ' + esc_(f.prenom) + ',</p>' +
    '<p>Votre fiche d’urgence est créée.</p>' +
    '<p><b>Lien personnel (modifier la fiche, imprimer vos QR codes)</b> – ne le partagez pas :<br>' +
    '<a href="' + lienEdit + '">' + lienEdit + '</a></p>');
}

function envoyer_(to, sujet, html) {
  try {
    MailApp.sendEmail({ to: to, subject: sujet, htmlBody: html, name: CFG.NOM_EXPEDITEUR });
  } catch (err) {
    journal_('erreurMail', '', String(err), '');
  }
}

function limite_(cle, minutes) {
  const cache = CacheService.getScriptCache();
  if (cache.get(cle)) return true;
  cache.put(cle, '1', minutes * 60);
  return false;
}

function genererCle_(n) {
  // Alphabet sans caractères ambigus (0/O, 1/l/I)
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let s = '';
  while (s.length < n) {
    const hex = Utilities.getUuid().replace(/-/g, '');
    for (let i = 0; i < hex.length && s.length < n; i += 2) {
      s += A.charAt(parseInt(hex.substr(i, 2), 16) % A.length);
    }
  }
  return s;
}

function maintenant_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

function esc_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
