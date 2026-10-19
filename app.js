import { CalendarSync } from "./calendar-sync.js";

(() => {
  "use strict";

  const KEY = "clearday.events.v1";
  const state = { events: readEvents(), month: first(new Date()), selected: key(new Date()) };
  const $ = (id) => document.getElementById(id);
  const clone = (value) => JSON.parse(JSON.stringify(value));

  function readEvents() {
    try {
      const value = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(value) ? value.filter(validEvent) : [];
    } catch (_) { return []; }
  }
  function validEvent(event) {
    return event && typeof event.id === "string" && typeof event.title === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(event.date) && /^\d{2}:\d{2}$/.test(event.start) &&
      /^\d{2}:\d{2}$/.test(event.end) && event.end > event.start;
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state.events));
      render();
      window.dispatchEvent(new CustomEvent("clearday:schedule-updated"));
    } catch (_) {
      alert("ClearDay could not save this schedule in the browser. Download a backup and remove some browser storage before continuing.");
    }
  }
  function key(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
  function date(day, clock = "00:00") {
    const [year, month, dayOfMonth] = day.split("-").map(Number);
    const [hours, minutes] = clock.split(":").map(Number);
    return new Date(year, month - 1, dayOfMonth, hours || 0, minutes || 0);
  }
  function first(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function plus(d, amount) { const next = new Date(d); next.setDate(next.getDate() + amount); return next; }
  function week(d) { return plus(d, -d.getDay()); }
  function safe(text) { return String(text).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]); }
  function nice(d, options) { return d.toLocaleDateString(undefined, options || { weekday: "long", day: "numeric", month: "long" }); }
  function tm(d) { return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }).replace(":00", ""); }
  function time(d) { return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; }
  function cat(event) { return `cat-${event.category || "other"}`; }
  function isImported(event) { return Boolean(event.providerOrigin); }

  function instances(from, to) {
    const output = [];
    state.events.forEach((event) => {
      const start = date(event.date, event.start);
      const end = date(event.date, event.end);
      if (!event.weekly) {
        if (start < to && end > from) output.push({ e: event, s: start, z: end, d: event.date });
        return;
      }
      const lastDate = event.repeatUntil || event.date;
      const endClock = event.end.split(":").map(Number);
      for (let occurrence = new Date(start); occurrence < to && key(occurrence) <= lastDate; occurrence = plus(occurrence, 7)) {
        const occurrenceEnd = new Date(occurrence);
        occurrenceEnd.setHours(endClock[0] || 0, endClock[1] || 0, 0, 0);
        if (occurrence < to && occurrenceEnd > from) output.push({ e: event, s: new Date(occurrence), z: occurrenceEnd, d: key(occurrence) });
      }
    });
    return output.sort((a, b) => a.s - b.s);
  }

  function render() {
    const month = state.month;
    const firstDay = week(month);
    const today = key(new Date());
    const days = Array.from({ length: 42 }, (_, index) => plus(firstDay, index));
    let html = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((label) => `<div class="weekday">${label}</div>`).join("");
    $("monthTitle").textContent = month.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    const monthEvents = instances(days[0], plus(days[41], 1));

    days.forEach((day) => {
      const dayKey = key(day);
      const classes = ["calendar-day"];
      const items = monthEvents.filter((item) => item.d === dayKey);
      if (day.getMonth() !== month.getMonth()) classes.push("outside");
      if (dayKey === today) classes.push("today");
      if (dayKey === state.selected) classes.push("selected");
      let chips = items.slice(0, 3).map((item) => {
        const label = safe(`${tm(item.s)} ${item.e.title}`);
        return isImported(item.e)
          ? `<span class="event-chip ${cat(item.e)} imported-chip" title="Busy time imported from ${safe(item.e.providerOrigin)}">${label}</span>`
          : `<button class="event-chip ${cat(item.e)}" data-edit="${safe(item.e.id)}" title="${safe(item.e.title)}">${label}</button>`;
      }).join("");
      if (items.length > 3) chips += `<span class="more-chip">+${items.length - 3} more</span>`;
      html += `<div class="${classes.join(" ")}"><button class="date-number" data-select="${dayKey}">${day.getDate()}</button>${chips}</div>`;
    });
    $("calendarGrid").innerHTML = html;
    $("calendarGrid").querySelectorAll("[data-select]").forEach((button) => {
      button.onclick = () => { state.selected = button.dataset.select; render(); };
    });
    $("calendarGrid").querySelectorAll("[data-edit]").forEach((button) => {
      button.onclick = () => edit(button.dataset.edit);
    });

    $("selectedDateTitle").textContent = nice(date(state.selected));
    const dayItems = instances(date(state.selected), plus(date(state.selected), 1));
    $("dayEvents").innerHTML = dayItems.length ? dayItems.map((item) => {
      const meta = isImported(item.e) ? `Busy time · ${safe(item.e.providerOrigin)}` : `${item.e.weekly ? "Weekly" : "Commitment"}${item.e.notes ? ` · ${safe(item.e.notes)}` : ""}`;
      const action = isImported(item.e) ? "" : `<button class="event-edit" data-edit="${safe(item.e.id)}" aria-label="Edit ${safe(item.e.title)}">···</button>`;
      return `<div class="event-row"><div class="event-time">${tm(item.s)}<br><span>to ${tm(item.z)}</span></div><i class="event-rail ${cat(item.e)}"></i><div><div class="event-name">${safe(item.e.title)}</div><div class="event-meta">${meta}</div></div>${action}</div>`;
    }).join("") : '<div class="empty-day">Nothing scheduled yet. Add your fixed commitments first, then check availability here.</div>';
    $("dayEvents").querySelectorAll("[data-edit]").forEach((button) => { button.onclick = () => edit(button.dataset.edit); });
  }

  function repeatToggle() { $("repeatUntilWrap").hidden = !$("eventWeekly").checked; }
  function openAdd(dayKey) {
    $("eventForm").reset();
    $("eventId").value = "";
    $("dialogTitle").textContent = "Add a commitment";
    $("eventDate").value = dayKey || state.selected;
    $("eventStart").value = "09:00";
    $("eventEnd").value = "10:00";
    $("repeatUntil").value = key(plus(date(dayKey || state.selected), 84));
    $("deleteEvent").hidden = true;
    $("formError").textContent = "";
    repeatToggle();
    $("eventDialog").showModal();
    $("eventTitle").focus();
  }
  function edit(id) {
    const event = state.events.find((item) => item.id === id);
    if (!event || isImported(event)) return;
    $("eventId").value = event.id;
    $("dialogTitle").textContent = "Edit commitment";
    $("eventTitle").value = event.title;
    $("eventDate").value = event.date;
    $("eventCategory").value = event.category || "other";
    $("eventStart").value = event.start;
    $("eventEnd").value = event.end;
    $("eventNotes").value = event.notes || "";
    $("eventWeekly").checked = Boolean(event.weekly);
    $("repeatUntil").value = event.repeatUntil || "";
    $("deleteEvent").hidden = false;
    $("formError").textContent = "";
    repeatToggle();
    $("eventDialog").showModal();
  }

  function findConflict(proposed) {
    const last = date(proposed.weekly ? proposed.repeatUntil : proposed.date);
    for (let cursor = date(proposed.date); cursor <= last; cursor = plus(cursor, proposed.weekly ? 7 : 1)) {
      const dayKey = key(cursor);
      const start = date(dayKey, proposed.start);
      const end = date(dayKey, proposed.end);
      const conflict = instances(start, end).find((item) => item.e.id !== proposed.id && item.s < end && item.z > start);
      if (conflict) return { event: conflict.e, date: dayKey };
    }
    return null;
  }
  $("eventForm").onsubmit = (event) => {
    event.preventDefault();
    const id = $("eventId").value;
    const existing = state.events.find((item) => item.id === id);
    const title = $("eventTitle").value.trim();
    const day = $("eventDate").value;
    const start = $("eventStart").value;
    const end = $("eventEnd").value;
    const weekly = $("eventWeekly").checked;
    const repeatUntil = $("repeatUntil").value;
    if (!title || !day || !start || !end || end <= start) {
      $("formError").textContent = "Add a title and choose an end time after the start. Split overnight shifts at midnight.";
      return;
    }
    if (weekly && (!repeatUntil || repeatUntil < day)) {
      $("formError").textContent = "Choose an end date on or after the first date.";
      return;
    }
    const proposed = Object.assign({}, existing || {}, {
      id: id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())), title, date: day, start, end,
      category: $("eventCategory").value, notes: $("eventNotes").value.trim(), weekly, repeatUntil: weekly ? repeatUntil : ""
    });
    const conflict = findConflict(proposed);
    if (conflict && !confirm(`This overlaps with "${conflict.event.title}" on ${nice(date(conflict.date))}. Save anyway?`)) return;
    if (id) state.events = state.events.map((item) => item.id === id ? proposed : item);
    else state.events.push(proposed);
    state.selected = day;
    state.month = first(date(day));
    $("eventDialog").close();
    save();
  };
  $("deleteEvent").onclick = () => {
    const id = $("eventId").value;
    state.events = state.events.filter((item) => item.id !== id);
    $("eventDialog").close();
    save();
  };

  function slots(minutesNeeded, days, startClock, endClock, buffer) {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const to = plus(from, days);
    const startParts = startClock.split(":").map(Number);
    const endParts = endClock.split(":").map(Number);
    if (endParts[0] * 60 + endParts[1] <= startParts[0] * 60 + startParts[1]) return [];
    const busy = instances(from, to);
    const output = [];
    for (let day = new Date(from); day < to; day = plus(day, 1)) {
      const dayKey = key(day);
      const low = date(dayKey, startClock);
      const high = date(dayKey, endClock);
      let cursor = low;
      const blocks = busy.filter((item) => item.d === dayKey)
        .map((item) => ({ s: new Date(item.s.getTime() - buffer * 60000), z: new Date(item.z.getTime() + buffer * 60000) }))
        .sort((a, b) => a.s - b.s);
      blocks.forEach((block) => {
        if (block.z <= cursor || block.s >= high) return;
        const stop = block.s < high ? block.s : high;
        if (stop - cursor >= minutesNeeded * 60000) output.push({ s: new Date(cursor), z: new Date(cursor.getTime() + minutesNeeded * 60000) });
        if (block.z > cursor) cursor = block.z;
      });
      if (high - cursor >= minutesNeeded * 60000) output.push({ s: new Date(cursor), z: new Date(cursor.getTime() + minutesNeeded * 60000) });
    }
    return output.slice(0, 6);
  }

  $("availabilityForm").onsubmit = (event) => {
    event.preventDefault();
    const query = $("requestText").value;
    let hours = Number($("duration").value);
    let days = Number($("daysAhead").value);
    const start = $("dayStart").value;
    let end = $("dayEnd").value;
    const buffer = Number($("buffer").value);
    const durationMatch = query.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/i);
    if (durationMatch) hours = Math.max(0.5, Math.min(12, Number(durationMatch[1])));
    const horizonMatch = query.match(/\b(tomorrow|next 3 days|next week|next 14 days|next 30 days)\b/i);
    if (horizonMatch) days = ({ tomorrow: 1, "next 3 days": 3, "next week": 7, "next 14 days": 14, "next 30 days": 30 })[horizonMatch[1].toLowerCase()];
    const before = query.match(/before\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (before) {
      let hour = Number(before[1]); const minute = Number(before[2] || 0); const suffix = (before[3] || "").toLowerCase();
      if (suffix === "pm" && hour < 12) hour += 12;
      if (suffix === "am" && hour === 12) hour = 0;
      end = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
    const after = query.match(/after\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    let startClock = start;
    if (after) {
      let hour = Number(after[1]); const minute = Number(after[2] || 0); const suffix = (after[3] || "").toLowerCase();
      if (suffix === "pm" && hour < 12) hour += 12;
      if (suffix === "am" && hour === 12) hour = 0;
      startClock = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
    const found = slots(Math.round(hours * 60), days, startClock, end, buffer);
    if (!found.length) {
      $("availabilityResults").innerHTML = `<div class="result-note">No open block of ${safe(`${hours} hours`)} found. Try more days, a shorter block or a wider time range.</div>`;
      return;
    }
    $("availabilityResults").innerHTML = '<div class="result-note">Open blocks start tomorrow and use the commitments saved here. Confirm the time before you promise it.</div>' + found.map((slot, index) =>
      `<div class="slot-card"><div class="slot-main"><div class="slot-date">${nice(slot.s, { weekday: "short", day: "numeric", month: "short" })}${index === 0 ? " · soonest" : ""}</div><div class="slot-time">${tm(slot.s)} – ${tm(slot.z)}</div></div><div class="slot-actions"><button class="slot-action" data-copy="${slot.s.toISOString()}" data-copy-end="${slot.z.toISOString()}">Copy</button><button class="slot-action" data-block="${key(slot.s)}" data-start="${time(slot.s)}" data-end="${time(slot.z)}">Block</button></div></div>`
    ).join("");
    $("availabilityResults").querySelectorAll("[data-copy]").forEach((button) => {
      button.onclick = async () => {
        const startTime = new Date(button.dataset.copy); const endTime = new Date(button.dataset.copyEnd);
        try { await navigator.clipboard.writeText(`${nice(startTime)}, ${tm(startTime)}–${tm(endTime)}`); button.textContent = "Copied"; }
        catch (_) { button.textContent = "Copy unavailable"; }
        setTimeout(() => { button.textContent = "Copy"; }, 1500);
      };
    });
    $("availabilityResults").querySelectorAll("[data-block]").forEach((button) => {
      button.onclick = () => {
        openAdd(button.dataset.block);
        $("eventTitle").value = "Held time";
        $("eventCategory").value = "other";
        $("eventStart").value = button.dataset.start;
        $("eventEnd").value = button.dataset.end;
      };
    });
  };

  function download(name, data, type) {
    const anchor = document.createElement("a");
    const url = URL.createObjectURL(new Blob([data], { type }));
    anchor.href = url; anchor.download = name; document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $("backupButton").onclick = () => download(`clearday-backup-${key(new Date())}.json`, JSON.stringify({ version: 1, events: state.events }, null, 2), "application/json");
  $("importButton").onclick = () => $("importFile").click();
  $("importFile").onchange = (event) => {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const backup = JSON.parse(reader.result);
        if (backup.version !== 1 || !Array.isArray(backup.events) || !backup.events.every(validEvent)) throw new Error("invalid backup");
        if (confirm(`Restore ${backup.events.length} commitments? This replaces this browser’s schedule.`)) { state.events = backup.events; save(); }
      } catch (_) { alert("That file is not a valid ClearDay backup."); }
    };
    reader.readAsText(file); event.target.value = "";
  };

  function icsEscape(value) { return String(value).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;"); }
  $("exportButton").onclick = () => {
    const rows = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ClearDay//Personal Planner//EN", "CALSCALE:GREGORIAN"];
    state.events.filter((event) => !isImported(event)).forEach((event) => {
      const stamp = (day, clock) => {
        const value = date(day, clock);
        return `${value.getFullYear()}${String(value.getMonth() + 1).padStart(2, "0")}${String(value.getDate()).padStart(2, "0")}T${String(value.getHours()).padStart(2, "0")}${String(value.getMinutes()).padStart(2, "0")}00`;
      };
      rows.push("BEGIN:VEVENT", `UID:${event.id}@clearday.local`, `DTSTART:${stamp(event.date, event.start)}`, `DTEND:${stamp(event.date, event.end)}`, `SUMMARY:${icsEscape(event.title)}`);
      if (event.weekly) rows.push(`RRULE:FREQ=WEEKLY;UNTIL=${event.repeatUntil.replace(/-/g, "")}T235959`);
      rows.push("END:VEVENT");
    });
    rows.push("END:VCALENDAR");
    download("clearday-calendar.ics", rows.join("\r\n"), "text/calendar;charset=utf-8");
  };

  window.ClearDay = {
    getEvents: () => clone(state.events),
    linkCalendarEvent(eventId, provider, remoteId) {
      const event = state.events.find((item) => item.id === eventId);
      if (!event) return;
      event.externalLinks = Object.assign({}, event.externalLinks || {}, { [provider]: remoteId });
      save();
    },
    mergeCalendarBusy(provider, imported) {
      const locallyLinkedIds = new Set(state.events.filter((event) => event.externalLinks && event.externalLinks[provider]).map((event) => event.externalLinks[provider]));
      state.events = state.events.filter((event) => event.providerOrigin !== provider);
      imported.filter((event) => !locallyLinkedIds.has(event.providerEventId)).forEach((event) => state.events.push(event));
      state.events.forEach((event) => {
        const remoteId = event.externalLinks && event.externalLinks[provider];
        const match = remoteId && imported.find((item) => item.providerEventId === remoteId);
        if (match) Object.assign(event, { date: match.date, start: match.start, end: match.end });
      });
      save();
    },
    removeCalendarBusy(provider) {
      state.events = state.events.filter((event) => event.providerOrigin !== provider);
      state.events.forEach((event) => {
        if (event.externalLinks && event.externalLinks[provider]) delete event.externalLinks[provider];
        if (event.externalLinks && !Object.keys(event.externalLinks).length) delete event.externalLinks;
      });
      save();
    },
    clearSchedule() { state.events = []; save(); }
  };

  $("openAddButton").onclick = () => openAdd(state.selected);
  $("addForDay").onclick = () => openAdd(state.selected);
  $("prevMonth").onclick = () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1); render(); };
  $("nextMonth").onclick = () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1); render(); };
  $("todayButton").onclick = () => { state.selected = key(new Date()); state.month = first(new Date()); render(); };
  $("eventWeekly").onchange = repeatToggle;
  $("closeDialog").onclick = $("cancelDialog").onclick = () => $("eventDialog").close();
  $("todayLabel").textContent = `TODAY · ${nice(new Date(), { weekday: "long", day: "numeric", month: "long" }).toUpperCase()}`;

  CalendarSync.init();
  render();
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
})();
