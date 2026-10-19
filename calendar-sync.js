import { PublicClientApplication, InteractionRequiredAuthError } from "@azure/msal-browser";

const CONFIG_KEY = "clearday.calendar-config.v1";
const GOOGLE_READ_SCOPE = "https://www.googleapis.com/auth/calendar.events.freebusy";
const GRAPH_READ_SCOPE = "Calendars.ReadBasic";
const GRAPH_AUTHORITY = "https://login.microsoftonline.com/common";
let config = readConfig();
let googleToken = null;
let googleTokenExpires = 0;
let googleTokenClient = null;
let msalClient = null;
let msalClientId = "";
let msalInit = null;
let busy = false;

function readConfig() {
  try { return Object.assign({ googleClientId: "", microsoftClientId: "", googleLastSync: "", outlookLastSync: "" }, JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}")); }
  catch (_) { return { googleClientId: "", microsoftClientId: "", googleLastSync: "", outlookLastSync: "" }; }
}
function persistConfig() {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  renderStatuses();
}
function $(id) { return document.getElementById(id); }
function formatLastSync(value) {
  if (!value) return "Ready to import busy times";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Ready to import busy times" : `Last synced ${parsed.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;
}
function renderStatuses() {
  $("googleStatus").textContent = config.googleClientId ? formatLastSync(config.googleLastSync) : "Not configured";
  $("outlookStatus").textContent = config.microsoftClientId ? formatLastSync(config.outlookLastSync) : "Not configured";
  $("googleSyncButton").textContent = config.googleClientId ? "Sync now" : "Set up";
  $("outlookSyncButton").textContent = config.microsoftClientId ? "Sync now" : "Set up";
}
function openSettings() {
  $("googleClientId").value = config.googleClientId;
  $("microsoftClientId").value = config.microsoftClientId;
  $("redirectUriLabel").textContent = window.location.origin + window.location.pathname;
  $("originLabel").textContent = window.location.origin;
  $("settingsError").textContent = "";
  $("calendarSettingsDialog").showModal();
}
function setWorking(provider, isWorking) {
  busy = isWorking;
  const button = $(provider === "google" ? "googleSyncButton" : "outlookSyncButton");
  button.disabled = isWorking;
  button.textContent = isWorking ? "Syncing…" : (provider === "google" ? (config.googleClientId ? "Sync now" : "Set up") : (config.microsoftClientId ? "Sync now" : "Set up"));
}
function reportError(error) {
  console.error("ClearDay calendar sync failed", error);
  alert(`Calendar sync could not finish. ${error && error.message ? error.message : "Check your connection and OAuth setup, then try again."}`);
}

async function loadGoogleIdentityServices() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Google sign-in did not load. Check that your network allows accounts.google.com, then retry.");
}
async function googleAccessToken() {
  await loadGoogleIdentityServices();
  if (googleToken && Date.now() < googleTokenExpires - 60000) return googleToken;
  return new Promise((resolve, reject) => {
    googleTokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: config.googleClientId,
      scope: GOOGLE_READ_SCOPE,
      include_granted_scopes: true,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error_description || response.error || "Google did not return calendar access."));
          return;
        }
        googleToken = response.access_token;
        googleTokenExpires = Date.now() + Number(response.expires_in || 3600) * 1000;
        resolve(googleToken);
      },
      error_callback: (response) => reject(new Error(response.message || "Google sign-in popup was closed or blocked."))
    });
    googleTokenClient.requestAccessToken({ prompt: "" });
  });
}
async function googleEvents() {
  const accessToken = await googleAccessToken();
  const start = new Date(); start.setDate(start.getDate() - 30); start.setHours(0, 0, 0, 0);
  const end = new Date(); end.setFullYear(end.getFullYear() + 1); end.setHours(23, 59, 59, 0);
  let pageToken = "";
  const rows = [];
  do {
    const params = new URLSearchParams({
      timeMin: start.toISOString(), timeMax: end.toISOString(), singleEvents: "true", orderBy: "startTime",
      maxResults: "2500", fields: "items(id,start,end,status,transparency),nextPageToken"
    });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new Error(await providerMessage(response, "Google Calendar"));
    const page = await response.json();
    rows.push(...(page.items || []).filter((event) => event.status !== "cancelled" && event.transparency !== "transparent"));
    pageToken = page.nextPageToken || "";
    if (rows.length > 10000) throw new Error("This calendar has over 10,000 events in the import range. Shorten the range in your Google account or use a less busy calendar.");
  } while (pageToken);
  return rows.flatMap((event) => eventBlocks(event.id, event.start, event.end, "Google Calendar", Boolean(event.start && event.start.date)));
}

