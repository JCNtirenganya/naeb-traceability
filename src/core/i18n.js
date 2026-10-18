const STRINGS = {
  en: {
    "nav.overview": "Overview", "nav.map": "Map", "nav.network": "Network", "nav.registry": "Registry",
    "nav.batches": "Batches", "nav.forms": "Forms", "nav.reports": "Reports", "nav.admin": "Admin",
    "signin": "Sign in", "signout": "Sign out", "search": "Search everything…  (Ctrl+K)",
    "ds.live": "Live", "ds.recorded": "Recorded", "ds.indicative": "Indicative",
    "ds.live.long": "Live — read from NAEB GIS layers",
    "ds.recorded.long": "Recorded — entered in this system, stored in ArcGIS",
    "ds.indicative.long": "Indicative — synthetic demo data or inferred link",
    "risk.low": "Low risk", "risk.review": "Needs review", "risk.blocked": "Blocked", "risk.none": "No farm data",
    "risk.disclaimer": "Pre-screening aid — not a legal EUDR determination",
    "link.confirmed": "Confirmed", "link.inferred": "Inferred",
    "print": "Print / PDF", "csv": "Export CSV", "copylink": "Copy link",
    "clear": "Clear selection", "record.new": "Record", "edit": "Edit", "delete": "Delete",
    "profile": "Profile", "print.profile": "Print profile",
    "empty.select": "Select an item to see its profile and chain.",
    "empty.none": "Nothing here yet.",
    "scope.full": "Scope: full network (filtered)",
    "confirm.scope": "No selection — this report covers the whole network under the current filters. Continue?",
    "form.required": "Required", "form.save": "Save", "form.cancel": "Cancel", "form.submit": "Submit",
    "admin.models": "Models", "admin.forms": "Forms", "admin.status": "Data status", "admin.publish": "Publish to portal",
    "lang": "Language", "theme": "Theme", "indicative.toggle": "Show indicative data"
  },
  fr: {
    "nav.overview": "Aperçu", "nav.map": "Carte", "nav.network": "Réseau", "nav.registry": "Registre",
    "nav.batches": "Lots d'export", "nav.forms": "Formulaires", "nav.reports": "Rapports", "nav.admin": "Admin",
    "signin": "Connexion", "signout": "Déconnexion", "search": "Rechercher…  (Ctrl+K)",
    "ds.live": "En direct", "ds.recorded": "Saisi", "ds.indicative": "Indicatif",
    "risk.low": "Risque faible", "risk.review": "À vérifier", "risk.blocked": "Bloqué", "risk.none": "Pas de données",
    "risk.disclaimer": "Aide au pré-filtrage — pas une détermination légale REUD",
    "link.confirmed": "Confirmé", "link.inferred": "Inféré",
    "print": "Imprimer / PDF", "csv": "Exporter CSV", "copylink": "Copier le lien",
    "clear": "Effacer la sélection", "record.new": "Saisir", "edit": "Modifier", "delete": "Supprimer",
    "profile": "Profil", "print.profile": "Imprimer le profil",
    "empty.select": "Sélectionnez un élément pour voir son profil et sa chaîne.",
    "empty.none": "Rien pour l'instant.",
    "scope.full": "Portée : réseau complet (filtré)",
    "confirm.scope": "Aucune sélection — ce rapport couvre tout le réseau avec les filtres actuels. Continuer ?",
    "form.required": "Obligatoire", "form.save": "Enregistrer", "form.cancel": "Annuler", "form.submit": "Envoyer",
    "admin.models": "Modèles", "admin.forms": "Formulaires", "admin.status": "État des données", "admin.publish": "Publier sur le portail",
    "lang": "Langue", "theme": "Thème", "indicative.toggle": "Afficher les données indicatives"
  },
  rw: {
    "nav.overview": "Indiciro", "nav.map": "Igiceragashya", "nav.network": "Umutereko", "nav.registry": "Ububikwa",
    "nav.batches": "Ingumba z'ivyojanjwa", "nav.forms": "Fomu", "nav.reports": "Raporo", "nav.admin": "Umuyobozi",
    "signin": "Injira", "signout": "Sohoka", "search": "Shakisha…  (Ctrl+K)",
    "ds.live": "Ubu", "ds.recorded": "Byanditswe", "ds.indicative": "Ingereranwa",
    "risk.low": "Akamaro gake", "risk.review": "Reba nanone", "risk.blocked": "Kitakira", "risk.none": "Nta data",
    "risk.disclaimer": "Fasha mu gutekereza — si ryemezo rya EUDR",
    "link.confirmed": "Byemejwe", "link.inferred": "Gushyiramo urugero",
    "print": "Sohora / PDF", "csv": "Kuramo CSV", "copylink": "Kopora ihuriro",
    "clear": "Kuraho utoro", "record.new": "Andika", "edit": "Hindura", "delete": "Sengura",
    "profile": "Umwirondoro", "print.profile": "Sohora umwirondoro",
    "empty.select": "Hitamo ikintu kugira ngo urebe umwirondoro n'umutereko wayo.",
    "empty.none": "Nta kintu kunyuma.",
    "scope.full": "Igice: umutereko wose",
    "confirm.scope": "Nta kintu kihisiliwe — iri raporo igera kuri muri gahunda yose. Komeza?",
    "form.required": "Bya ngombwa", "form.save": "Bika", "form.cancel": "Hagarika", "form.submit": "Ohereza",
    "admin.models": "Imiterere", "admin.forms": "Fomu", "admin.status": "Uko data imeze", "admin.publish": "Yashesha portal",
    "lang": "Ururimi", "theme": "Imimerere", "indicative.toggle": "Era data y'ingereranwa"
  }
};

let lang = localStorage.getItem("naeb_lang") || "en";
export const getLang = () => lang;
export function setLang(l) { lang = l; localStorage.setItem("naeb_lang", l); }
export function t(key) { return (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.en[key] || key; }
export function tfmt(key, vars) {
  let s = t(key);
  for (const [k, v] of Object.entries(vars || {})) s = s.replaceAll(`{${k}}`, v);
  return s;
}
