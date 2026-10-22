# ClearDay

ClearDay is a personal, local-first schedule and availability planner. It has no ClearDay account, app server, paid calendar service, analytics, or shared team workspace. The public GitHub Pages deployment serves the application files; your personal schedule is saved in your browser.

## Start using ClearDay

1. Open [ClearDay on GitHub Pages](https://jayr3.github.io/clearday-personal-scheduler/).
2. Add recurring classes and other fixed commitments first. Include shifts, travel, sleep, appointments, faith and family time that affect whether you can take work. Switch to **Week** to see the commitments and open blocks day by day.
3. Use **Calendar setup** if you want to import busy times from Google Calendar or Outlook. The import is optional and runs only when you press **Sync now**.
4. When someone asks you to work, enter the time required and when you can work, then press **Find open times**. Press **Block** for a suggested slot you want to hold while you confirm it.
5. Before accepting, check the date, start and end times against the original request. The app only knows what you entered or imported.
6. Download a **Backup** periodically. A backup contains the schedule and calendar event IDs for imported blocks; keep it private. **Restore** replaces the current browser schedule.

## What it does

- Month calendar and Week agenda, with Study, Work, Health, Family, Faith and Other categories.
- One-off and weekly commitments, including shifts that cross midnight. Overnight blocks appear on both dates and trigger overlap warnings on either day.
- Week view shows commitments and free blocks of 30 minutes or more within the same daily time window and buffer used by the availability checker.
- Availability search for continuous open blocks up to 12 hours, over the next 1–30 days, with a daily time window and a buffer around events.
- A typed quick request can override duration, horizon, start time (for example, `after 10am`) and end time (for example, `before 6pm`). Pressing Enter runs the availability search. It does not create an event.
- Optional, manual import of busy times from the primary Google calendar or default Outlook calendar. Sync imports approximately 30 days of recent events through one year ahead. Imported titles, notes and descriptions are not requested or displayed.
- Downloadable `.ics` export for ClearDay commitments, plus JSON backup and restore.
- Installable offline app shell. Calendar imports require an internet connection and a new sync.

Availability is a deterministic schedule check, not an AI assistant. It does not reserve a shift, send reminders, or verify that the schedule is complete. It checks tomorrow onward and returns up to six earliest options.

## Connect Google Calendar

You need a Google OAuth client ID for a web application. The ID is public configuration, not a password. Never put a client secret in this app.

1. In Google Cloud Console, create or select a project and enable the **Google Calendar API**.
2. Configure the OAuth consent screen for your use. For a personal project, you can keep the app in **Testing** and add your own Google account as a test user. Google may show an unverified-app warning for a personal/testing app; only continue if you recognize this app and its requested permission.
3. Create an OAuth client with application type **Web application**. Add the **Authorized JavaScript origin** shown in ClearDay’s Calendar setup dialog (currently `https://jayr3.github.io`). The Google token flow does not need a server or client secret.
4. Copy the client ID into **Calendar setup** in ClearDay and save it.
5. Press **Sync now**, choose your Google account and grant the requested free/busy permission.

ClearDay requests `calendar.events.freebusy`, reads event start/end/status only, and uses the primary calendar. You can revoke the permission in your Google Account’s third-party access settings. A testing-mode consent screen is for the account(s) you add as testers; this app is intended for your personal use.

## Connect Outlook Calendar

1. In Microsoft Entra admin center, create an app registration. Choose supported account types that include the kind of Microsoft account you use.
2. Under **Authentication**, add a **Single-page application (SPA)** redirect URI. Copy the exact address shown in ClearDay’s Calendar setup dialog, including the project path and trailing slash.
3. Under **API permissions**, add Microsoft Graph **delegated** permission `Calendars.ReadBasic`. Do not create a client secret.
4. Copy the application (client) ID into ClearDay’s **Calendar setup** dialog and save.
5. Press **Sync now**, sign in, and approve read access.

ClearDay queries your default Outlook calendar and requests only event IDs, start/end, all-day status and free/busy status. Imported entries display as **Busy · Outlook Calendar**. You can clear ClearDay’s local token cache and imported blocks with **Privacy, disconnect and delete data**; fully revoke access from your Microsoft account’s app permissions page.

## Privacy and limits

- ClearDay commitments, provider event IDs, OAuth client IDs and sync timestamps are stored in this browser’s local storage. Anyone using the same browser profile may access them. Avoid sensitive health or family notes.
- Google access tokens stay in memory for the current page session. Microsoft’s MSAL browser library uses this browser tab’s session storage. ClearDay does not send tokens or schedules to a ClearDay server; requests go directly from the browser to Google or Microsoft when you connect and sync.
- A calendar sync is a **manual read-only import**. It does not write events into Google or Outlook and does not run in the background. Use the `.ics` export to move ClearDay-created events into another calendar.
- The import uses a provider’s primary/default calendar; it does not yet select multiple calendars or sync across devices. It refreshes when you press **Sync now**.
- Disconnecting ClearDay clears this browser’s imported busy blocks, client IDs and Microsoft app token cache. Revoke provider consent in the provider account settings for complete revocation.
- Deleting browser site data removes ClearDay’s schedule. Download and store a backup privately first.
- The repository and GitHub Pages site are public. Do not commit schedules, backups, OAuth secrets, `.env` files or private notes. OAuth client IDs are public identifiers, but are stored in this browser so a fresh visitor must configure their own.
- The published `main` history uses a GitHub no-reply identity. For future command-line commits, set Git’s commit email to the no-reply address shown in GitHub **Settings → Emails**, and enable **Keep my email addresses private** plus the option that blocks command-line pushes exposing your address. GitHub web-based commits use the account privacy setting.
- Rewriting history cannot erase copies already fetched by other people or guarantee immediate removal from GitHub’s cached views. See GitHub’s [sensitive-data removal guidance](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository) if a cached commit still exposes personal information.

## Develop and deploy

Requires Node.js 22 or later.

```sh
npm ci
npm run dev
npm run build
npm run preview
```

GitHub Actions builds the app into `dist` and publishes that folder to GitHub Pages after each push to `main`. The Vite base path is configured for this repository. Do not commit `node_modules`, `dist`, OAuth secrets, backups or schedule exports.

## Further work

Possible next additions include selecting more than one calendar, optional event publishing with a separate write permission, reminders, mobile-friendly quick-add shortcuts and a safer multi-device sync. Each calendar write or cloud-storage feature should explain its scope and destination before it is enabled.