function initializeMsal() {
  if (!config.microsoftClientId) return Promise.reject(new Error("Enter your Microsoft app ID in Calendar setup first."));
  if (!msalClient || msalClientId !== config.microsoftClientId) {
    msalClient = new PublicClientApplication({
      auth: { clientId: config.microsoftClientId, authority: GRAPH_AUTHORITY, redirectUri: window.location.origin + window.location.pathname, navigateToLoginRequestUrl: false },
      cache: { cacheLocation: "sessionStorage", storeAuthStateInCookie: false }
    });
    msalClientId = config.microsoftClientId;
    msalInit = msalClient.initialize();
  }
  return msalInit || Promise.resolve();
}
async function microsoftAccessToken() {
  await initializeMsal();
  const account = msalClient.getAllAccounts()[0];
  const request = { scopes: [GRAPH_READ_SCOPE], ...(account ? { account } : {}) };
  if (!account) return (await msalClient.acquireTokenPopup(request)).accessToken;
  try {
    return (await msalClient.acquireTokenSilent(request)).accessToken;
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError || error.errorCode === "no_tokens_found" || error.errorCode === "no_account_error") {
      return (await msalClient.acquireTokenPopup(request)).accessToken;
    }
    throw error;
  }
}
async function outlookEvents() {
  const accessToken = await microsoftAccessToken();
  const start = new Date(); start.setDate(start.getDate() - 30); start.setHours(0, 0, 0, 0);
  const end = new Date(); end.setFullYear(end.getFullYear() + 1); end.setHours(23, 59, 59, 0);
  let url = `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${encodeURIComponent(start.toISOString())}&endDateTime=${encodeURIComponent(end.toISOString())}&$select=id,start,end,isAllDay,showAs&$top=1000`;
  const rows = [];
  while (url) {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' } });
    if (!response.ok) throw new Error(await providerMessage(response, "Outlook Calendar"));
    const page = await response.json();
    rows.push(...(page.value || []).filter((event) => event.showAs !== "free"));
    url = page["@odata.nextLink"] || "";
    if (rows.length > 10000) throw new Error("This calendar has over 10,000 events in the import range. Shorten the range or use a less busy calendar.");
  }
  return rows.flatMap((event) => eventBlocks(event.id, event.start, event.end, "Outlook Calendar", Boolean(event.isAllDay)));
}

