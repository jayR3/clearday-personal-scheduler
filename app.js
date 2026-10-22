import { CalendarSync } from "./calendar-sync.js";

(() => {
  "use strict";

  const KEY = "clearday.events.v1";
  const state = { events: readEvents(), month: first(new Date()), selected: key(new Date()), view: "month", weekStart: week(new Date()) };
  const $ = (id) => document.getElementById(id);
  const clone = (value) => JSON.parse(JSON.stringify(value));

  function readEvents() {
    try {
      const value = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(value) ? value.filter(validEvent) : [];
    } catch (_) { return []; }
  }
  function validTime(value) {
    if (!/^\d{2}:\d{2}$/.test(value || "")) return false;
    const parts = value.split(":").map(Number);
    return parts[0] < 24 && parts[1] < 60;
  }
  function validEvent(event) {
    return event && typeof event.id === "string" && typeof event.title === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(event.date) && validTime(event.start) && validTime(event.end) &&
      (!event.weekly || (/^\d{4}-\d{2}-\d{2}$/.test(event.repeatUntil) && event.repeatUntil >= event.date));
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state.events));
      $("availabilityResults").innerHTML = "";
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
  function eventEnd(start, event) {
    const end = date(key(start), event.end);
    if (end <= start) end.setDate(end.getDate() + 1);
    return end;
  }
  function durationLabel(milliseconds) {
    const minutes = Math.round(milliseconds / 60000);
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return hours ? hours + "h" + (remainder ? " " + remainder + "m" : "") : remainder + "m";
  }

  function instances(from, to) {
    const output = [];
    state.events.forEach((event) => {
      const start = date(event.date, event.start);
      if (!event.weekly) {
        const end = eventEnd(start, event);
        if (start < to && end > from) output.push({ e: event, s: start, z: end, d: event.date });
        return;
      }
      const lastDate = event.repeatUntil || event.date;
      for (let occurrence = new Date(start); occurrence < to && key(occurrence) <= lastDate; occurrence = plus(occurrence, 7)) {
        const occurrenceEnd = eventEnd(occurrence, event);
        if (occurrence < to && occurrenceEnd > from) output.push({ e: event, s: new Date(occurrence), z: occurrenceEnd, d: key(occurrence) });
      }
    });
    return output.sort((a, b) => a.s - b.s);
  }

  function openIntervals(dayKey, startClock, endClock, buffer) {
    if (!startClock || !endClock || endClock <= startClock) return [];
    const dayStart = date(dayKey, startClock);
    const dayEnd = date(dayKey, endClock);
    const now = new Date();
    const low = key(now) === dayKey && now > dayStart ? now : dayStart;
    if (dayEnd <= low) return [];
    const padding = Math.max(0, Number(buffer) || 0) * 60000;
    const blocks = instances(new Date(low.getTime() - padding), new Date(dayEnd.getTime() + padding))
      .map((item) => ({
        s: new Date(Math.max(low.getTime(), item.s.getTime() - padding)),
        z: new Date(Math.min(dayEnd.getTime(), item.z.getTime() + padding))
      }))
      .filter((item) => item.z > item.s)
      .sort((a, b) => a.s - b.s);
    const gaps = [];
    let cursor = low;
    blocks.forEach((block) => {
      if (block.s > cursor && block.s - cursor >= 30 * 60000) gaps.push({ s: new Date(cursor), z: new Date(block.s) });
      if (block.z > cursor) cursor = block.z;
    });
    if (dayEnd - cursor >= 30 * 60000) gaps.push({ s: new Date(cursor), z: new Date(dayEnd) });
    return gaps;
  }

  function renderSelectedDay() {
    const selectedDay = date(state.selected);
    const selectedDayEnd = plus(selectedDay, 1);
    $("selectedDateTitle").textContent = nice(selectedDay);
    const dayItems = instances(selectedDay, selectedDayEnd);
    const activities = dayItems.length ? dayItems.map((item) => {
      const continuesFromEarlier = item.s < selectedDay;
      const segmentStart = continuesFromEarlier ? selectedDay : item.s;
      const segmentEnd = item.z > selectedDayEnd ? selectedDayEnd : item.z;
      const meta = isImported(item.e)
        ? "Busy time · " + safe(item.e.providerOrigin)
        : (item.e.weekly ? "Weekly" : "Commitment") + (item.e.notes ? " · " + safe(item.e.notes) : "");
      const continuity = (continuesFromEarlier ? " · continues from prior day" : "") + (item.z > selectedDayEnd ? " · continues next day" : "");
      const action = isImported(item.e) ? "" : '<button class="event-edit" data-edit="' + safe(item.e.id) + '" aria-label="Edit ' + safe(item.e.title) + '">Edit</button>';
      return '<div class="event-row"><div class="event-time">' + (continuesFromEarlier ? "Continues" : tm(segmentStart)) + '<br><span>to ' + tm(segmentEnd) + (item.z > selectedDayEnd ? ' · midnight' : '') + '</span></div><i class="event-rail ' + cat(item.e) + '"></i><div><div class="event-name">' + safe(item.e.title) + '</div><div class="event-meta">' + meta + safe(continuity) + '</div></div>' + action + '</div>';
    }).join("") : '<div class="empty-day">No activities on this date. Add a commitment to get started.</div>';
    $("dayEvents").innerHTML = activities;
    $("dayAgendaEvents").innerHTML = activities;
    $("dayAgendaCount").textContent = dayItems.length ? (dayItems.length === 1 ? "1 activity" : dayItems.length + " activities") : "No activities";
    ["dayEvents", "dayAgendaEvents"].forEach((containerId) => {
      $(containerId).querySelectorAll("[data-edit]").forEach((button) => {
        button.onclick = () => edit(button.dataset.edit);
      });
    });
    $("dayAddButton").onclick = () => openAdd(state.selected);
  }

  function render() {
    const isMonth = state.view === "month";
    const isWeek = state.view === "week";
    const isDay = state.view === "day";
    const today = key(new Date());
    $("searchDate").value = state.selected;
    $("monthViewButton").classList.toggle("active", isMonth);
    $("weekViewButton").classList.toggle("active", isWeek);
    $("dayViewButton").classList.toggle("active", isDay);
    $("monthViewButton").setAttribute("aria-pressed", String(isMonth));
    $("weekViewButton").setAttribute("aria-pressed", String(isWeek));
    $("dayViewButton").setAttribute("aria-pressed", String(isDay));
    $("prevMonth").setAttribute("aria-label", isWeek ? "Previous week" : isDay ? "Previous day" : "Previous month");
    $("nextMonth").setAttribute("aria-label", isWeek ? "Next week" : isDay ? "Next day" : "Next month");
    $("calendarGrid").hidden = !isMonth;
    $("weekGrid").hidden = !isWeek;
    $("dayGrid").hidden = !isDay;
    $("dayPanel").hidden = isDay;

    if (isDay) {
      $("monthTitle").textContent = nice(date(state.selected), { weekday: "long", day: "numeric", month: "long", year: "numeric" });
      renderSelectedDay();
      return;
    }

    if (isWeek) {
      const weekStart = state.weekStart || week(date(state.selected));
      const weekEnd = plus(weekStart, 6);
      const startLabel = weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const endLabel = weekEnd.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      $("monthTitle").textContent = startLabel + " – " + endLabel + ", " + weekEnd.getFullYear();
      const startClock = $("dayStart").value || "08:00";
      const endClock = $("dayEnd").value || "20:00";
      const buffer = Number($("buffer").value) || 0;
      const validWindow = endClock > startClock;
      const windowText = validWindow
        ? tm(date(key(weekStart), startClock)) + "–" + tm(date(key(weekStart), endClock))
        : "a same-day window";
      const days = Array.from({ length: 7 }, (_, index) => plus(weekStart, index));
      const rows = days.map((day) => {
        const dayKey = key(day);
        const dayStart = date(dayKey);
        const dayEnd = plus(dayStart, 1);
        const dayItems = instances(dayStart, dayEnd);
        const now = new Date();
        const past = dayEnd <= now;
        const gaps = validWindow && !past ? openIntervals(dayKey, startClock, endClock, buffer) : [];
        const total = gaps.reduce((sum, gap) => sum + gap.z - gap.s, 0);
        const totalText = past ? "Past" : validWindow ? durationLabel(total) + " open" : "Set hours";
        const commitments = dayItems.length ? dayItems.map((item) => {
          const continuesFromEarlier = item.s < dayStart;
          const segmentEnd = item.z > dayEnd ? dayEnd : item.z;
          const timeText = continuesFromEarlier
            ? "Continues · to " + tm(segmentEnd)
            : tm(item.s) + "–" + tm(item.z) + (key(item.z) !== dayKey ? " · next day" : "");
          const body = '<strong>' + safe(timeText) + '</strong><span>' + safe(item.e.title) + '</span>';
          return isImported(item.e)
            ? '<div class="week-event ' + cat(item.e) + ' imported-week-event">' + body + '<small>Busy time · ' + safe(item.e.providerOrigin) + '</small></div>'
            : '<button class="week-event ' + cat(item.e) + '" data-edit="' + safe(item.e.id) + '" data-day="' + dayKey + '">' + body + '</button>';
        }).join("") : '<div class="week-empty">No commitments</div>';
        const open = gaps.length
          ? gaps.map((gap) => '<div class="week-open-block"><strong>' + safe(tm(gap.s)) + '–' + safe(tm(gap.z)) + '</strong><span>' + safe(durationLabel(gap.z - gap.s)) + ' free</span></div>').join("")
          : '<div class="week-empty">' + (past ? "Past day" : validWindow ? "No open block of 30+ minutes" : "Choose an end time after the start") + '</div>';
        const classes = ["week-day-row"];
        if (dayKey === today) classes.push("today");
        if (dayKey === state.selected) classes.push("selected");
        return '<section class="' + classes.join(" ") + '"><div class="week-day-aside"><button class="week-day-date" data-select="' + dayKey + '">' + safe(nice(day, { weekday: "short", day: "numeric", month: "short" })) + '</button><span class="week-day-open-total">' + safe(totalText) + '</span></div><div class="week-day-column"><p class="week-column-label">Commitments</p><div class="week-events-list">' + commitments + '</div></div><div class="week-day-column"><p class="week-column-label">Free time · 30+ min</p><div class="week-open-list">' + open + '</div></div></section>';
      }).join("");
      const note = validWindow
        ? "Free time shown within " + windowText + ", with a " + buffer + "-minute buffer around commitments. Change these under Schedule Check."
        : "Set a same-day time window under Schedule Check to see free spaces.";
      $("weekGrid").innerHTML = '<p class="week-agenda-note">' + safe(note) + '</p>' + rows;
      $("weekGrid").querySelectorAll("[data-select]").forEach((button) => {
        button.onclick = () => selectDate(button.dataset.select);
      });
      $("weekGrid").querySelectorAll("[data-edit]").forEach((button) => {
        button.onclick = () => edit(button.dataset.edit);
      });
      renderSelectedDay();
      return;
    }

    const month = state.month;
    const firstDay = week(month);
    const days = Array.from({ length: 42 }, (_, index) => plus(firstDay, index));
    let html = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((label) => '<div class="weekday">' + label + '</div>').join("");
    $("monthTitle").textContent = month.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    const monthEvents = instances(days[0], plus(days[41], 1));

    days.forEach((day) => {
      const dayKey = key(day);
      const dayStart = date(dayKey);
      const dayEnd = plus(dayStart, 1);
      const classes = ["calendar-day"];
      const items = monthEvents.filter((item) => item.s < dayEnd && item.z > dayStart);
      if (day.getMonth() !== month.getMonth()) classes.push("outside");
      if (dayKey === today) classes.push("today");
      if (dayKey === state.selected) classes.push("selected");
      let chips = items.slice(0, 3).map((item) => {
        const startsToday = item.s >= dayStart && item.s < dayEnd;
        const label = startsToday
          ? tm(item.s) + " " + item.e.title + (key(item.z) !== dayKey ? " ↗" : "")
          : "↳ " + item.e.title + " · " + tm(item.z);
        const chipClass = startsToday ? "" : " continuation-chip";
        return isImported(item.e)
          ? '<span class="event-chip ' + cat(item.e) + chipClass + ' imported-chip" title="Busy time imported from ' + safe(item.e.providerOrigin) + '">' + safe(label) + '</span>'
          : '<button class="event-chip ' + cat(item.e) + chipClass + '" data-edit="' + safe(item.e.id) + '" title="' + safe(item.e.title) + '">' + safe(label) + '</button>';
      }).join("");
      if (items.length > 3) chips += '<span class="more-chip">+' + (items.length - 3) + ' more</span>';
      html += '<div class="' + classes.join(" ") + '"><button class="date-number" data-select="' + dayKey + '">' + day.getDate() + '</button>' + chips + '</div>';
    });
    $("calendarGrid").innerHTML = html;
    $("calendarGrid").querySelectorAll("[data-select]").forEach((button) => {
      button.onclick = () => selectDate(button.dataset.select);
    });
    $("calendarGrid").querySelectorAll("[data-edit]").forEach((button) => {
      button.onclick = () => edit(button.dataset.edit);
    });

    renderSelectedDay();
  }

  function repeatToggle() { $("repeatUntilWrap").hidden = !$("eventWeekly").checked; }
  function updateOvernightHint() {
    const start = $("eventStart").value;
    const end = $("eventEnd").value;
    if (!start || !end) $("overnightHint").textContent = "If the end time is earlier, this commitment ends the following day.";
    else if (start === end) $("overnightHint").textContent = "Same start and end time means a 24-hour commitment.";
    else if (end < start) $("overnightHint").textContent = "Overnight commitment · ends the following day and blocks that morning.";
    else $("overnightHint").textContent = "Same-day commitment.";
  }
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
    updateOvernightHint();
    $("eventDialog").showModal();
    $("eventTitle").focus();
  }
  function edit(id) {
    const event = state.events.find((item) => item.id === id);
    if (!event || isImported(event)) return;
    state.selected = event.date;
    state.month = first(date(event.date));
    state.weekStart = week(date(event.date));
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
    updateOvernightHint();
    $("eventDialog").showModal();
  }

  function findConflict(proposed) {
    const last = date(proposed.weekly ? proposed.repeatUntil : proposed.date);
    for (let cursor = date(proposed.date); cursor <= last; cursor = plus(cursor, proposed.weekly ? 7 : 1)) {
      const dayKey = key(cursor);
      const start = date(dayKey, proposed.start);
      const end = eventEnd(start, proposed);
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
    if (!title || !day || !start || !end) {
      $("formError").textContent = "Add a title, date and both times.";
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
    state.weekStart = week(date(day));
    $("eventDialog").close();
    save();
  };
  $("deleteEvent").onclick = () => {
    const id = $("eventId").value;
    state.events = state.events.filter((item) => item.id !== id);
    $("eventDialog").close();
    save();
  };

  function slots(minutesNeeded, dayKey, startClock, endClock, buffer) {
    if (!startClock || !endClock || endClock <= startClock) return [];
    const dayStart = date(dayKey, startClock);
    const dayEnd = date(dayKey, endClock);
    const now = new Date();
    const low = key(now) === dayKey && now > dayStart ? now : dayStart;
    if (dayEnd <= low) return [];
    const padding = Math.max(0, Number(buffer) || 0) * 60000;
    const busy = instances(new Date(low.getTime() - padding), new Date(dayEnd.getTime() + padding));
    const blocks = busy
      .map((item) => ({
        s: new Date(Math.max(low.getTime(), item.s.getTime() - padding)),
        z: new Date(Math.min(dayEnd.getTime(), item.z.getTime() + padding))
      }))
      .filter((item) => item.z > item.s)
      .sort((a, b) => a.s - b.s);
    const output = [];
    let cursor = low;
    blocks.forEach((block) => {
      if (block.z <= cursor || block.s >= dayEnd) return;
      if (block.s > cursor && block.s - cursor >= minutesNeeded * 60000) {
        output.push({ s: new Date(cursor), z: new Date(cursor.getTime() + minutesNeeded * 60000) });
      }
      if (block.z > cursor) cursor = block.z;
    });
    if (dayEnd - cursor >= minutesNeeded * 60000) output.push({ s: new Date(cursor), z: new Date(cursor.getTime() + minutesNeeded * 60000) });
    return output.slice(0, 6);
  }

  $("availabilityForm").onsubmit = (event) => {
    event.preventDefault();
    const hours = Number($("duration").value);
    const selectedDate = state.selected;
    const startClock = $("dayStart").value;
    const endClock = $("dayEnd").value;
    const buffer = Number($("buffer").value);
    const found = slots(Math.round(hours * 60), selectedDate, startClock, endClock, buffer);
    const dateLabel = nice(date(selectedDate), { weekday: "long", day: "numeric", month: "long" });
    const startLabel = tm(date(selectedDate, startClock));
    const endLabel = tm(date(selectedDate, endClock));
    const gapLabel = buffer === 0 ? "no extra gap around events" : buffer + "-minute gap around events";
    const summary = "Looking for a " + hours + "-hour opening on " + dateLabel + ", between " + startLabel + " and " + endLabel + ", with a " + gapLabel + ".";

    if (!found.length) {
      $("availabilityResults").innerHTML = '<p class="result-note">' + safe(summary) + ' No matching opening was found. Choose another date, widen the hours or shorten the time block.</p>';
      return;
    }
    $("availabilityResults").innerHTML = '<p class="result-note">' + safe(summary) + '</p>' + found.map((slot, index) =>
      '<div class="slot-card"><div class="slot-main"><div class="slot-date">' +
      nice(slot.s, { weekday: "short", day: "numeric", month: "short" }) + (index === 0 ? " · soonest" : "") +
      '</div><div class="slot-time">' + tm(slot.s) + ' – ' + tm(slot.z) +
      '</div></div><div class="slot-actions"><button class="slot-action" data-copy="' + slot.s.toISOString() +
      '" data-copy-end="' + slot.z.toISOString() + '">Copy</button><button class="slot-action" data-block="' +
      key(slot.s) + '" data-start="' + time(slot.s) + '" data-end="' + time(slot.z) + '">Block</button></div></div>'
    ).join("");
    $("availabilityResults").querySelectorAll("[data-copy]").forEach((button) => {
      button.onclick = async () => {
        const startTime = new Date(button.dataset.copy); const endTime = new Date(button.dataset.copyEnd);
        try { await navigator.clipboard.writeText(nice(startTime) + ", " + tm(startTime) + "–" + tm(endTime)); button.textContent = "Copied"; }
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
      const stamp = (value) => String(value.getFullYear()) + String(value.getMonth() + 1).padStart(2, "0") +
        String(value.getDate()).padStart(2, "0") + "T" + String(value.getHours()).padStart(2, "0") +
        String(value.getMinutes()).padStart(2, "0") + "00";
      const start = date(event.date, event.start);
      const end = eventEnd(start, event);
      rows.push("BEGIN:VEVENT", "UID:" + event.id + "@clearday.local", "DTSTART:" + stamp(start), "DTEND:" + stamp(end), "SUMMARY:" + icsEscape(event.title));
      if (event.weekly) rows.push("RRULE:FREQ=WEEKLY;UNTIL=" + event.repeatUntil.replace(/-/g, "") + "T235959");
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

  function selectDate(dayKey) {
    state.selected = dayKey;
    state.month = first(date(dayKey));
    state.weekStart = week(date(dayKey));
    $("availabilityResults").innerHTML = "";
    render();
  }

  $("openAddButton").onclick = () => openAdd(state.selected);
  $("addForDay").onclick = () => openAdd(state.selected);
  $("monthViewButton").onclick = () => { state.view = "month"; state.month = first(date(state.selected)); render(); };
  $("weekViewButton").onclick = () => { state.view = "week"; state.weekStart = week(date(state.selected)); render(); };
  $("dayViewButton").onclick = () => { state.view = "day"; render(); };
  $("prevMonth").onclick = () => {
    if (state.view === "week") selectDate(key(plus(state.weekStart, -7)));
    else if (state.view === "day") selectDate(key(plus(date(state.selected), -1)));
    else { state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1); render(); }
  };
  $("nextMonth").onclick = () => {
    if (state.view === "week") selectDate(key(plus(state.weekStart, 7)));
    else if (state.view === "day") selectDate(key(plus(date(state.selected), 1)));
    else { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1); render(); }
  };
  $("todayButton").onclick = () => selectDate(key(new Date()));
  $("dayStart").onchange = $("dayEnd").onchange = $("buffer").onchange = () => { if (state.view === "week") render(); };
  $("searchDate").onchange = () => { if ($("searchDate").value) { state.view = "day"; selectDate($("searchDate").value); } };
  $("eventStart").onchange = $("eventEnd").onchange = updateOvernightHint;
  $("eventWeekly").onchange = repeatToggle;
  $("closeDialog").onclick = $("cancelDialog").onclick = () => $("eventDialog").close();
  $("todayLabel").textContent = `TODAY · ${nice(new Date(), { weekday: "long", day: "numeric", month: "long" }).toUpperCase()}`;

  CalendarSync.init();
  render();
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
})();
