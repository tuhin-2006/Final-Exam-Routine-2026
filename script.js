/* =========================================================
   RPI CST EXAM ROUTINE DASHBOARD — SCRIPT
   Vanilla JS (ES6+). No frameworks.
   ========================================================= */

(() => {
  'use strict';

  /* ---------------------------------------------------------
     1. EXAM DATA — single source of truth
     --------------------------------------------------------- */
  const EXAMS = [
    { date: '2026-08-11', time: '02:00 PM', subject: 'Social Science',                  code: '25811' },
    { date: '2026-08-22', time: '02:00 PM', subject: 'IT Support Services',             code: '28533' },
    { date: '2026-08-27', time: '02:00 PM', subject: 'Mathematics-3',                   code: '25931' },
    { date: '2026-09-01', time: '10:00 AM', subject: 'Digital Electronics-1',           code: '26831' },
    { date: '2026-09-05', time: '10:00 AM', subject: 'Application Development Using Python', code: '28531' },
    { date: '2026-09-07', time: '10:00 AM', subject: 'Physics-2',                       code: '25922' },
  ];

  const QUOTES = [
    "Success is the sum of small efforts repeated day in and day out.",
    "The expert in anything was once a beginner.",
    "Don't watch the clock; do what it does — keep going.",
    "Discipline is choosing between what you want now and what you want most.",
    "A little progress each day adds up to big results.",
    "Focus on being productive instead of busy.",
    "Your future is created by what you do today, not tomorrow.",
    "The pain of studying is nothing compared to the pain of not knowing.",
    "Push yourself, because no one else is going to do it for you.",
    "Every exam is a chance to prove how far you've come."
  ];

  const LS_KEYS = {
    theme: 'rpi_theme',
    search: 'rpi_search',
    filter: 'rpi_filter',
    sort: 'rpi_sort',
    progress: 'rpi_progress',   // { [code]: 0-100 }
    confetti: 'rpi_confetti_fired', // { [code]: 'YYYY-MM-DD' }
  };

  /* ---------------------------------------------------------
     2. STATE
     --------------------------------------------------------- */
  let state = {
    search: localStorage.getItem(LS_KEYS.search) || '',
    filter: localStorage.getItem(LS_KEYS.filter) || 'all',
    sort: localStorage.getItem(LS_KEYS.sort) || 'date',
    progress: safeParse(localStorage.getItem(LS_KEYS.progress), {}),
    confettiFired: safeParse(localStorage.getItem(LS_KEYS.confetti), {}),
  };

  function safeParse(str, fallback) {
    try { return str ? JSON.parse(str) : fallback; } catch { return fallback; }
  }

  function persist(key, value) {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  }

  /* ---------------------------------------------------------
     3. DATE / STATUS HELPERS
     --------------------------------------------------------- */

  // Combine date + 12hr time string into a real Date object
  function examDateTime(exam) {
    const [y, m, d] = exam.date.split('-').map(Number);
    const match = /(\d+):(\d+)\s*(AM|PM)/i.exec(exam.time);
    let hours = 0, minutes = 0;
    if (match) {
      hours = parseInt(match[1], 10) % 12;
      minutes = parseInt(match[2], 10);
      if (/PM/i.test(match[3])) hours += 12;
    }
    return new Date(y, m - 1, d, hours, minutes, 0);
  }

  function dayName(exam) {
    return examDateTime(exam).toLocaleDateString('en-US', { weekday: 'long' });
  }

  function formatDatePretty(exam) {
    return examDateTime(exam).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  function isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  // Returns { diffMs, days, hours, minutes, seconds, status }
  function getCountdown(exam, now) {
    const examEnd = examDateTime(exam);
    // Treat an exam as "completed" once its scheduled time fully passes (add 2hr exam duration buffer)
    const examCloses = new Date(examEnd.getTime() + 2 * 60 * 60 * 1000);
    const diffMs = examEnd.getTime() - now.getTime();

    let status = 'upcoming';
    if (now.getTime() > examCloses.getTime()) {
      status = 'completed';
    } else if (isSameDay(now, examEnd)) {
      status = 'today';
    } else {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      if (isSameDay(tomorrow, examEnd)) status = 'tomorrow';
    }

    const clamped = Math.max(diffMs, 0);
    const days = Math.floor(clamped / 86400000);
    const hours = Math.floor((clamped % 86400000) / 3600000);
    const minutes = Math.floor((clamped % 3600000) / 60000);
    const seconds = Math.floor((clamped % 60000) / 1000);

    return { diffMs, days, hours, minutes, seconds, status };
  }

  function statusMeta(status) {
    switch (status) {
      case 'today':     return { label: 'Today',     color: 'orange', icon: 'fa-bolt' };
      case 'tomorrow':  return { label: 'Tomorrow',  color: 'blue',   icon: 'fa-clock' };
      case 'completed': return { label: 'Completed', color: 'gray',  icon: 'fa-check' };
      default:          return { label: 'Upcoming',  color: 'green', icon: 'fa-hourglass-half' };
    }
  }

  function getProgress(code) {
    return state.progress[code] ?? 0;
  }

  function setProgress(code, value) {
    state.progress[code] = value;
    persist(LS_KEYS.progress, state.progress);
    renderAll();
  }

  /* ---------------------------------------------------------
     4. LIVE CLOCK
     --------------------------------------------------------- */
  function updateClock() {
    const now = new Date();
    const dateEl = document.getElementById('clockDate');
    const timeEl = document.getElementById('clockTime');
    dateEl.textContent = now.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
    timeEl.textContent = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  }

  /* ---------------------------------------------------------
     5. NEXT EXAM (HERO) RENDER
     --------------------------------------------------------- */
  const RING_CIRCUMFERENCE = 2 * Math.PI * 52; // matches r=52 in SVG

  function getNextExam(now) {
    const upcoming = EXAMS
      .map(e => ({ exam: e, cd: getCountdown(e, now) }))
      .filter(x => x.cd.status !== 'completed')
      .sort((a, b) => a.cd.diffMs - b.cd.diffMs);
    return upcoming[0] || null;
  }

  let lastConfettiCheck = null;

  function renderNextExam(now) {
    const next = getNextExam(now);
    const card = document.getElementById('nextExamCard');
    if (!next) {
      card.querySelector('.next-exam-body').innerHTML = '<p style="color:#fff;font-weight:600;">All exams completed. Well done! 🎉</p>';
      document.getElementById('nextStatusBadge').textContent = 'Done';
      return;
    }
    const { exam, cd } = next;
    const meta = statusMeta(cd.status);

    document.getElementById('nextSubject').textContent = exam.subject;
    document.getElementById('nextCode').textContent = `Code: ${exam.code}`;
    document.getElementById('nextDate').innerHTML = `<i class="fa-regular fa-calendar"></i> ${formatDatePretty(exam)} (${dayName(exam)})`;
    document.getElementById('nextTime').innerHTML = `<i class="fa-regular fa-clock"></i> ${exam.time}`;

    const badge = document.getElementById('nextStatusBadge');
    badge.textContent = meta.label;
    badge.className = `status-badge status-${meta.color}`;

    document.getElementById('cdHours').textContent = String(cd.hours).padStart(2, '0');
    document.getElementById('cdMinutes').textContent = String(cd.minutes).padStart(2, '0');
    document.getElementById('cdSeconds').textContent = String(cd.seconds).padStart(2, '0');
    document.getElementById('ringDays').textContent = cd.status === 'today' ? 'Today' : cd.days;

    // Ring: fraction of a 14-day "prep window" elapsed (visual only)
    const WINDOW_DAYS = 14;
    const fraction = Math.min(Math.max(1 - (cd.diffMs / (WINDOW_DAYS * 86400000)), 0), 1);
    const ring = document.getElementById('ringTime');
    ring.style.strokeDasharray = RING_CIRCUMFERENCE;
    ring.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - fraction);

    // Overall time-progress bar (same fraction)
    document.getElementById('nextTimeProgressFill').style.width = `${fraction * 100}%`;

    // Prep range control, synced to stored progress
    const range = document.getElementById('nextPrepRange');
    const val = document.getElementById('nextPrepValue');
    const stored = getProgress(exam.code);
    if (document.activeElement !== range) range.value = stored;
    val.textContent = `${stored}%`;
    range.oninput = (e) => {
      val.textContent = `${e.target.value}%`;
    };
    range.onchange = (e) => {
      setProgress(exam.code, Number(e.target.value));
    };

    // Confetti once per day when an exam transitions into "today"
    const today = now.toISOString().slice(0, 10);
    if (cd.status === 'today' && state.confettiFired[exam.code] !== today) {
      state.confettiFired[exam.code] = today;
      persist(LS_KEYS.confetti, state.confettiFired);
      fireConfetti();
      showToast(`Today is your ${exam.subject} exam. Best of luck!`, 'success', 'fa-solid fa-graduation-cap');
    }
  }

  /* ---------------------------------------------------------
     6. STATS STRIP
     --------------------------------------------------------- */
  function renderStats(now) {
    const cds = EXAMS.map(e => getCountdown(e, now));
    const total = EXAMS.length;
    const completed = cds.filter(c => c.status === 'completed').length;
    const upcoming = total - completed;
    const avgProgress = Math.round(
      EXAMS.reduce((sum, e) => sum + getProgress(e.code), 0) / total
    );

    document.getElementById('statTotal').textContent = total;
    document.getElementById('statUpcoming').textContent = upcoming;
    document.getElementById('statCompleted').textContent = completed;
    document.getElementById('statAvgProgress').textContent = `${avgProgress}%`;
  }

  /* ---------------------------------------------------------
     7. FILTER / SEARCH / SORT PIPELINE
     --------------------------------------------------------- */
  function getVisibleExams(now) {
    const term = state.search.trim().toLowerCase();

    let list = EXAMS.filter(exam => {
      if (!term) return true;
      const haystack = `${exam.subject} ${exam.code} ${exam.date} ${dayName(exam)}`.toLowerCase();
      return haystack.includes(term);
    });

    list = list.filter(exam => {
      if (state.filter === 'all') return true;
      const status = getCountdown(exam, now).status;
      if (state.filter === 'upcoming') return status === 'upcoming' || status === 'tomorrow';
      if (state.filter === 'today') return status === 'today';
      if (state.filter === 'completed') return status === 'completed';
      return true;
    });

    list = [...list].sort((a, b) => {
      switch (state.sort) {
        case 'subject': return a.subject.localeCompare(b.subject);
        case 'code': return a.code.localeCompare(b.code);
        case 'progress': return getProgress(b.code) - getProgress(a.code);
        default: return examDateTime(a) - examDateTime(b);
      }
    });

    return list;
  }

  /* ---------------------------------------------------------
     8. TABLE + CARD RENDER
     --------------------------------------------------------- */
  function buildMiniProgress(exam, prefix) {
    const val = getProgress(exam.code);
    return `
      <div class="mini-progress">
        <div class="mini-progress-track"><div class="mini-progress-fill" style="width:${val}%"></div></div>
        <input type="range" min="0" max="100" step="5" value="${val}"
          data-code="${exam.code}" class="progress-input" aria-label="Preparation for ${escapeHtml(exam.subject)}">
        <span class="mini-progress-val">${val}%</span>
      </div>`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Tracks which exams (and in what order) were last painted into the DOM,
  // so a per-second tick only touches text/classes instead of rebuilding
  // the whole list (which was restarting the entrance animation every
  // second and made rows look permanently "mid-fade").
  let lastVisibleKey = null;

  function countdownDisplay(exam, now) {
    const cd = getCountdown(exam, now);
    const meta = statusMeta(cd.status);
    const text = cd.status === 'completed' ? 'Completed'
      : cd.status === 'today' ? `Today · ${String(cd.hours).padStart(2,'0')}h ${String(cd.minutes).padStart(2,'0')}m`
      : `${cd.days}d ${cd.hours}h ${cd.minutes}m`;
    const cls = cd.status === 'completed' ? 'is-done' : cd.status === 'today' ? 'is-today' : '';
    return { cd, meta, text, cls };
  }

  // Lightweight per-second refresh: updates countdown text and status pill
  // in place, without touching the surrounding DOM nodes.
  function updateRowsInPlace(visible, now) {
    visible.forEach(exam => {
      const { meta, text, cls } = countdownDisplay(exam, now);
      const pillHtml = `<i class="fa-solid ${meta.icon}"></i>${meta.label}`;

      const row = document.querySelector(`#routineTableBody tr[data-code="${exam.code}"]`);
      if (row) {
        const cdCell = row.querySelector('.cell-countdown');
        cdCell.textContent = text;
        cdCell.className = `cell-countdown ${cls}`;
        const pill = row.querySelector('.status-pill');
        pill.className = `status-pill status-${meta.color}`;
        pill.innerHTML = pillHtml;
      }

      const card = document.querySelector(`#routineCards .routine-card[data-code="${exam.code}"]`);
      if (card) {
        const cdEl = card.querySelector('.rc-countdown');
        cdEl.textContent = text;
        cdEl.className = `rc-countdown ${cls}`;
        const pill = card.querySelector('.status-pill');
        pill.className = `status-pill status-${meta.color}`;
        pill.innerHTML = pillHtml;
      }
    });
  }

  function renderRoutine(now) {
    const visible = getVisibleExams(now);
    const key = visible.map(e => e.code).join(',');
    const tbody = document.getElementById('routineTableBody');
    const cardsWrap = document.getElementById('routineCards');
    const emptyState = document.getElementById('emptyState');

    if (visible.length === 0) {
      if (lastVisibleKey !== key) {
        tbody.innerHTML = '';
        cardsWrap.innerHTML = '';
        emptyState.hidden = false;
        lastVisibleKey = key;
      }
      return;
    }

    // Same set/order of exams as last paint — just refresh the numbers.
    if (key === lastVisibleKey) {
      updateRowsInPlace(visible, now);
      return;
    }
    lastVisibleKey = key;
    emptyState.hidden = true;

    tbody.innerHTML = visible.map(exam => {
      const cd = getCountdown(exam, now);
      const meta = statusMeta(cd.status);
      const cdText = cd.status === 'completed' ? 'Completed'
        : cd.status === 'today' ? `Today · ${String(cd.hours).padStart(2,'0')}h ${String(cd.minutes).padStart(2,'0')}m`
        : `${cd.days}d ${cd.hours}h ${cd.minutes}m`;
      const cdClass = cd.status === 'completed' ? 'is-done' : cd.status === 'today' ? 'is-today' : '';

      return `
        <tr data-code="${exam.code}">
          <td>
            <span class="cell-date">${formatDatePretty(exam)}</span>
            <span class="cell-day">${dayName(exam)}</span>
          </td>
          <td class="cell-time">${exam.time}</td>
          <td>
            <span class="cell-subject">${escapeHtml(exam.subject)}</span>
            <span class="cell-code">${exam.code}</span>
          </td>
          <td class="cell-countdown ${cdClass}">${cdText}</td>
          <td>${buildMiniProgress(exam)}</td>
          <td><span class="status-pill status-${meta.color}"><i class="fa-solid ${meta.icon}"></i>${meta.label}</span></td>
        </tr>`;
    }).join('');

    cardsWrap.innerHTML = visible.map(exam => {
      const cd = getCountdown(exam, now);
      const meta = statusMeta(cd.status);
      const cdText = cd.status === 'completed' ? 'Completed'
        : cd.status === 'today' ? `Today · ${String(cd.hours).padStart(2,'0')}h ${String(cd.minutes).padStart(2,'0')}m left`
        : `${cd.days}d ${cd.hours}h ${cd.minutes}m left`;
      const cdClass = cd.status === 'completed' ? 'is-done' : cd.status === 'today' ? 'is-today' : '';
      const val = getProgress(exam.code);

      return `
        <div class="routine-card" data-code="${exam.code}">
          <div class="rc-top">
            <div>
              <span class="rc-subject">${escapeHtml(exam.subject)}</span>
              <span class="rc-code">Code: ${exam.code}</span>
            </div>
            <span class="status-pill status-${meta.color}"><i class="fa-solid ${meta.icon}"></i>${meta.label}</span>
          </div>
          <div class="rc-meta">
            <span><i class="fa-regular fa-calendar"></i>${formatDatePretty(exam)}</span>
            <span><i class="fa-regular fa-clock"></i>${exam.time}</span>
            <span><i class="fa-solid fa-calendar-day"></i>${dayName(exam)}</span>
          </div>
          <div class="rc-countdown ${cdClass}">${cdText}</div>
          <div class="rc-progress">
            <input type="range" min="0" max="100" step="5" value="${val}" data-code="${exam.code}" class="progress-input" aria-label="Preparation for ${escapeHtml(exam.subject)}">
            <span class="rc-progress-val">${val}%</span>
          </div>
        </div>`;
    }).join('');

    // Wire up progress inputs (both table + cards)
    document.querySelectorAll('.progress-input').forEach(input => {
      input.addEventListener('input', (e) => {
        const container = e.target.closest('.mini-progress, .rc-progress');
        const label = container.querySelector('.mini-progress-val, .rc-progress-val');
        const fill = container.querySelector('.mini-progress-fill');
        if (label) label.textContent = `${e.target.value}%`;
        if (fill) fill.style.width = `${e.target.value}%`;
      });
      input.addEventListener('change', (e) => {
        setProgress(e.target.dataset.code, Number(e.target.value));
      });
    });
  }

  /* ---------------------------------------------------------
     9. MASTER RENDER LOOP
     --------------------------------------------------------- */
  function renderAll() {
    const now = new Date();
    updateClock();
    renderNextExam(now);
    renderStats(now);
    renderRoutine(now);
  }

  /* ---------------------------------------------------------
     10. TOASTS
     --------------------------------------------------------- */
  function showToast(message, type = 'info', icon = 'fa-solid fa-circle-info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="${icon}"></i><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('leaving');
      setTimeout(() => toast.remove(), 320);
    }, 3400);
  }

  /* ---------------------------------------------------------
     11. CONFETTI
     --------------------------------------------------------- */
  function fireConfetti() {
    const canvas = document.getElementById('confettiCanvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#2563EB', '#3B82F6', '#06B6D4', '#f59e0b', '#10b981'];
    const pieces = Array.from({ length: 140 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height * 0.4,
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 10,
      color: colors[Math.floor(Math.random() * colors.length)],
      speedY: 2 + Math.random() * 3,
      speedX: -1.5 + Math.random() * 3,
      rot: Math.random() * 360,
      rotSpeed: -6 + Math.random() * 12,
    }));

    let frame = 0;
    const maxFrames = 220;

    function tick() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach(p => {
        p.x += p.speedX;
        p.y += p.speedY;
        p.rot += p.rotSpeed;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      frame++;
      if (frame < maxFrames) {
        requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    requestAnimationFrame(tick);
  }

  /* ---------------------------------------------------------
     12. DARK MODE
     --------------------------------------------------------- */
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.getElementById('darkModeIcon').className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    persist(LS_KEYS.theme, theme);
  }

  function initTheme() {
    const saved = localStorage.getItem(LS_KEYS.theme);
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(saved || (prefersDark ? 'dark' : 'light'));
  }

  /* ---------------------------------------------------------
     13. QUOTE OF THE DAY (stable per calendar day)
     --------------------------------------------------------- */
  function renderQuote() {
    const dayIndex = Math.floor(Date.now() / 86400000);
    const quote = QUOTES[dayIndex % QUOTES.length];
    document.getElementById('quoteText').textContent = quote;
  }

  /* ---------------------------------------------------------
     14. RIPPLE EFFECT
     --------------------------------------------------------- */
  function attachRipple(btn) {
    btn.addEventListener('click', (e) => {
      const rect = btn.getBoundingClientRect();
      const ripple = document.createElement('span');
      const size = Math.max(rect.width, rect.height);
      ripple.className = 'ripple';
      ripple.style.width = ripple.style.height = `${size}px`;
      ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
      ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
      btn.appendChild(ripple);
      setTimeout(() => ripple.remove(), 650);
    });
  }

  /* ---------------------------------------------------------
     15. ROUTINE TEXT (for copy / share)
     --------------------------------------------------------- */
  function routineAsText() {
    const lines = [
      'RANGPUR POLYTECHNIC INSTITUTE',
      'Computer Science & Technology — 3rd Semester Final Exam Routine',
      '',
    ];
    EXAMS.forEach(exam => {
      lines.push(`${formatDatePretty(exam)} (${dayName(exam)}) — ${exam.time} — ${exam.subject} [${exam.code}]`);
    });
    return lines.join('\n');
  }

  /* ---------------------------------------------------------
     16. EVENT WIRING
     --------------------------------------------------------- */
  function initEvents() {
    // Search
    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('clearSearchBtn');
    searchInput.value = state.search;
    clearBtn.hidden = !state.search;

    searchInput.addEventListener('input', (e) => {
      state.search = e.target.value;
      clearBtn.hidden = !state.search;
      persist(LS_KEYS.search, state.search);
      renderAll();
    });
    clearBtn.addEventListener('click', () => {
      state.search = '';
      searchInput.value = '';
      clearBtn.hidden = true;
      persist(LS_KEYS.search, '');
      renderAll();
    });

    // Filter chips
    document.querySelectorAll('.filter-chip').forEach(chip => {
      if (chip.dataset.filter === state.filter) chip.classList.add('active');
      else chip.classList.remove('active');

      chip.addEventListener('click', () => {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.filter = chip.dataset.filter;
        persist(LS_KEYS.filter, state.filter);
        renderAll();
      });
    });

    // Sort
    const sortSelect = document.getElementById('sortSelect');
    sortSelect.value = state.sort;
    sortSelect.addEventListener('change', (e) => {
      state.sort = e.target.value;
      persist(LS_KEYS.sort, state.sort);
      renderAll();
    });

    // Reset filters (empty state button)
    document.getElementById('resetFiltersBtn').addEventListener('click', () => {
      state.search = ''; state.filter = 'all';
      searchInput.value = ''; clearBtn.hidden = true;
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.toggle('active', c.dataset.filter === 'all'));
      persist(LS_KEYS.search, ''); persist(LS_KEYS.filter, 'all');
      renderAll();
    });

    // Dark mode
    document.getElementById('darkModeBtn').addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      applyTheme(current === 'dark' ? 'light' : 'dark');
    });

    // Notification bell
    document.getElementById('notifBtn').addEventListener('click', () => {
      const now = new Date();
      const next = getNextExam(now);
      document.getElementById('notifDot').hidden = true;
      if (!next) { showToast('No upcoming exams — you are all caught up!', 'success', 'fa-solid fa-circle-check'); return; }
      const { exam, cd } = next;
      const when = cd.status === 'today' ? 'today' : cd.status === 'tomorrow' ? 'tomorrow' : `in ${cd.days} day(s)`;
      showToast(`${exam.subject} (${exam.code}) is ${when}.`, 'info', 'fa-regular fa-bell');
    });

    // Action bar
    const printBtn = document.getElementById('printBtn');
    printBtn.addEventListener('click', () => window.print());

    const pdfBtn = document.getElementById('downloadPdfBtn');
    pdfBtn.addEventListener('click', () => {
      showToast('Opening print dialog — choose "Save as PDF" as the destination.', 'info', 'fa-solid fa-file-arrow-down');
      setTimeout(() => window.print(), 400);
    });

    const copyBtn = document.getElementById('copyBtn');
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(routineAsText());
        showToast('Routine copied to clipboard.', 'success', 'fa-regular fa-copy');
      } catch {
        showToast('Could not copy automatically — please select and copy manually.', 'error', 'fa-solid fa-triangle-exclamation');
      }
    });

    const shareBtn = document.getElementById('shareBtn');
    shareBtn.addEventListener('click', async () => {
      const text = routineAsText();
      if (navigator.share) {
        try { await navigator.share({ title: 'RPI CST Exam Routine', text }); }
        catch { /* user cancelled — no-op */ }
      } else {
        try {
          await navigator.clipboard.writeText(text);
          showToast('Sharing isn\'t supported here — routine copied instead.', 'info', 'fa-solid fa-share-nodes');
        } catch {
          showToast('Sharing is not supported on this device.', 'error', 'fa-solid fa-triangle-exclamation');
        }
      }
    });

    document.querySelectorAll('.action-btn').forEach(attachRipple);

    // Scroll to top
    const scrollBtn = document.getElementById('scrollTopBtn');
    window.addEventListener('scroll', () => {
      scrollBtn.hidden = window.scrollY < 400;
    });
    scrollBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  /* ---------------------------------------------------------
     17. NOTIFICATION DOT (soon-reminder)
     --------------------------------------------------------- */
  function updateNotifDot(now) {
    const next = getNextExam(now);
    const dot = document.getElementById('notifDot');
    if (!next) { dot.hidden = true; return; }
    dot.hidden = !(next.cd.status === 'today' || next.cd.status === 'tomorrow');
  }

  /* =========================================================
     19. STUDENT CHAPTER PROGRESS SYSTEM (added feature)
     Self-contained — reuses helpers like escapeHtml/showToast
     but does not alter any existing function above.
     ========================================================= */

  const CHAPTERS = {
    '25811': [ // Social Science
      'সামাজিক বিজ্ঞানের প্রাথমিক ধারণা',
      'সমাজ এবং নাগরিকত্ব',
      'রাষ্ট্র, সরকার, আইন এবং সুশাসন',
      'জাতিসংঘ এবং বিশ্বশান্তি',
      'সামাজিকীকরণ, সামাজিক নিয়ন্ত্রণ এবং সামাজিক পরিবর্তন',
      'বাংলাদেশের সংস্কৃতি ও সভ্যতা এবং বাংলাদেশের বিভিন্ন ক্ষুদ্র নৃগোষ্ঠী',
      'অর্থনীতির মৌলিক ধারণা',
      'চাহিদা, যোগান, উপযোগ এবং জাতীয় আয়',
      'বাংলাদেশের অর্থনৈতিক ও টেকসই উন্নয়ন',
      'উপমহাদেশে ব্রিটিশ এবং ঔপনিবেশিক শাসন, বাংলাদেশের অভ্যুদয়ের পরবর্তী রাজনৈতিক ঘটনা',
    ],
    '28533': [ // IT Support Services
      'কম্পিউটারের বিবর্তন ও প্রজন্ম',
      'আধুনিক ডিজিটাল কম্পিউটারের প্রকারভেদ',
      'ডিজিটাল কম্পিউটার সিস্টেম এর মৌলিক গঠন',
      'কম্পিউটারের মেমোরি',
      'ইনপুট ডিভাইসের কার্যাবলী',
      'আউটপুট ডিভাইসের কার্যাবলী',
      'ব্যক্তিগত অতিরিক্তমূলক রমজান',
      'হার্ডওয়ারের ধারণা',
      'সফটওয়্যার এর ধারণা',
      'অ্যাপ্লিকেশন সফটওয়্যার এর প্যাকেজের বৈশিষ্ট্য',
      'ইন্টারনেট ও রিসোর্স সমূহের মৌলিক ধারণা',
      'নেটওয়ার্কিং ধারণা',
    ],
    '25931': [ // Mathematics-3
      'ত্রিভুজের ক্ষেত্রফল',
      'চতুর্ভুজ এবং সামান্তরিকের ক্ষেত্রফল',
      'রম্বস ও ট্রাপিজিয়ামের ক্ষেত্রফল',
      'সুষম বহুভুজের ক্ষেত্রফল',
      'বৃত্ত, বৃত্তকলা এবং বৃত্তাংশের ক্ষেত্রফল',
      'আয়তাকার ঘনবস্তুর ক্ষেত্রফল ও আয়তন',
      'প্রিজমের পৃষ্ঠের ক্ষেত্রফল ও আয়তন',
      'সামান্তরিক ঘনবস্তু ও সিলিন্ডারের পৃষ্ঠের ক্ষেত্রফল এবং আয়তন',
      'পিরামিডের পৃষ্ঠের ক্ষেত্রফল ও আয়তন',
      'কোণক ও গোলকের পৃষ্ঠের ক্ষেত্রফল ও আয়তন',
      'কনিক বা কনিক সেকশন',
      'প্রথম ক্রম ও প্রথম মাত্রার অন্তরক সমীকরণ',
      'প্রথম ক্রম ও প্রথম মাত্রার সমসত্ত্বিক অন্তরক সমীকরণ',
      'প্রথম ক্রম ও প্রথম মাত্রার প্রকৃত অন্তরক সমীকরণ',
      'প্রথম ক্রম ও প্রথম মাত্রার রৈখিক অন্তরক সমীকরণ',
      'লাপলাসের রূপান্তর',
    ],
    '26831': [ // Digital Electronics-1
      'ডিজিটাল ইলেকট্রনিক্সের মৌলিক ধারণা',
      'সংখ্যা পদ্ধতি ও কোডসমূহ',
      'লজিক গেইটসমূহ',
      'লজিক ফাংশনসমূহের সরলীকরণ',
      'ডিজিটাল আইসিসমূহ ও লজিক গোত্র',
      'কম্বিনেশনাল লজিক সার্কিট',
      'অ্যারিথমেটিক লজিক সার্কিটসমূহ',
      'মাল্টিপ্লেক্সার ও ডিমাল্টিপ্লেক্সার',
      'এনকোডার এবং ডিকোডার',
      'সিকুয়েন্সিয়াল লজিক সার্কিটস',
    ],
    '28531': [ // Application Development Using Python
      'পাইথন ফাংশনস',
      'পাইথন-এর ফাইল অপারেশনস',
      'মডিউল, প্যাকেজ এবং অ্যাপ্লিকেশন সফটওয়্যার',
      'অবজেক্ট ওরিয়েন্টেড প্রোগ্রামিং-এর মৌলিক ধারণা',
      'অবজেক্ট ওরিয়েন্টেড প্রোগ্রামিং-এর ফোর পিলার',
      'পাইথন ইটারেটর, জেনারেটর এবং ডেকরেটর',
      'পাইথন-এর এক্সসেপশন এবং এরর হ্যান্ডলিং',
      'পাইথন-এর লগিং',
      'ইউনিট টেস্টিং',
      'পাইথন রেগুলার এক্সপ্রেশন',
      'অ্যাপ্লিকেশন সফটওয়্যার',
    ],
    '25922': [ // Physics-2
      'থার্মোমিটি',
      'পদার্থের উপর তাপের প্রভাব',
      'তাপের প্রকৃতি ও যান্ত্রিক সমতা',
      'তাপগতি বিদ্যার দ্বিতীয় সূত্র',
      'স্থির তড়িৎ',
      'চুম্বকত্ব',
      'আলোর প্রতিফলন',
      'আলোর প্রতিসরণ',
      'ভৌতিক আলোকবিজ্ঞান',
      'আলোক তড়িৎ ক্রিয়া',
      'পরমাণুর গঠন নিউক্লিয় পদার্থবিজ্ঞান',
      'আধুনিক বিজ্ঞান',
      'আপেক্ষিক তত্ত্ব ও জ্যোতি পদার্থবিদ্যা',
    ],
  };

  const CP_LS_KEY = 'rpi_chapter_progress'; // { [code]: [bool, bool, ...] }
  const CP_EXPANDED_KEY = 'rpi_chapter_expanded'; // [code, code, ...]

  let cpState = safeParse(localStorage.getItem(CP_LS_KEY), {});
  let cpExpanded = new Set(safeParse(localStorage.getItem(CP_EXPANDED_KEY), []));
  let cpSearch = '';
  let cpFilter = 'all';

  function cpSubjectName(code) {
    const exam = EXAMS.find(e => e.code === code);
    return exam ? exam.subject : code;
  }

  function cpIsDone(code, idx) {
    return !!(cpState[code] && cpState[code][idx]);
  }

  function cpSetDone(code, idx, value) {
    if (!cpState[code]) cpState[code] = [];
    cpState[code][idx] = value;
    persist(CP_LS_KEY, cpState);
  }

  function cpSubjectStats(code) {
    const chapters = CHAPTERS[code] || [];
    const total = chapters.length;
    const completed = chapters.reduce((sum, _, idx) => sum + (cpIsDone(code, idx) ? 1 : 0), 0);
    const remaining = total - completed;
    const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
    return { total, completed, remaining, percent };
  }

  function cpOverallStats() {
    let totalChapters = 0, completedChapters = 0;
    Object.keys(CHAPTERS).forEach(code => {
      const s = cpSubjectStats(code);
      totalChapters += s.total;
      completedChapters += s.completed;
    });
    const percent = totalChapters === 0 ? 0 : Math.round((completedChapters / totalChapters) * 100);
    return {
      totalSubjects: Object.keys(CHAPTERS).length,
      totalChapters,
      completedChapters,
      remainingChapters: totalChapters - completedChapters,
      percent,
    };
  }

  function cpMotivationText(percent) {
    if (percent >= 100) return "Congratulations! All Chapters Completed.";
    if (percent >= 75) return "Almost Ready.";
    if (percent >= 50) return "Keep Going!";
    if (percent >= 25) return "Good Start!";
    return "Let's Start Your Preparation.";
  }

  const CP_RING_CIRCUMFERENCE = 2 * Math.PI * 52;

  function renderChapterSummary() {
    const s = cpOverallStats();
    document.getElementById('cpTotalSubjects').textContent = s.totalSubjects;
    document.getElementById('cpTotalChapters').textContent = s.totalChapters;
    document.getElementById('cpCompletedChapters').textContent = s.completedChapters;
    document.getElementById('cpRemainingChapters').textContent = s.remainingChapters;
    document.getElementById('cpOverallPercent').textContent = `${s.percent}%`;
    document.getElementById('cpOverallBarFill').style.width = `${s.percent}%`;
    document.getElementById('cpMotivation').textContent = cpMotivationText(s.percent);

    const arc = document.getElementById('cpOverallArc');
    arc.style.strokeDasharray = CP_RING_CIRCUMFERENCE;
    arc.style.strokeDashoffset = CP_RING_CIRCUMFERENCE * (1 - s.percent / 100);
  }

  function cpChapterMatchesFilter(code, idx) {
    const done = cpIsDone(code, idx);
    if (cpFilter === 'completed' && !done) return false;
    if (cpFilter === 'incomplete' && done) return false;
    if (cpSearch) {
      const text = (CHAPTERS[code][idx] || '').toLowerCase();
      if (!text.includes(cpSearch.toLowerCase())) return false;
    }
    return true;
  }

  function renderChapterAccordion() {
    const wrap = document.getElementById('cpAccordion');
    const emptyState = document.getElementById('cpEmptyState');
    const codes = Object.keys(CHAPTERS);

    let anyVisible = false;

    wrap.innerHTML = codes.map(code => {
      const chapters = CHAPTERS[code];
      const stats = cpSubjectStats(code);
      const visibleIdxs = chapters.map((_, idx) => idx).filter(idx => cpChapterMatchesFilter(code, idx));
      const hasVisible = visibleIdxs.length > 0;
      if (hasVisible) anyVisible = true;

      // Auto-expand a subject while the student is actively searching for a match in it.
      const expanded = cpExpanded.has(code) || (cpSearch.trim() !== '' && hasVisible);

      const itemsHtml = chapters.map((text, idx) => {
        const done = cpIsDone(code, idx);
        const matches = cpChapterMatchesFilter(code, idx);
        return `
          <label class="cp-chapter-item ${done ? 'cp-done' : ''} ${matches ? '' : 'cp-hidden'}">
            <input type="checkbox" class="cp-chapter-checkbox" data-code="${code}" data-idx="${idx}" ${done ? 'checked' : ''}>
            <span class="cp-check-icon"><i class="fa-solid fa-check"></i></span>
            <span class="cp-chapter-text">${escapeHtml(text)}</span>
          </label>`;
      }).join('');

      return `
        <div class="cp-subject ${hasVisible ? '' : 'cp-hidden'}" data-code="${code}" data-expanded="${expanded}">
          <button type="button" class="cp-subject-header" data-cp-toggle="${code}" aria-expanded="${expanded}">
            <span class="cp-chevron"><i class="fa-solid fa-chevron-right"></i></span>
            <span class="cp-subject-name">${escapeHtml(cpSubjectName(code))}</span>
            <span class="cp-subject-percent">${stats.percent}%</span>
          </button>
          <div class="cp-subject-progress-track"><div class="cp-subject-progress-fill" style="width:${stats.percent}%"></div></div>
          <div class="cp-subject-meta">${stats.completed} / ${stats.total} Chapters Completed · ${stats.remaining} Remaining</div>
          <div class="cp-chapter-list" id="cpList-${code}" ${expanded ? '' : 'hidden'}>${itemsHtml}</div>
        </div>`;
    }).join('');

    emptyState.hidden = anyVisible;

    // Wire checkboxes
    wrap.querySelectorAll('.cp-chapter-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const code = e.target.dataset.code;
        const idx = Number(e.target.dataset.idx);
        cpSetDone(code, idx, e.target.checked);
        renderChapterProgress();
      });
    });

    // Wire accordion toggles
    wrap.querySelectorAll('[data-cp-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const code = btn.dataset.cpToggle;
        if (cpExpanded.has(code)) cpExpanded.delete(code);
        else cpExpanded.add(code);
        persist(CP_EXPANDED_KEY, Array.from(cpExpanded));
        renderChapterAccordion();
      });
    });
  }

  function renderChapterProgress() {
    renderChapterSummary();
    renderChapterAccordion();
  }

  function cpExportJson() {
    const payload = { exportedAt: new Date().toISOString(), subjects: {} };
    Object.keys(CHAPTERS).forEach(code => {
      const stats = cpSubjectStats(code);
      payload.subjects[cpSubjectName(code)] = {
        code,
        percent: stats.percent,
        completed: stats.completed,
        total: stats.total,
        chapters: CHAPTERS[code].map((text, idx) => ({ chapter: text, completed: cpIsDone(code, idx) })),
      };
    });
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chapter-progress.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Chapter progress exported as JSON.', 'success', 'fa-solid fa-file-export');
  }

  function cpResetProgress() {
    const confirmed = window.confirm('Reset all chapter progress? This cannot be undone.');
    if (!confirmed) return;
    cpState = {};
    persist(CP_LS_KEY, cpState);
    renderChapterProgress();
    showToast('Chapter progress has been reset.', 'info', 'fa-solid fa-rotate-left');
  }

  function initChapterProgress() {
    renderChapterProgress();

    const searchInput = document.getElementById('cpSearchInput');
    const clearBtn = document.getElementById('cpClearSearchBtn');

    searchInput.addEventListener('input', (e) => {
      cpSearch = e.target.value;
      clearBtn.hidden = !cpSearch;
      renderChapterAccordion();
    });
    clearBtn.addEventListener('click', () => {
      cpSearch = '';
      searchInput.value = '';
      clearBtn.hidden = true;
      renderChapterAccordion();
    });

    document.querySelectorAll('#chapterProgressSection [data-cp-filter]').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#chapterProgressSection [data-cp-filter]').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        cpFilter = chip.dataset.cpFilter;
        renderChapterAccordion();
      });
    });

    document.getElementById('cpExportBtn').addEventListener('click', cpExportJson);
    document.getElementById('cpResetBtn').addEventListener('click', cpResetProgress);
  }

  /* ---------------------------------------------------------
     18. INIT
     --------------------------------------------------------- */
  function init() {
    initTheme();
    renderQuote();
    initEvents();
    renderAll();
    initChapterProgress();

    setInterval(() => {
      renderAll();
      updateNotifDot(new Date());
    }, 1000);

    // Hide loading screen once first paint is ready
    window.addEventListener('load', () => {
      setTimeout(() => {
        document.getElementById('loadingScreen').classList.add('hide');
      }, 500);
    });
    // Fallback in case 'load' already fired
    setTimeout(() => document.getElementById('loadingScreen').classList.add('hide'), 1800);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