function eventBlocks(remoteId, startValue, endValue, providerName, allDay) {
  if (!startValue || !endValue) return [];
  if (allDay) {
    const startDay = (startValue.date || startValue.dateTime || "").slice(0, 10);
    const endDay = (endValue.date || endValue.dateTime || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDay)) return [];
    const blocks = [];
    for (let day = new Date(`${startDay}T12:00:00`); keyDate(day) < endDay; day = nextDate(day)) {
      const dateKey = keyDate(day);
      blocks.push(busyBlock(remoteId, dateKey, "00:00", "23:59", providerName));
    }
    return blocks;
  }
  const start = new Date(startValue.dateTime || startValue);
  const end = new Date(endValue.dateTime || endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return [];
  const blocks = [];
  let cursor = start;
  while (cursor < end && blocks.length < 370) {
    const dateKey = keyDate(cursor);
    const nextMidnight = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    const stop = nextMidnight < end ? nextMidnight : end;
    const endClock = timeOf(stop);
    blocks.push(busyBlock(remoteId, dateKey, timeOf(cursor), endClock === "00:00" ? "23:59" : endClock, providerName));
    cursor = stop;
  }
  return blocks;
}
function busyBlock(remoteId, date, start, end, providerName) {
  return {
    id: `import:${providerName}:${remoteId}:${date}`, title: `Busy · ${providerName}`, date, start, end,
    category: "other", notes: "", weekly: false, repeatUntil: "", providerOrigin: providerName,
    providerEventId: remoteId
  };
}
function keyDate(value) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; }
function nextDate(value) { const next = new Date(value); next.setDate(next.getDate() + 1); return next; }
function timeOf(value) { return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`; }
async function providerMessage(response, provider) {
  let details = "";
  try { const body = await response.json(); details = body.error && (body.error.message || body.error_description); }
  catch (_) { /* Keep the fallback generic. */ }
  if (response.status === 401 || response.status === 403) return `${provider} denied access. Check that the calendar permission is enabled and that this browser origin is registered in the OAuth app.`;
  return `${provider} returned ${response.status}${details ? `: ${details}` : "."}`;
}
async function syncProvider(provider) {
  if (busy) return;
  const configured = provider === "google" ? config.googleClientId : config.microsoftClientId;
  if (!configured) { openSettings(); return; }
  setWorking(provider, true);
  try {
    const imports = provider === "google" ? await googleEvents() : await outlookEvents();
    const providerName = provider === "google" ? "Google Calendar" : "Outlook Calendar";
    window.ClearDay.mergeCalendarBusy(providerName, imports);
    config[provider === "google" ? "googleLastSync" : "outlookLastSync"] = new Date().toISOString();
    persistConfig();
    alert(`Imported ${imports.length} busy blocks from ${providerName}. ClearDay did not import event titles or notes.`);
  } catch (error) { reportError(error); }
  finally { setWorking(provider, false); }
}
function validGoogleId(value) { return !value || /^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(value); }
function validMicrosoftId(value) { return !value || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value); }

export const CalendarSync = {
  init() {
    $("settingsButton").onclick = openSettings;
    $("googleSyncButton").onclick = () => syncProvider("google");
    $("outlookSyncButton").onclick = () => syncProvider("outlook");
    $("privacyButton").onclick = () => { $("privacyStatus").textContent = ""; $("privacyDialog").showModal(); };
    $("calendarSettingsForm").onsubmit = (event) => {
      event.preventDefault();
      const googleClientId = $("googleClientId").value.trim();
      const microsoftClientId = $("microsoftClientId").value.trim();
      if (!validGoogleId(googleClientId)) { $("settingsError").textContent = "That does not look like a Google OAuth web client ID."; return; }
      if (!validMicrosoftId(microsoftClientId)) { $("settingsError").textContent = "Enter a Microsoft application ID in GUID format."; return; }
      config = Object.assign(config, { googleClientId, microsoftClientId });
      if (msalClientId && msalClientId !== microsoftClientId) { msalClient = null; msalClientId = ""; msalInit = null; }
      persistConfig();
      $("calendarSettingsDialog").close();
    };
    $("closeSettings").onclick = $("cancelSettings").onclick = () => $("calendarSettingsDialog").close();
    $("closePrivacy").onclick = $("donePrivacy").onclick = () => $("privacyDialog").close();
    $("disconnectCalendars").onclick = async () => {
      const hadGoogleToken = googleToken;
      if (hadGoogleToken && window.google && window.google.accounts && window.google.accounts.oauth2) {
        try { window.google.accounts.oauth2.revoke(hadGoogleToken, () => {}); } catch (_) { /* Provider account settings remain available. */ }
      }
      if (msalClient) {
        try { await msalClient.clearCache(); } catch (_) { /* Clearing app state below still removes its saved configuration. */ }
      }
      googleToken = null; googleTokenExpires = 0; googleTokenClient = null; msalClient = null; msalClientId = ""; msalInit = null;
      window.ClearDay.removeCalendarBusy("Google Calendar");
      window.ClearDay.removeCalendarBusy("Outlook Calendar");
      config = { googleClientId: "", microsoftClientId: "", googleLastSync: "", outlookLastSync: "" };
      persistConfig();
      $("privacyStatus").textContent = "Disconnected on this browser. If you want to revoke provider access completely, remove ClearDay from your Google or Microsoft account permissions too.";
    };
    $("clearSchedule").onclick = () => {
      if (!confirm("Permanently delete every schedule item saved in this browser? This cannot be undone unless you have a backup.")) return;
      window.ClearDay.clearSchedule();
      $("privacyStatus").textContent = "Schedule deleted from this browser.";
    };
    if (config.microsoftClientId) initializeMsal().catch(() => {});
    renderStatuses();
  }
};
