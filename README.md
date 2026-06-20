# Training Tracker

A small web app for coaches to plan athlete training and for athletes to see
it on a calendar — replacing the spreadsheet. Built on AWS Amplify Gen 2:

- **Login** — Amazon Cognito (email + password, "Coaches" / "Athletes" groups)
- **Data + API** — AWS AppSync (GraphQL) + DynamoDB, auto-generated from the schema
- **Hosting** — S3 + CloudFront via Amplify Hosting, deployed from git

You don't hand-write any infrastructure — Amplify reads the two files in
`amplify/` and provisions everything for you.

## 1. Prerequisites

- Node.js 18 or later (`node -v` to check)
- An AWS account, with an IAM user/role that has admin-ish permissions for
  setup (you can scope it down later)
- The AWS CLI configured locally (`aws configure`) — Amplify uses your local
  AWS credentials to deploy

## 2. Local setup

```bash
npm install
npx ampx sandbox
```

`ampx sandbox` is a personal, disposable cloud backend tied to your AWS
account — it deploys real Cognito/AppSync/DynamoDB resources so you can
develop against the real thing, and it **writes `amplify_outputs.json`**
automatically (overwriting the placeholder in this project). Leave this
command running in a terminal — it watches `amplify/` and redeploys on save.

In a second terminal:

```bash
npm run dev
```

Open the local URL it prints. You'll see a sign-up/sign-in screen (Cognito
handles email verification for you).

## 3. Make yourself the coach

New sign-ups land with no role until you assign one — this is intentional,
so randoms can't self-promote to coach.

1. Sign up through the app with your own email.
2. Go to the **AWS Console → Cognito → User pools → (your pool) → Groups → Coaches → Add user** and add yourself.
3. Refresh the app — you should now see the coach dashboard.

Repeat the group step for each athlete (add them to **Athletes** instead),
after they sign up. Also add them as a Profile from inside the coach
dashboard ("+ Add" under Athletes) using the **exact same email** they sign
up with — that's how the app links their login to their training data.

## 4. Deploy it for real (hosting + a stable URL)

The simplest path:

1. Push this project to a GitHub (or GitLab/Bitbucket) repo.
2. AWS Console → **AWS Amplify → Hosting → Create app → connect your repo**.
3. Amplify auto-detects the Gen 2 backend and frontend, builds both, and
   deploys to a `https://<branch>.<app-id>.amplifyapp.com` URL on every push.
4. Add a custom domain later for free via the same console (just DNS records).

This also replaces your local sandbox with a permanent backend — point
teammates at the Amplify-hosted URL instead of `localhost`.

## 5. What it costs at your scale (under 10 athletes)

| Service | Free tier | Typical cost here |
|---|---|---|
| Cognito | 50,000 monthly active users free | $0 |
| AppSync | 250,000 queries/mutations free per month | $0 |
| DynamoDB | On-demand pricing, fractions of a cent per request | a few cents/month |
| Amplify Hosting | 1,000 build minutes + 15 GB served free/month | $0 |

Realistically: **$0/month** for the first year (AWS free tier), then likely
**$1–3/month** after, almost entirely DynamoDB/AppSync request charges. There
are no idle servers — if nobody opens the app for a week, it costs nothing
that week.

## 6. Project structure

```
amplify/
  auth/resource.ts     — Cognito setup (groups, login method)
  data/resource.ts     — Data models (Profile, Workout) + permissions
  backend.ts           — wires auth + data together
src/
  App.tsx              — login wrapper + routes coach vs athlete view
  components/
    CoachDashboard.tsx — athlete roster + calendar + assign workouts
    AthleteCalendar.tsx— athlete's own read-mostly calendar
    WorkoutForm.tsx     — coach's create/edit workout modal
    WorkoutDetail.tsx   — athlete's view/complete/notes modal
    CalendarGrid.tsx    — shared month-grid renderer
```

## 7. Troubleshooting

- **Schema deploy error mentioning `identityClaim`**: Amplify's per-owner
  authorization API (in `amplify/data/resource.ts`) occasionally changes
  syntax between versions. If `ownerDefinedIn("athleteEmail", { identityClaim: "email" })`
  errors, check the current syntax at
  [docs.amplify.aws → per-user/per-owner data access](https://docs.amplify.aws/react/build-a-backend/data/customize-authz/per-user-per-owner-data-access/)
  and adjust that one rule.
- **Athlete signs in but sees "Almost there"**: they haven't been added to
  the Athletes group in Cognito yet (step 3 above).
- **Athlete sees an empty calendar**: their Cognito login email and the
  email on their Profile (added by the coach) must match exactly.

## 8. Phase 2 ideas: Strava integration

When you're ready:

1. Add a Lambda function (Amplify Function) that handles the Strava OAuth
   redirect and stores each athlete's access/refresh token (e.g. in a new
   `StravaToken` model, never exposed to other athletes).
2. Add a scheduled Lambda (EventBridge, e.g. every few hours) that pulls
   recent activities per athlete and matches them to planned Workout rows
   by date, auto-filling `completed`, `distanceKm`, `durationMin` from the
   actual activity instead of the athlete typing it in.
3. Everything else in this app — the calendar, the data model, the auth —
   stays the same; you're only adding one new model and two functions.
