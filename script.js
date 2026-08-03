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
    "Every exam is a chance to prove how far you've come.",
    "Consistency beats intensity — show up for your books every single day.",
    "Hard work beats talent when talent doesn't work hard.",
    "You don't have to be great to start, but you have to start to be great.",
    "Small steps every day lead to big results every year.",
    "Believe you can and you're halfway there.",
    "The only way to do great work is to love what you study.",
    "Well begun is half done — start today's chapter now.",
    "Difficult roads often lead to beautiful destinations.",
    "One more chapter today is one less worry tomorrow.",
    "Preparation is the bridge between dreams and achievement.",
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

  // Preparation % now comes from the chapter tracker (chapters checked off
  // below) whenever chapter data exists for that subject; falls back to the
  // legacy manual value only if a subject has no chapter list defined.
  function getPrepPercent(code) {
    if (typeof CHAPTERS !== 'undefined' && CHAPTERS[code]) {
      return cpSubjectStats(code).percent;
    }
    return getProgress(code);
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

    // Preparation display, driven by the chapter tracker below
    const fill = document.getElementById('nextPrepFill');
    const val = document.getElementById('nextPrepValue');
    const prepPercent = getPrepPercent(exam.code);
    fill.style.width = `${prepPercent}%`;
    val.textContent = `${prepPercent}%`;
    const jumpBtn = document.getElementById('nextPrepJumpBtn');
    jumpBtn.onclick = () => jumpToChapter(exam.code);

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
      EXAMS.reduce((sum, e) => sum + getPrepPercent(e.code), 0) / total
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
        case 'progress': return getPrepPercent(b.code) - getPrepPercent(a.code);
        default: return examDateTime(a) - examDateTime(b);
      }
    });

    return list;
  }

  /* ---------------------------------------------------------
     8. TABLE + CARD RENDER
     --------------------------------------------------------- */
  function progressTier(val) {
    if (val >= 100) return 'done';
    if (val >= 70) return 'high';
    if (val >= 40) return 'mid';
    return 'low';
  }

  function buildMiniProgress(exam, prefix) {
    const val = getPrepPercent(exam.code);
    return `
      <button type="button" class="mini-progress" data-code="${exam.code}" title="Open ${escapeHtml(exam.subject)} in the chapter tracker">
        <div class="mini-progress-track"><div class="mini-progress-fill mini-progress-tier-${progressTier(val)}" style="width:${val}%"></div></div>
        <span class="mini-progress-val mini-progress-val-${progressTier(val)}">${val}%</span>
        <i class="fa-solid fa-arrow-up-right-from-square mini-progress-link-icon"></i>
      </button>`;
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
            <button type="button" class="cell-subject-btn" data-code="${exam.code}" title="Open ${escapeHtml(exam.subject)} in the chapter tracker">
              <span class="cell-subject">${escapeHtml(exam.subject)}</span>
              <span class="cell-code">${exam.code}</span>
            </button>
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
      const val = getPrepPercent(exam.code);

      return `
        <div class="routine-card" data-code="${exam.code}">
          <div class="rc-top">
            <button type="button" class="rc-subject-btn" data-code="${exam.code}" title="Open ${escapeHtml(exam.subject)} in the chapter tracker">
              <span class="rc-subject">${escapeHtml(exam.subject)}</span>
              <span class="rc-code">Code: ${exam.code}</span>
            </button>
            <span class="status-pill status-${meta.color}"><i class="fa-solid ${meta.icon}"></i>${meta.label}</span>
          </div>
          <div class="rc-meta">
            <span><i class="fa-regular fa-calendar"></i>${formatDatePretty(exam)}</span>
            <span><i class="fa-regular fa-clock"></i>${exam.time}</span>
            <span><i class="fa-solid fa-calendar-day"></i>${dayName(exam)}</span>
          </div>
          <div class="rc-countdown ${cdClass}">${cdText}</div>
          <button type="button" class="rc-progress" data-code="${exam.code}" title="Open ${escapeHtml(exam.subject)} in the chapter tracker">
            <div class="rc-progress-head">
              <span class="rc-progress-label"><i class="fa-solid fa-chart-line"></i> Preparation</span>
              <span class="rc-progress-val rc-progress-val-${progressTier(val)}">${val}%</span>
            </div>
            <div class="rc-progress-track"><div class="rc-progress-fill rc-progress-tier-${progressTier(val)}" style="width:${val}%"></div></div>
            <span class="rc-progress-hint">Tap to open chapter tracker <i class="fa-solid fa-arrow-up-right-from-square"></i></span>
          </button>
        </div>`;
    }).join('');

    // Clicking a preparation bar or subject name (table or card) jumps to
    // that subject's chapters in the tracker below and expands it.
    document.querySelectorAll('.mini-progress, .rc-progress, .cell-subject-btn, .rc-subject-btn').forEach(btn => {
      btn.addEventListener('click', () => jumpToChapter(btn.dataset.code));
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
    renderWelcomeGreeting();
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
  function renderQuote(isFirstRun) {
    const el = document.getElementById('quoteText');
    const pick = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    if (isFirstRun) {
      el.textContent = pick;
      return;
    }
    el.classList.add('quote-fade-out');
    setTimeout(() => {
      el.textContent = pick;
      el.classList.remove('quote-fade-out');
    }, 280);
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

  const CP_LS_KEY = 'rpi_chapter_progress';       // { [code]: [{status, starred, completedAt}, ...] }
  const CP_OPEN_KEY = 'rpi_chapter_open_subject';  // single code string, or null — "remember last opened subject"
  const CP_ACTIVITY_KEY = 'rpi_chapter_activity_dates'; // ['YYYY-MM-DD', ...] — for streak/pace
  const CP_REMIND_KEY = 'rpi_exam_remind_fired';   // { [code]: 'YYYY-MM-DD' }
  const CP_TIP_KEY = 'rpi_study_tip_fired';        // 'YYYY-MM-DD'

  const CP_STATUS_ORDER = ['incomplete', 'reading', 'completed'];
  const CP_DIFFICULTIES = ['Easy', 'Medium', 'Hard'];
  const CP_TIME_OPTIONS = [20, 30, 45, 60];

  let cpState = safeParse(localStorage.getItem(CP_LS_KEY), {});
  let cpOpenCode = safeParse(localStorage.getItem(CP_OPEN_KEY), null);
  let examRemindFired = safeParse(localStorage.getItem(CP_REMIND_KEY), {});
  let cpSearch = '';
  let cpFilter = 'all';

  // Migrate any older boolean-array progress data into the richer
  // { status, starred, completedAt } shape used below.
  (function migrateChapterState() {
    let touched = false;
    Object.keys(cpState).forEach(code => {
      const arr = cpState[code] || [];
      cpState[code] = arr.map(item => {
        if (item && typeof item === 'object') return item;
        touched = true;
        return { status: item ? 'completed' : 'incomplete', starred: false, completedAt: item ? new Date().toISOString() : null };
      });
    });
    if (touched) persist(CP_LS_KEY, cpState);
  })();

  function cpSubjectName(code) {
    const exam = EXAMS.find(e => e.code === code);
    return exam ? exam.subject : code;
  }

  function cpGetChapter(code, idx) {
    if (!cpState[code]) cpState[code] = [];
    if (!cpState[code][idx]) cpState[code][idx] = { status: 'incomplete', starred: false, completedAt: null };
    return cpState[code][idx];
  }

  function cpIsDone(code, idx) {
    return cpGetChapter(code, idx).status === 'completed';
  }

  function cpDifficulty(code, idx) {
    return CP_DIFFICULTIES[(idx + code.length) % CP_DIFFICULTIES.length];
  }
  function cpEstMinutes(code, idx) {
    return CP_TIME_OPTIONS[(idx * 2 + code.length) % CP_TIME_OPTIONS.length];
  }

  function cpRecordActivityToday() {
    const dates = new Set(safeParse(localStorage.getItem(CP_ACTIVITY_KEY), []));
    dates.add(new Date().toISOString().slice(0, 10));
    persist(CP_ACTIVITY_KEY, Array.from(dates));
  }

  function cpSetStatus(code, idx, status) {
    const ch = cpGetChapter(code, idx);
    ch.status = status;
    ch.completedAt = status === 'completed' ? new Date().toISOString() : null;
    persist(CP_LS_KEY, cpState);
  }

  function cpToggleStar(code, idx) {
    const ch = cpGetChapter(code, idx);
    ch.starred = !ch.starred;
    persist(CP_LS_KEY, cpState);
  }

  function cpStatusMeta(status) {
    switch (status) {
      case 'completed': return { icon: 'fa-check', cls: 'cp-status-completed', label: 'Completed' };
      case 'reading':   return { icon: 'fa-book-open', cls: 'cp-status-reading', label: 'Reading' };
      default:          return { icon: 'fa-circle', cls: 'cp-status-incomplete', label: 'Incomplete' };
    }
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

  /* ---- Dashboard insights: streak, pace, ETA, weakest/strongest, today's goal ---- */

  function cpStudyStreak() {
    const dates = new Set(safeParse(localStorage.getItem(CP_ACTIVITY_KEY), []));
    let streak = 0;
    const cursor = new Date();
    const todayStr = cursor.toISOString().slice(0, 10);
    if (!dates.has(todayStr)) cursor.setDate(cursor.getDate() - 1);
    while (dates.has(cursor.toISOString().slice(0, 10))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  function cpAvgPaceAndEta() {
    const activeDays = safeParse(localStorage.getItem(CP_ACTIVITY_KEY), []).length;
    const overall = cpOverallStats();
    if (overall.remainingChapters === 0 && overall.totalChapters > 0) return { pace: 0, eta: 'Done' };
    if (activeDays === 0 || overall.completedChapters === 0) return { pace: 0, eta: null };
    const pace = overall.completedChapters / activeDays;
    if (pace <= 0) return { pace: 0, eta: null };
    const daysNeeded = Math.ceil(overall.remainingChapters / pace);
    const eta = new Date();
    eta.setDate(eta.getDate() + daysNeeded);
    return { pace, eta: eta.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) };
  }

  function cpWeakStrongSubjects() {
    const withData = Object.keys(CHAPTERS)
      .map(code => ({ code, name: cpSubjectName(code), ...cpSubjectStats(code) }))
      .filter(s => s.total > 0);
    if (!withData.length) return { weak: null, strong: null };
    const sorted = [...withData].sort((a, b) => a.percent - b.percent);
    return { weak: sorted[0], strong: sorted[sorted.length - 1] };
  }

  function cpTodaysGoal(now) {
    const next = getNextExam(now);
    if (!next) return 'All exams completed — great work!';
    const code = next.exam.code;
    const chapters = CHAPTERS[code] || [];
    const idx = chapters.findIndex((_, i) => !cpIsDone(code, i));
    if (idx === -1) return `${next.exam.subject}: all chapters done — time to revise!`;
    return `${next.exam.subject}: study "${chapters[idx]}"`;
  }

  function renderChapterInsights() {
    const el = document.getElementById('cpInsights');
    if (!el) return;
    const { weak, strong } = cpWeakStrongSubjects();
    const { pace, eta } = cpAvgPaceAndEta();
    const streak = cpStudyStreak();
    const goal = cpTodaysGoal(new Date());

    el.innerHTML = `
      <div class="cp-insight"><i class="fa-solid fa-bullseye"></i><div><span>Today's Goal</span><small>${escapeHtml(goal)}</small></div></div>
      <div class="cp-insight"><i class="fa-solid fa-arrow-trend-down"></i><div><span>Weakest Subject</span><small>${weak ? `${escapeHtml(weak.name)} (${weak.percent}%)` : '—'}</small></div></div>
      <div class="cp-insight"><i class="fa-solid fa-arrow-trend-up"></i><div><span>Strongest Subject</span><small>${strong ? `${escapeHtml(strong.name)} (${strong.percent}%)` : '—'}</small></div></div>
      <div class="cp-insight"><i class="fa-solid fa-fire"></i><div><span>Study Streak</span><small>${streak} day${streak === 1 ? '' : 's'}</small></div></div>
      <div class="cp-insight"><i class="fa-solid fa-gauge-high"></i><div><span>Avg. Pace</span><small>${pace ? pace.toFixed(1) + ' ch/day' : '—'}</small></div></div>
      <div class="cp-insight"><i class="fa-regular fa-calendar-check"></i><div><span>Est. Completion</span><small>${eta || '—'}</small></div></div>
    `;
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

    renderChapterInsights();
  }

  function cpChapterMatchesFilter(code, idx) {
    const status = cpGetChapter(code, idx).status;
    if (cpFilter === 'completed' && status !== 'completed') return false;
    if (cpFilter === 'incomplete' && status === 'completed') return false;
    if (cpSearch) {
      const text = (CHAPTERS[code][idx] || '').toLowerCase();
      if (!text.includes(cpSearch.toLowerCase())) return false;
    }
    return true;
  }

  /* ---- Smart notifications: milestone + reminder + tip ---- */

  function cpCheckMilestones(subjectName, prevPercent, newPercent) {
    const thresholds = [25, 50, 70, 90, 100];
    const crossed = thresholds.filter(t => prevPercent < t && newPercent >= t);
    if (!crossed.length) return;
    const top = crossed[crossed.length - 1];
    if (top === 100) {
      showToast(`🎉 ${subjectName} fully completed! All chapters done.`, 'success', 'fa-solid fa-trophy');
    } else {
      showToast(`🔥 Awesome! ${subjectName} preparation reached ${top}%.`, 'success', 'fa-solid fa-fire');
    }
  }

  function maybeStudyTipToast() {
    const todayStr = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(CP_TIP_KEY) === todayStr) return;
    localStorage.setItem(CP_TIP_KEY, todayStr);
    setTimeout(() => {
      showToast("📚 Study Tip: Revise today's completed chapter before sleeping.", 'info', 'fa-solid fa-book');
    }, 4000);
  }

  function maybeExamReminder(now) {
    const next = getNextExam(now);
    if (!next || next.cd.status === 'completed') return;
    if (next.cd.days > 5) return;
    const todayStr = now.toISOString().slice(0, 10);
    if (examRemindFired[next.exam.code] === todayStr) return;
    examRemindFired[next.exam.code] = todayStr;
    persist(CP_REMIND_KEY, examRemindFired);
    showToast(`⏰ Reminder: ${next.exam.subject} exam is only ${next.cd.days} day(s) away.`, 'info', 'fa-regular fa-clock');
  }

  function cpCycleStatus(code, idx) {
    const subjectName = cpSubjectName(code);
    const prevPercent = cpSubjectStats(code).percent;
    const current = cpGetChapter(code, idx).status;
    const next = CP_STATUS_ORDER[(CP_STATUS_ORDER.indexOf(current) + 1) % CP_STATUS_ORDER.length];
    cpSetStatus(code, idx, next);
    const newPercent = cpSubjectStats(code).percent;

    if (next === 'completed') {
      cpRecordActivityToday();
      showToast(`🎉 Great job! You completed "${CHAPTERS[code][idx]}".`, 'success', 'fa-solid fa-circle-check');
      maybeStudyTipToast();
    }
    cpCheckMilestones(subjectName, prevPercent, newPercent);
    renderChapterProgress();
  }

  /* ---- Accordion (single-open, remembers last opened subject) ---- */

  function renderChapterAccordion() {
    const wrap = document.getElementById('cpAccordion');
    const emptyState = document.getElementById('cpEmptyState');
    const codes = Object.keys(CHAPTERS);
    const now = new Date();

    let anyVisible = false;

    wrap.innerHTML = codes.map(code => {
      const chapters = CHAPTERS[code];
      const stats = cpSubjectStats(code);
      const exam = EXAMS.find(e => e.code === code);
      const examCd = exam ? getCountdown(exam, now) : null;
      const visibleIdxs = chapters.map((_, idx) => idx).filter(idx => cpChapterMatchesFilter(code, idx));
      const hasVisible = visibleIdxs.length > 0;
      if (hasVisible) anyVisible = true;

      // Auto-expand a subject while the student is actively searching for a match in it.
      const expanded = code === cpOpenCode || (cpSearch.trim() !== '' && hasVisible);

      const itemsHtml = chapters.map((text, idx) => {
        const chState = cpGetChapter(code, idx);
        const meta = cpStatusMeta(chState.status);
        const matches = cpChapterMatchesFilter(code, idx);
        const difficulty = cpDifficulty(code, idx);
        const estMin = cpEstMinutes(code, idx);
        const dateBadge = chState.completedAt
          ? `<span class="cp-badge cp-date"><i class="fa-regular fa-calendar-check"></i> ${new Date(chState.completedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>`
          : '';
        return `
          <div class="cp-chapter-item ${meta.cls} ${matches ? '' : 'cp-hidden'}">
            <button type="button" class="cp-status-btn" data-code="${code}" data-idx="${idx}" title="Status: ${meta.label} (click to change)" aria-label="Chapter status: ${meta.label}">
              <i class="fa-solid ${meta.icon}"></i>
            </button>
            <div class="cp-chapter-main">
              <span class="cp-chapter-text">${escapeHtml(text)}</span>
              <div class="cp-chapter-meta">
                <span class="cp-badge cp-diff-${difficulty.toLowerCase()}">${difficulty}</span>
                <span class="cp-badge cp-time"><i class="fa-regular fa-clock"></i> ${estMin}m</span>
                ${dateBadge}
              </div>
            </div>
            <button type="button" class="cp-star-btn ${chState.starred ? 'active' : ''}" data-code="${code}" data-idx="${idx}" title="${chState.starred ? 'Unmark important' : 'Mark important'}" aria-label="Toggle important">
              <i class="fa-${chState.starred ? 'solid' : 'regular'} fa-star"></i>
            </button>
          </div>`;
      }).join('');

      const examMetaText = exam
        ? ` · Exam: ${formatDatePretty(exam)} (${examCd.status === 'completed' ? 'Completed' : examCd.days + 'd left'})`
        : '';

      return `
        <div class="cp-subject ${hasVisible ? '' : 'cp-hidden'}" data-code="${code}">
          <div class="cp-subject-header-row">
            <button type="button" class="cp-subject-toggle" data-cp-toggle="${code}" aria-expanded="${expanded}">
              <span class="cp-chevron"><i class="fa-solid fa-chevron-right"></i></span>
              <span class="cp-mini-ring" style="--pct:${stats.percent}"><span>${stats.percent}%</span></span>
              <span class="cp-subject-name">${escapeHtml(cpSubjectName(code))}</span>
            </button>
          </div>
          <div class="cp-subject-progress-track"><div class="cp-subject-progress-fill" style="width:${stats.percent}%"></div></div>
          <div class="cp-subject-meta">${stats.completed} / ${stats.total} Chapters Completed · ${stats.remaining} Remaining${examMetaText}</div>
          <div class="cp-chapter-list-wrap ${expanded ? 'cp-expanded' : ''}">
            <div class="cp-chapter-list-inner">
              <div class="cp-chapter-list" id="cpList-${code}">${itemsHtml}</div>
            </div>
          </div>
        </div>`;
    }).join('');

    emptyState.hidden = anyVisible;

    // Chapter status cycle (incomplete → reading → completed → …)
    wrap.querySelectorAll('.cp-status-btn').forEach(btn => {
      btn.addEventListener('click', () => cpCycleStatus(btn.dataset.code, Number(btn.dataset.idx)));
    });

    // Important/star toggle (doesn't affect progress %, so just re-paint the accordion)
    wrap.querySelectorAll('.cp-star-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        cpToggleStar(btn.dataset.code, Number(btn.dataset.idx));
        renderChapterAccordion();
      });
    });

    // Accordion toggle — single subject open at a time, remembered across visits
    wrap.querySelectorAll('[data-cp-toggle]').forEach(btn => {
      const code = btn.dataset.cpToggle;
      btn.addEventListener('click', () => {
        cpOpenCode = (cpOpenCode === code) ? null : code;
        persist(CP_OPEN_KEY, cpOpenCode);
        renderChapterAccordion();
      });
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' && cpOpenCode !== code) {
          e.preventDefault();
          cpOpenCode = code;
          persist(CP_OPEN_KEY, cpOpenCode);
          renderChapterAccordion();
        } else if (e.key === 'ArrowUp' && cpOpenCode === code) {
          e.preventDefault();
          cpOpenCode = null;
          persist(CP_OPEN_KEY, cpOpenCode);
          renderChapterAccordion();
        }
      });
    });
  }

  function renderChapterProgress() {
    renderChapterSummary();
    renderChapterAccordion();
    // Preparation % in the routine table/cards and hero card is derived
    // from chapter completion, so force those to repaint with fresh numbers.
    lastVisibleKey = null;
    renderAll();
  }

  // Bridges a click on a routine-table subject/progress cell to the
  // matching subject in the tracker below: opens it and scrolls to it.
  function jumpToChapter(code) {
    cpOpenCode = code;
    persist(CP_OPEN_KEY, cpOpenCode);
    renderChapterAccordion();
    const el = document.querySelector(`.cp-subject[data-code="${code}"]`);
    if (el) {
      if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('cp-jump-flash');
      setTimeout(() => el.classList.remove('cp-jump-flash'), 1400);
    }
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

    document.getElementById('cpResetBtn').addEventListener('click', cpResetProgress);
  }

  /* =========================================================
     20. FIRST-TIME ONBOARDING + PROFILE SYSTEM (added feature)
     ========================================================= */

  const PROFILE_KEY = 'rpi_profile'; // { name, roll, onboarded }
  const WELCOME_MESSAGES = [
    "Consistency beats intensity. Let's study today!",
    "Small progress every day leads to big success.",
    "Every completed chapter brings you closer to your dream.",
    "Stay focused. Your future self will thank you.",
    "One chapter at a time. You've got this!",
    "Today's effort is tomorrow's achievement.",
  ];

  let onboardingMode = 'onboarding'; // 'onboarding' | 'edit'

  function getProfile() {
    return safeParse(localStorage.getItem(PROFILE_KEY), null);
  }
  function saveProfile(profile) {
    persist(PROFILE_KEY, profile);
  }

  function greetingParts(now) {
    const hour = now.getHours();
    if (hour >= 5 && hour < 12) return { period: 'Morning', emoji: '🌅' };
    if (hour >= 12 && hour < 17) return { period: 'Afternoon', emoji: '☀️' };
    if (hour >= 17 && hour < 20) return { period: 'Evening', emoji: '🌇' };
    return { period: 'Night', emoji: '🌙' };
  }

  // Runs every tick — cheap textContent updates only (greeting, chapter count).
  function renderWelcomeGreeting() {
    const greetingEl = document.getElementById('welcomeGreeting');
    if (!greetingEl) return;
    const profile = getProfile();
    const displayName = (profile && profile.name) ? profile.name : 'Student';
    const hasRealName = !!(profile && profile.name && profile.name !== 'Student');
    const { period, emoji } = greetingParts(new Date());

    greetingEl.textContent = `${emoji} Good ${period}, ${displayName}`;
    document.getElementById('welcomeSub').textContent = hasRealName
      ? "Welcome back! Let's make today productive and move one step closer to your goal."
      : 'Ready to continue your preparation today?';

    const chapterCountEl = document.getElementById('welcomeChapterCount');
    if (chapterCountEl && typeof cpOverallStats === 'function') {
      chapterCountEl.textContent = cpOverallStats().completedChapters;
    }

    const menuNameEl = document.getElementById('profileMenuName');
    if (menuNameEl) menuNameEl.textContent = displayName;
  }

  // Runs once per page load — a random pick, not on every tick.
  function renderWelcomeMotivation() {
    const el = document.getElementById('welcomeMotivation');
    if (el) el.textContent = WELCOME_MESSAGES[Math.floor(Math.random() * WELCOME_MESSAGES.length)];
  }

  function showOnboarding(mode) {
    onboardingMode = mode;
    const overlay = document.getElementById('onboardingOverlay');
    const title = document.getElementById('onboardingTitle');
    const sub = document.getElementById('onboardingSub');
    const continueBtn = document.getElementById('onboardingContinueBtn');
    const skipBtn = document.getElementById('onboardingSkipBtn');
    const nameInput = document.getElementById('onboardingNameInput');
    const rollInput = document.getElementById('onboardingRollInput');

    const profile = getProfile();

    if (mode === 'edit') {
      title.textContent = 'Edit Your Profile';
      sub.textContent = 'Update your name or roll number anytime.';
      continueBtn.textContent = 'Save';
      skipBtn.textContent = 'Cancel';
      nameInput.value = (profile && profile.name && profile.name !== 'Student') ? profile.name : '';
      rollInput.value = (profile && profile.roll) ? profile.roll : '';
    } else {
      title.textContent = 'Welcome, Future Topper!';
      sub.textContent = "Let's personalize your experience.";
      continueBtn.textContent = 'Continue';
      skipBtn.textContent = 'Skip for now';
      nameInput.value = '';
      rollInput.value = '';
    }

    overlay.hidden = false;
    setTimeout(() => nameInput.focus(), 50);
  }

  function hideOnboarding() {
    document.getElementById('onboardingOverlay').hidden = true;
  }

  function commitOnboarding() {
    const nameVal = document.getElementById('onboardingNameInput').value.trim() || 'Student';
    const rollVal = document.getElementById('onboardingRollInput').value.trim();
    saveProfile({ name: nameVal, roll: rollVal, onboarded: true });
    hideOnboarding();
    renderWelcomeGreeting();
    showToast(onboardingMode === 'edit' ? 'Profile updated.' : `Welcome, ${nameVal}! 👋`, 'success', onboardingMode === 'edit' ? 'fa-solid fa-user-check' : 'fa-solid fa-hand-sparkles');
  }

  function skipOrCancelOnboarding() {
    if (onboardingMode === 'onboarding') {
      saveProfile({ name: 'Student', roll: '', onboarded: true });
      renderWelcomeGreeting();
    }
    hideOnboarding();
  }

  function initProfileSystem() {
    const profile = getProfile();
    if (!profile || !profile.onboarded) {
      showOnboarding('onboarding');
    }
    renderWelcomeGreeting();
    renderWelcomeMotivation();

    document.getElementById('onboardingContinueBtn').addEventListener('click', commitOnboarding);
    document.getElementById('onboardingSkipBtn').addEventListener('click', skipOrCancelOnboarding);
    document.getElementById('onboardingNameInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commitOnboarding();
    });
    document.getElementById('onboardingRollInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commitOnboarding();
    });
    document.getElementById('onboardingRollInput').addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
    });

    // Profile menu open/close
    const profileBtn = document.getElementById('profileBtn');
    const profileMenu = document.getElementById('profileMenu');
    profileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = profileMenu.hidden;
      profileMenu.hidden = !willOpen;
      profileBtn.setAttribute('aria-expanded', String(willOpen));
    });
    document.addEventListener('click', (e) => {
      if (!profileMenu.hidden && !e.target.closest('.profile-menu-wrap')) {
        profileMenu.hidden = true;
        profileBtn.setAttribute('aria-expanded', 'false');
      }
    });

    document.querySelectorAll('[data-profile-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        profileMenu.hidden = true;
        profileBtn.setAttribute('aria-expanded', 'false');
        const action = btn.dataset.profileAction;

        if (action === 'edit-name' || action === 'edit-roll') {
          showOnboarding('edit');
          if (action === 'edit-roll') setTimeout(() => document.getElementById('onboardingRollInput').focus(), 60);
        } else if (action === 'reset') {
          if (!window.confirm('Reset your profile (name & roll number)? You will be asked to enter them again.')) return;
          localStorage.removeItem(PROFILE_KEY);
          renderWelcomeGreeting();
          showOnboarding('onboarding');
        } else if (action === 'logout') {
          if (!window.confirm('Logout will clear all saved data on this device (profile, chapter progress, preferences). Continue?')) return;
          localStorage.clear();
          window.location.reload();
        }
      });
    });
  }

  /* ---------------------------------------------------------
     18. INIT
     --------------------------------------------------------- */
  function init() {
    initTheme();
    renderQuote(true);
    initEvents();
    renderAll();
    initChapterProgress();
    initProfileSystem();

    setInterval(() => {
      renderAll();
      updateNotifDot(new Date());
      maybeExamReminder(new Date());
    }, 1000);

    setInterval(() => renderQuote(false), 13000);

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
