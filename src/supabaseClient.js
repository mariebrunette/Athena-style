// Client Supabase (auth + base de données + stockage photos). Les clés sont lues depuis
// des variables d'environnement Vite, jamais écrites en dur — la clé utilisée ici est la
// clé publique ("publishable"/anon), conçue pour être embarquée côté client : elle ne
// donne accès qu'à ce qu'autorisent les politiques Row Level Security définies dans
// supabase/schema.sql, jamais un accès complet à la base.
//
// Tant qu'aucune variable n'est configurée, `supabase` vaut `null` plutôt que de faire
// planter l'app : le reste du code doit vérifier sa présence avant de l'utiliser, pour que
// l'app continue de fonctionner en local-only si Supabase n'est pas branché.
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  console.warn(
    'Supabase non configuré (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY manquantes) : ' +
      "l'app fonctionne en local uniquement.",
  );
}

export const supabase =
  supabaseUrl && supabasePublishableKey ? createClient(supabaseUrl, supabasePublishableKey) : null;
