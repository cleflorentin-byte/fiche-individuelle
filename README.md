# Délégué Virtuel — CFDT EIC LORCA

Application web permettant aux adhérents CFDT EIC LORCA de reconstituer leur
historique d'utilisation et de suivre leurs compteurs réglementaires (repos,
RN, TQ, RU, congés…) suite à la suppression de la FIA par la direction.

Build validé (✓ Compiled successfully, 8 pages) avant livraison.

## Ce que fait l'application

- **Calendrier** : historique jour par jour, saisie manuelle ou import automatique.
- **Registre** : vue tableau du mois.
- **Fiches FIA** : saisie manuelle mensuelle des compteurs (RP, RN, TQ, RU, congés…), à reporter depuis la dernière fiche officielle puis à tenir à jour soi-même.
- **Récapitulatif annuel** : graphique et tableau d'évolution des compteurs sur l'année.
- **Import CPS** : dépôt d'un bulletin de commande PDF → extraction automatique (API Anthropic) → calcul automatique de l'impact sur TQ/RN/CT/RP (selon l'accord du 07/06/2016) → revue avant/après → application.
- **Dégagements syndicaux** : compteur annuel, affiché uniquement à partir de 5 dans l'année.
- Accès par compte individuel (email + mot de passe), **validé manuellement** par toi dans Supabase.
- Chaque adhérent ne voit que ses propres données (sécurité au niveau de la base de données, pas seulement de l'interface).

## Limites connues de cette V1 (transparence)

- Le **dictionnaire de codes** (`lib/categories.js`, fonction `guessCategory`) ne couvre que les codes déjà rencontrés dans ta propre FIA. À affiner avec la liste complète par site.
- Le calcul automatique des compteurs ne couvre que **TQ, RN, CT et RP**, pour le régime "Service non fixé 7h45/j, agent de réserve". Les autres compteurs (RD, RPSD, WE, RQ, RU, congés…) restent à vérifier manuellement après import.
- Les **fiches FIA** sont saisies manuellement (pas de parsing automatique du tableau de compteurs FIA — sa mise en page rend l'extraction fiable très complexe ; voir l'échange qui a précédé ce projet).
- La validation des nouveaux adhérents se fait **directement dans Supabase** (pas d'interface d'administration dédiée pour l'instant).

## Déploiement (gratuit) — environ 15 minutes

### 1. Créer le projet Supabase (base de données + authentification)

1. Va sur [supabase.com](https://supabase.com), crée un compte gratuit, puis "New Project".
2. Une fois le projet créé, va dans **SQL Editor** → colle le contenu du fichier `supabase/schema.sql` → "Run".
3. Va dans **Project Settings > API** → note l'**URL** et la clé **anon public**.
4. Va dans **Authentication > Providers** → vérifie que "Email" est activé (c'est le cas par défaut).
   Recommandé : dans **Authentication > Settings**, désactive "Confirm email" pour simplifier les premiers tests (tu pourras le réactiver ensuite).

### 2. Créer une clé API Anthropic (uniquement si tu veux l'import automatique)

1. Va sur [console.anthropic.com](https://console.anthropic.com) → "API Keys" → crée une clé.
2. Ajoute un petit crédit (quelques euros suffisent largement pour des dizaines d'imports).
3. Si tu préfères rester 100% gratuit : laisse cette variable vide, et utilise uniquement la saisie manuelle. L'onglet "Import CPS" affichera une erreur explicite si la clé n'est pas configurée, le reste de l'app fonctionne normalement.

### 3. Déployer sur Vercel

1. Mets ce dossier dans un repo GitHub (ou GitLab/Bitbucket).
2. Va sur [vercel.com](https://vercel.com), connecte-toi avec GitHub, "Add New Project", sélectionne le repo.
3. Dans "Environment Variables", ajoute :
   - `NEXT_PUBLIC_SUPABASE_URL` → l'URL notée à l'étape 1
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → la clé anon notée à l'étape 1
   - `ANTHROPIC_API_KEY` → la clé notée à l'étape 2 (optionnel)
4. Clique "Deploy". Au bout de 1-2 minutes, ton app est en ligne sur une URL du type `https://ton-projet.vercel.app`.

### 4. Valider les adhérents

Quand un adhérent s'inscrit sur l'app, il reste bloqué sur un écran "en attente de validation" tant que tu n'as pas agi :

1. Supabase > **Table Editor** > table `profiles`.
2. Repère la ligne du nouvel adhérent (par nom).
3. Passe la colonne `approved` à `true`.

Il aura alors accès dès son prochain rafraîchissement.

## Développement local

```bash
npm install
cp .env.example .env.local   # puis remplis les variables
npm run dev
```

## Pour aller plus loin (idées d'évolutions)

- Interface d'administration pour valider les adhérents sans passer par Supabase.
- Étendre `guessCategory` et le moteur de calcul (`lib/counters.js`) aux autres régimes de travail de l'EIC LORCA.
- Ajouter le calcul automatique de RD/RPSD/WE/RQ/RU une fois les règles exactes confirmées.
- Export PDF horodaté d'une fiche pour usage en cas de litige.
