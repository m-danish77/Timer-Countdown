/* =========================================================
   DayCount — main script
   Vanilla JS, LocalStorage-persistent countdown
   ========================================================= */

(() => {
  "use strict";

  // ---------- Constants ----------
  const STORAGE_KEY = "daycount.v1";
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  const RING_CIRCUMFERENCE = 2 * Math.PI * 90; // r=90 in SVG

  // ---------- DOM refs ----------
  const $ = (id) => document.getElementById(id);

  const els = {
    todayDate: $("today-date"),
    setupScreen: $("setup-screen"),
    countdownScreen: $("countdown-screen"),
    form: $("countdown-form"),
    startDate: $("start-date"),
    targetDate: $("target-date"),
    formError: $("form-error"),
    formErrorText: $("form-error-text"),
    daysRemaining: $("days-remaining"),
    daysLabel: $("days-label"),
    weeksText: $("weeks-text"),
    extraDaysText: $("extra-days-text"),
    hours: $("hours"),
    minutes: $("minutes"),
    seconds: $("seconds"),
    ringProgress: $("ring-progress"),
    percentText: $("percent-text"),
    motivation: $("motivation"),
    infoStart: $("info-start"),
    infoTarget: $("info-target"),
    infoTotal: $("info-total"),
    infoElapsed: $("info-elapsed"),
    infoRemaining: $("info-remaining"),
    newCountdownBtn: $("new-countdown-btn"),
    resetBtn: $("reset-btn"),
    completedBanner: $("completed-banner"),
    countdownSubtitle: $("countdown-subtitle"),
  };

  // ---------- State ----------
  let state = {
    startDate: null, // ISO date string (YYYY-MM-DD)
    targetDate: null, // ISO date string (YYYY-MM-DD)
  };
  let tickInterval = null;

  // ======================================================
  // Initialization
  // ======================================================
  function initializeApp() {
    renderTodayDate();
    setMinDates();
    attachEvents();

    const saved = loadCountdown();
    if (saved && saved.startDate && saved.targetDate) {
      state = saved;
      showCountdownScreen();
      startCountdown();
    } else {
      showSetupScreen();
    }
  }

  function renderTodayDate() {
    const now = new Date();
    const formatted = now.toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    els.todayDate.textContent = formatted;
  }

  // Prevent choosing past dates as start (allow today)
  function setMinDates() {
    const todayISO = toISODate(new Date());
    els.startDate.min = todayISO;
    els.startDate.value = todayISO;
    // Target can be any date >= start, set dynamically on change
  }

  // ======================================================
  // Events
  // ======================================================
  function attachEvents() {
    els.form.addEventListener("submit", handleFormSubmit);
    els.startDate.addEventListener("change", syncTargetMin);
    els.newCountdownBtn.addEventListener("click", handleNewCountdown);
    els.resetBtn.addEventListener("click", handleReset);
    syncTargetMin();
  }

  function syncTargetMin() {
    const startVal = els.startDate.value;
    if (startVal) {
      // Target must be strictly after start for a meaningful countdown
      const nextDay = new Date(startVal);
      nextDay.setDate(nextDay.getDate() + 1);
      els.targetDate.min = toISODate(nextDay);
      if (els.targetDate.value && els.targetDate.value <= startVal) {
        els.targetDate.value = "";
      }
    }
  }

  function handleFormSubmit(e) {
    e.preventDefault();
    hideError();

    const startISO = els.startDate.value;
    const targetISO = els.targetDate.value;

    if (!startISO || !targetISO) {
      showError("Please choose both a start date and a target date.");
      return;
    }

    const startDate = new Date(startISO + "T00:00:00");
    const targetDate = new Date(targetISO + "T00:00:00");

    if (targetDate <= startDate) {
      showError("Target date must be after the start date.");
      return;
    }

    state = { startDate: startISO, targetDate: targetISO };
    saveCountdown();
    showCountdownScreen();
    startCountdown();
  }

  function handleNewCountdown() {
    if (
      !confirm("Start a new countdown? Your current progress will be cleared.")
    )
      return;
    clearCountdown();
    stopCountdown();
    els.form.reset();
    setMinDates();
    syncTargetMin();
    showSetupScreen();
  }

  function handleReset() {
    if (!confirm("Reset this countdown?")) return;
    clearCountdown();
    stopCountdown();
    els.form.reset();
    setMinDates();
    syncTargetMin();
    showSetupScreen();
  }

  // ======================================================
  // Screen switching
  // ======================================================
  function showSetupScreen() {
    els.setupScreen.hidden = false;
    els.countdownScreen.hidden = true;
    els.completedBanner.hidden = true;
  }

  function showCountdownScreen() {
    els.setupScreen.hidden = true;
    els.countdownScreen.hidden = false;
    // Re-trigger entrance animation
    els.countdownScreen.style.animation = "none";
    // Force reflow
    void els.countdownScreen.offsetWidth;
    els.countdownScreen.style.animation = "";
  }

  function showCompletedState() {
    els.completedBanner.hidden = false;
    els.daysRemaining.textContent = "0";
    els.daysLabel.textContent = "COUNTDOWN COMPLETE";
    els.hours.textContent = "00";
    els.minutes.textContent = "00";
    els.seconds.textContent = "00";
    setRingProgress(100);
    els.percentText.textContent = "100%";
    els.motivation.textContent = "You made it. 🎉";
    els.countdownSubtitle.textContent = "Your target date has arrived";
  }

  // ======================================================
  // Countdown lifecycle
  // ======================================================
  function startCountdown() {
    stopCountdown();
    updateCountdown(); // immediate first render
    tickInterval = setInterval(updateCountdown, 1000);
  }

  function stopCountdown() {
    if (tickInterval) {
      clearInterval(tickInterval);
      tickInterval = null;
    }
  }

  function updateCountdown() {
    const start = new Date(state.startDate + "T00:00:00");
    // Treat target as END of that day (next day 00:00)
    const target = new Date(state.targetDate + "T00:00:00");
    target.setDate(target.getDate() + 1);

    const now = new Date();

    // --- Completion check ---
    if (now >= target) {
      showCompletedState();
      updateInfoPanel(start, new Date(state.targetDate + "T00:00:00"), true);
      stopCountdown();
      return;
    }

    // --- Calendar days remaining (today → target date) ---
    const targetCal = new Date(state.targetDate + "T00:00:00");
    const daysRemaining = daysBetween(now, targetCal);
    const clampedDays = Math.max(0, daysRemaining);

    // --- Live HH:MM:SS until end of target day ---
    const remainingMs = target.getTime() - now.getTime();
    const totalSeconds = Math.floor(remainingMs / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;

    // --- Weeks + leftover days ---
    const weeks = Math.floor(clampedDays / 7);
    const extraDays = clampedDays % 7;

    // --- Progress ---
    const progress = calculateProgress(start, target, now);

    // --- Render ---
    renderDays(clampedDays);
    els.weeksText.textContent = `${weeks} Week${weeks === 1 ? "" : "s"}`;
    els.extraDaysText.textContent = `${extraDays} Day${extraDays === 1 ? "" : "s"}`;
    els.hours.textContent = pad(h);
    els.minutes.textContent = pad(m);
    els.seconds.textContent = pad(s);
    setRingProgress(progress);
    els.percentText.textContent = `${Math.round(progress)}%`;
    els.motivation.textContent = pickMotivation(progress);
    els.daysLabel.textContent = "DAYS REMAINING";
    els.countdownSubtitle.textContent = `Until ${formatLongDate(targetCal)}`;

    updateInfoPanel(start, targetCal, false);
  }

  function renderDays(n) {
    const str = String(n);
    if (els.daysRemaining.textContent !== str) {
      els.daysRemaining.textContent = str;
      // subtle tick animation
      els.daysRemaining.classList.remove("tick");
      void els.daysRemaining.offsetWidth;
      els.daysRemaining.classList.add("tick");
      setTimeout(() => els.daysRemaining.classList.remove("tick"), 400);
    }
  }

  // ======================================================
  // Calculations
  // ======================================================
  /**
   * Calendar days between two dates (ignores time-of-day, DST-safe).
   * Returns target - source in days (can be negative).
   */
  function daysBetween(source, target) {
    const a = Date.UTC(
      source.getFullYear(),
      source.getMonth(),
      source.getDate(),
    );
    const b = Date.UTC(
      target.getFullYear(),
      target.getMonth(),
      target.getDate(),
    );
    return Math.round((b - a) / MS_PER_DAY);
  }

  function calculateProgress(start, target, now) {
    const total = target.getTime() - start.getTime();
    if (total <= 0) return 100;
    const elapsed = now.getTime() - start.getTime();
    const pct = (elapsed / total) * 100;
    return Math.max(0, Math.min(100, pct));
  }

  function calculateRemainingTime(targetDateTime, now) {
    return Math.max(0, targetDateTime - now.getTime());
  }

  // ======================================================
  // Rendering helpers
  // ======================================================
  function setRingProgress(pct) {
    const offset = RING_CIRCUMFERENCE - (pct / 100) * RING_CIRCUMFERENCE;
    els.ringProgress.style.strokeDashoffset = offset;
  }

  function updateInfoPanel(start, targetCal, completed) {
    const now = new Date();
    const totalDays = daysBetween(start, targetCal);
    const elapsedDays = Math.max(
      0,
      Math.min(totalDays, daysBetween(start, now)),
    );
    const remainingDays = Math.max(0, totalDays - elapsedDays);

    els.infoStart.textContent = formatLongDate(start);
    els.infoTarget.textContent = formatLongDate(targetCal);
    els.infoTotal.textContent = `${totalDays} day${totalDays === 1 ? "" : "s"}`;
    els.infoElapsed.textContent = completed
      ? `${totalDays} day${totalDays === 1 ? "" : "s"}`
      : `${elapsedDays} day${elapsedDays === 1 ? "" : "s"}`;
    els.infoRemaining.textContent = completed
      ? "0 days"
      : `${remainingDays} day${remainingDays === 1 ? "" : "s"}`;
  }

  function pickMotivation(pct) {
    if (pct >= 100) return "You made it. 🎉";
    if (pct >= 90) return "Almost there.";
    if (pct >= 65) return "You're getting closer.";
    if (pct >= 35) return "Keep going.";
    if (pct >= 10) return "The journey has begun.";
    return "Every day counts.";
  }

  function formatLongDate(d) {
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  function toISODate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  // ======================================================
  // LocalStorage persistence
  // ======================================================
  function saveCountdown() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          startDate: state.startDate,
          targetDate: state.targetDate,
          savedAt: Date.now(),
        }),
      );
    } catch (err) {
      console.warn("Could not save countdown:", err);
    }
  }

  function loadCountdown() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (data && data.startDate && data.targetDate) return data;
      return null;
    } catch (err) {
      console.warn("Could not load countdown:", err);
      return null;
    }
  }

  function clearCountdown() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.warn("Could not clear countdown:", err);
    }
    state = { startDate: null, targetDate: null };
  }

  // ======================================================
  // Error UI
  // ======================================================
  function showError(msg) {
    els.formErrorText.textContent = msg;
    els.formError.hidden = false;
    // Re-trigger shake animation
    els.formError.style.animation = "none";
    void els.formError.offsetWidth;
    els.formError.style.animation = "";
  }

  function hideError() {
    els.formError.hidden = true;
  }

  // ======================================================
  // Boot
  // ======================================================
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeApp);
  } else {
    initializeApp();
  }
})();
