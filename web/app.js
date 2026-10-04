/* ==========================================================================
   TERRAVA AIRWAYS - MAIN APPLICATION LOGIC (AUTO-NAV & ROLE-BASED ROUTING)
   ========================================================================== */

const STORAGE_BOOKINGS = "terrava_bookings";
const STORAGE_WAITLIST = "terrava_waitlist";
const STORAGE_LAST_CANCELLED = "terrava_last_cancelled";
const STORAGE_USERS = "terrava_registered_users";
const STORAGE_FLIGHT_STATUSES = "terrava_flight_statuses";
const STORAGE_FLIGHTS = "terrava_flights";

// Helper function to format date string into Month-First format
function formatDateMonthFirst(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  
  const year = parts[0];
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  
  const monthName = monthNames[monthIdx] || parts[1];
  return `${monthName} ${day}, ${year}`;
}

// Flight Database
const FLIGHT_DATABASE = [
  { 
    flightId: "TRV-101", 
    origin: "MNL", 
    originName: "Manila (Ninoy Aquino International Airport)",
    destination: "CEB", 
    destinationName: "Cebu (Mactan-Cebu International Airport)",
    departureDate: "2026-10-15",
    departure: "08:00 AM", 
    duration: "1h 25m",
    aircraft: "Airbus A320",
    baseFare: 1899, 
    capacity: 48, // Updated from 5 to match aircraft layout
    occupied: 48 
  },
  { 
    flightId: "TRV-102", 
    origin: "MNL", 
    originName: "Manila (Ninoy Aquino International Airport)",
    destination: "DVO", 
    destinationName: "Davao (Francisco Bangoy International Airport)",
    departureDate: "2026-10-15",
    departure: "10:30 AM", 
    duration: "1h 50m",
    aircraft: "Airbus A321neo",
    baseFare: 2450, 
    capacity: 48, 
    occupied: 8 
  },
  { 
    flightId: "TRV-103",  
    origin: "CEB", 
    originName: "Cebu (Mactan-Cebu International Airport)",
    destination: "MPH", 
    destinationName: "Caticlan / Boracay (Godofredo P. Ramos Airport)",
    departureDate: "2026-10-16",
    departure: "01:15 PM", 
    duration: "1h 00m",
    aircraft: "ATR 72-600",
    baseFare: 1650, 
    capacity: 48, 
    occupied: 30 
  },
  { 
    flightId: "TRV-104", 
    origin: "MNL", 
    originName: "Manila (Ninoy Aquino International Airport)",
    destination: "DVO", 
    destinationName: "Davao (Francisco Bangoy International Airport)",
    departureDate: "2026-10-16",
    departure: "04:45 PM", 
    duration: "1h 50m",
    aircraft: "Boeing 737-800",
    baseFare: 2100, 
    capacity: 48, 
    occupied: 46 
  }
];

// Active User Helper
function getCurrentUser() {
  return JSON.parse(localStorage.getItem("terrava_user") || "null");
}

// Unique Guest Session Helper (Persists in localStorage per browser profile)
function getGuestId() {
  let guestId = localStorage.getItem("terrava_guest_id");
  if (!guestId) {
    guestId = "guest_" + Math.random().toString(36).substring(2, 9);
    localStorage.setItem("terrava_guest_id", guestId);
  }
  return guestId;
}

// Dynamic Seat Calculation Helper
function getSeatsLeft(flight) {
  if (!flight) return 0;

  const bookings = JSON.parse(localStorage.getItem(STORAGE_BOOKINGS) || "[]");
  
  const additionalBookedPassengers = bookings
    .filter(b => b.flightId === flight.flightId && b.status !== "CANCELLED")
    .reduce((total, b) => total + (b.passengers ? b.passengers.length : 1), 0);

  const totalOccupied = flight.occupied + additionalBookedPassengers;
  return Math.max(0, flight.capacity - totalOccupied);
}

// Wizard State Tracking
let bookingWizardState = {
  selectedFlight: null,
  contact: "",
  passengers: [],
  currentStep: 1,
  highestStepReached: 1,
  activePaxIndexForSeat: 0,
  totalCalculatedFare: 0
};

// Seed Default Accounts on Startup
function initDefaultUsers() {
  const existingUsers = JSON.parse(localStorage.getItem(STORAGE_USERS) || "[]");

  const defaultAccounts = [
    { username: "passenger", password: "passenger123", role: "passenger" },
    { username: "admin", password: "admin123", role: "admin" }
  ];

  let updated = false;
  defaultAccounts.forEach(account => {
    if (!existingUsers.some(u => u.username === account.username)) {
      existingUsers.push(account);
      updated = true;
    }
  });

  if (updated) {
    localStorage.setItem(STORAGE_USERS, JSON.stringify(existingUsers));
  }
}

function initFlightData() {
  let flights = JSON.parse(localStorage.getItem(STORAGE_FLIGHTS) || "[]");

  // If local storage is empty, grab default flights from FLIGHT_DATABASE
  if (flights.length === 0 && typeof FLIGHT_DATABASE !== "undefined") {
    flights = FLIGHT_DATABASE;
  }

  // Update capacity to 48 for all flights
  flights = flights.map(f => ({
    ...f,
    capacity: 48,
    totalSeats: 48
  }));

  localStorage.setItem(STORAGE_FLIGHTS, JSON.stringify(flights));
}

// --- CENTRALIZED TAB SWITCH ENGINE ---
function switchTab(targetTab) {
  const tabs = document.querySelectorAll(".tabs .tab, .tab");
  const panels = document.querySelectorAll(".panel");

  tabs.forEach(t => {
    if (t.getAttribute("data-tab") === targetTab) {
      t.classList.add("is-active");
    } else {
      t.classList.remove("is-active");
    }
  });

  panels.forEach(p => {
    if (p.id === `panel-${targetTab}`) {
      p.classList.add("is-active");
    } else {
      p.classList.remove("is-active");
    }
  });

  if (targetTab === "flights") renderBrowseFlights();
  if (targetTab === "standby") {
    populateWaitlistDropdown();
    renderWaitlistTable();
  }
  if (targetTab === "manage") renderRecentBookings();
  if (targetTab === "admin") renderAdminDashboard();
}

// --- CENTRAL UI REFRESH ENGINE ---
function refreshAllUI() {
  const currentUser = getCurrentUser();
  const isAdmin = currentUser && (currentUser.role === "admin" || currentUser.username === "admin");

  updateNavigationForRole(currentUser);
  updateAuthUI();

  // Guard: If a non-admin is currently viewing the admin panel, kick them back to 'book' view
  const activePanel = document.querySelector(".panel.is-active");
  if (!isAdmin && activePanel && activePanel.id === "panel-admin") {
    switchTab("book");
  }

  renderBrowseFlights();
  renderWizardFlights();
  renderRecentBookings();
  renderWaitlistTable();

  if (isAdmin) {
    renderAdminDashboard();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initClock();
  initTabs();
  initBrowseFlights();
  initBookingWizard();
  initManageBooking();
  initWaitlist();
  initModalListeners();
  initDefaultUsers();

  initFlightData();

  document.getElementById("adminAddBookingForm")?.addEventListener("submit", handleAdminAddBookingSubmit);

  // Initial render & initial role-based routing check
  refreshAllUI();
  const initialUser = getCurrentUser();
  if (initialUser && (initialUser.role === "admin" || initialUser.username === "admin")) {
    switchTab("admin");
  } else {
    const activePanel = document.querySelector(".panel.is-active");
    if (!activePanel) switchTab("book");
  }

  // 1. Live Background Polling
  setInterval(() => {
    refreshAllUI();
  }, 5000);

  // 2. Multi-Tab Storage Event Sync
  window.addEventListener("storage", () => {
    refreshAllUI();
  });
});

// --- 1. CLOCK & THEME ---
function initClock() {
  const clockEl = document.getElementById("clock");
  if (!clockEl) return;
  const update = () => {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString();
  };
  update();
  setInterval(update, 1000);
}

// Toggle between light and dark modes
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
  const newTheme = currentTheme === "dark" ? "light" : "dark";

  // Apply new theme and save preference
  document.documentElement.setAttribute("data-theme", newTheme);
  localStorage.setItem("terrava-theme", newTheme);

  // Update button icon
  updateThemeIcon(newTheme);
}

// Update the theme toggle button icon
function updateThemeIcon(theme) {
  const btn = document.getElementById("themeToggle");
  if (!btn) return;
  
  // Show Sun ☀️ in Dark Mode (to switch to light), Moon 🌙 in Light Mode (to switch to dark)
  btn.textContent = theme === "dark" ? "☀️" : "🌙";
}

// Sync button icon on initial page load
document.addEventListener("DOMContentLoaded", () => {
  const activeTheme = document.documentElement.getAttribute("data-theme") || "light";
  updateThemeIcon(activeTheme);
});

// --- 2. AUTHENTICATION & PRIVACY RESET LOGIC ---
function clearSessionUI() {
  resetWizardState();

  const pnrInput = document.getElementById("pnrInput");
  if (pnrInput) pnrInput.value = "";

  const bookingDetail = document.getElementById("bookingDetail");
  if (bookingDetail) bookingDetail.innerHTML = "";

  const bookingResult = document.getElementById("bookingResult");
  if (bookingResult) bookingResult.innerHTML = "";

  const confirmationCard = document.getElementById("confirmationCard");
  if (confirmationCard) confirmationCard.innerHTML = "";

  const step2Error = document.getElementById("step2Error");
  if (step2Error) step2Error.textContent = "";

  const step3Error = document.getElementById("step3Error");
  if (step3Error) step3Error.textContent = "";
}

function updateAuthUI() {
  const authNav = document.getElementById("authNav");
  const savedUser = getCurrentUser();

  if (authNav) {
    if (savedUser && savedUser.username) {
      const roleBadge = savedUser.role === 'admin' || savedUser.username === 'admin'
        ? `<span style="background:#dc3545; color:white; font-size:0.7rem; padding:2px 6px; border-radius:4px; margin-right:6px;">ADMIN</span>` 
        : `<span style="background:var(--accent); color:white; font-size:0.7rem; padding:2px 6px; border-radius:4px; margin-right:6px;">PASSENGER</span>`;

      authNav.innerHTML = `
        ${roleBadge}
        <span style="color: #ffffff; font-weight: 600; font-size: 0.9rem; margin-right: 8px;">👤 ${savedUser.username}</span>
        <button type="button" class="btn btn--ghost" onclick="handleLogout()">Logout</button>
      `;
    } else {
      authNav.innerHTML = `
        <button type="button" class="btn btn--accent" onclick="openLoginModal()">Login</button>
      `;
    }
  }
}

function handleLogout() {
  localStorage.removeItem("terrava_user");
  clearSessionUI();
  refreshAllUI();
  switchTab("book"); // Immediately switch back to default client view ("Book a flight")
}

// --- 3. NAVIGATION TABS ---
function initTabs() {
  const tabs = document.querySelectorAll(".tabs .tab, .tab");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const targetTab = tab.getAttribute("data-tab");
      if (targetTab) switchTab(targetTab);
    });
  });
}

// --- 4. BROWSE FLIGHTS & FLIGHT DETAILS MODAL ---
function initBrowseFlights() {
  const form = document.getElementById("flightFilterForm");
  const clearBtn = document.getElementById("clearFilter");
  const sortBtn = document.getElementById("sortBtn");

  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const orig = document.getElementById("filterOrigin")?.value.trim().toUpperCase() || "";
      const dest = document.getElementById("filterDest")?.value.trim().toUpperCase() || "";
      renderBrowseFlights(orig, dest);
    });
  }

  // Trigger sorting on explicit button click
  if (sortBtn) {
    sortBtn.addEventListener("click", () => {
      const orig = document.getElementById("filterOrigin")?.value.trim().toUpperCase() || "";
      const dest = document.getElementById("filterDest")?.value.trim().toUpperCase() || "";
      renderBrowseFlights(orig, dest);
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (document.getElementById("filterOrigin")) document.getElementById("filterOrigin").value = "";
      if (document.getElementById("filterDest")) document.getElementById("filterDest").value = "";
      renderBrowseFlights();
    });
  }
}

function renderBrowseFlights(originFilter = "", destFilter = "", sortBy = "") {
  const container = document.getElementById("flightsTable");
  if (!container) return;

  // Read sort preference from dropdown if not passed as an argument
  if (!sortBy) {
    sortBy = document.getElementById("filterSort")?.value || "fare-asc";
  }

  // 1. Filter matching flights
  const filtered = FLIGHT_DATABASE.filter(f => {
    const matchOrig = !originFilter || f.origin.includes(originFilter) || f.originName.toUpperCase().includes(originFilter);
    const matchDest = !destFilter || f.destination.includes(destFilter) || f.destinationName.toUpperCase().includes(destFilter);
    return matchOrig && matchDest;
  });

  // 2. Sort by Base Fare or Departure Schedule
  filtered.sort((a, b) => {
    switch (sortBy) {
      case "fare-asc":
        return a.baseFare - b.baseFare;
      case "fare-desc":
        return b.baseFare - a.baseFare;
      case "schedule-asc": {
        const timeA = new Date(`${a.departureDate} ${a.departure || ''}`).getTime();
        const timeB = new Date(`${b.departureDate} ${b.departure || ''}`).getTime();
        return timeA - timeB;
      }
      case "schedule-desc": {
        const timeA = new Date(`${a.departureDate} ${a.departure || ''}`).getTime();
        const timeB = new Date(`${b.departureDate} ${b.departure || ''}`).getTime();
        return timeB - timeA;
      }
      default:
        return 0;
    }
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="card p-3 text-center">No matching flights found.</div>`;
    return;
  }

  // 3. Render Table HTML
  let html = `<table class="table" style="width:100%; text-align:center;">
    <thead>
      <tr>
        <th style="text-align:center;">Flight</th>
        <th style="text-align:center;">Route</th>
        <th style="text-align:center;">Date</th>
        <th style="text-align:center;">Departure</th>
        <th style="text-align:center;">Duration</th>
        <th style="text-align:center;">Seats</th>
        <th style="text-align:center;">Fare</th>
        <th style="text-align:center;">Actions</th>
      </tr>
    </thead>
    <tbody>`;

  filtered.forEach(f => {
    const seatsLeft = getSeatsLeft(f);
    const isFull = seatsLeft <= 0;
    html += `
      <tr>
        <td style="text-align:center;"><strong>${f.flightId}</strong></td>
        <td style="text-align:center;">${f.origin} &rarr; ${f.destination}</td>
        <td style="text-align:center;">${formatDateMonthFirst(f.departureDate)}</td>
        <td style="text-align:center;">${f.departure}</td>
        <td style="text-align:center;">${f.duration}</td>
        <td style="text-align:center;">${isFull ? '<span style="color:red;font-weight:bold;">FULL</span>' : seatsLeft}</td>
        <td style="text-align:center;">₱${f.baseFare.toLocaleString()}</td>
        <td style="text-align:center;">
          <button class="btn btn--ghost" onclick="openFlightDetailsModal('${f.flightId}')" style="margin-right: 4px;">View Details</button>
          ${isFull 
            ? `<button class="btn btn--ghost" onclick="switchToWaitlist('${f.flightId}')">Waitlist</button>`
            : `<button class="btn btn--accent" onclick="startBookingFlight('${f.flightId}')">Book</button>`
          }
        </td>
      </tr>`;
  });

  html += `</tbody></table>`;
  container.innerHTML = html;
}

function openFlightDetailsModal(flightId) {
  const flight = FLIGHT_DATABASE.find(f => f.flightId === flightId);
  if (!flight) return;

  const seatsLeft = getSeatsLeft(flight);
  const isFull = seatsLeft <= 0;

  let modal = document.getElementById("flightDetailsModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "flightDetailsModal";
    modal.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.6); display: flex; align-items: center;
      justify-content: center; z-index: 9999; padding: 16px; box-sizing: border-box;
    `;
    document.body.appendChild(modal);
  }

modal.innerHTML = `
  <div class="card" style="max-width: 520px; width: 100%; background: var(--surface); padding: 24px; border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); color: var(--text);">
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--line); padding-bottom: 12px; margin-bottom: 16px;">
      <h2 style="margin: 0; font-size: 1.3rem;">✈ Flight Details — <span style="color: var(--sky);">${flight.flightId}</span></h2>
      <button type="button" onclick="closeFlightDetailsModal()" style="background:none; border:none; font-size: 1.5rem; color: var(--text); cursor:pointer;">&times;</button>
    </div>

    <div style="display: flex; flex-direction: column; gap: 12px; font-size: 0.95rem;">
      <div>
        <span style="color: var(--muted); font-size: 0.8rem; font-weight:600;">ORIGIN</span>
        <div style="font-weight: 600; font-size: 1.05rem;">${flight.originName} (${flight.origin})</div>
      </div>

      <div>
        <span style="color: var(--muted); font-size: 0.8rem; font-weight:600;">DESTINATION</span>
        <div style="font-weight: 600; font-size: 1.05rem; color: var(--sky);">${flight.destinationName} (${flight.destination})</div>
      </div>

      <div style="display: flex; gap: 16px; margin-top: 4px; background: var(--surface-2); padding: 10px; border-radius: 6px;">
        <div style="flex: 1;">
          <span style="color: var(--muted); font-size: 0.75rem; font-weight:600;">DATE</span>
          <div style="font-weight: 600;">📅 ${formatDateMonthFirst(flight.departureDate)}</div>
        </div>
        <div style="flex: 1;">
          <span style="color: var(--muted); font-size: 0.75rem; font-weight:600;">DEPARTURE TIME</span>
          <div style="font-weight: 600;">⏰ ${flight.departure}</div>
        </div>
        <div style="flex: 1;">
          <span style="color: var(--muted); font-size: 0.75rem; font-weight:600;">DURATION</span>
          <div style="font-weight: 600;">⏱ ${flight.duration}</div>
        </div>
      </div>

      <div style="display: flex; gap: 16px;">
        <div style="flex: 1;">
          <span style="color: var(--muted); font-size: 0.75rem; font-weight:600;">AIRCRAFT</span>
          <div style="font-weight: 600;">🛩 ${flight.aircraft}</div>
        </div>
        <div style="flex: 1;">
          <span style="color: var(--muted); font-size: 0.75rem; font-weight:600;">SEAT AVAILABILITY</span>
          <div style="font-weight: 600; color: ${isFull ? 'var(--danger)' : 'var(--ok)'};">
            ${isFull ? 'FULL (0 seats remaining)' : `${seatsLeft} seat(s) available`}
          </div>
        </div>
      </div>

      <div style="margin-top: 8px; padding: 12px; background: var(--bg-muted); border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
        <span>Base Passenger Fare</span>
        <strong style="font-size: 1.25rem; color: var(--sky);">₱${flight.baseFare.toLocaleString()}</strong>
      </div>
    </div>

    <div style="display: flex; gap: 10px; margin-top: 20px; justify-content: flex-end;">
      <button type="button" class="btn btn--ghost" onclick="closeFlightDetailsModal()">Close</button>
      ${isFull 
        ? `<button type="button" class="btn btn--ghost" style="color: var(--danger); border-color: var(--danger);" onclick="closeFlightDetailsModal(); switchToWaitlist('${flight.flightId}')">Join Waitlist</button>`
        : `<button type="button" class="btn btn--accent" onclick="closeFlightDetailsModal(); startBookingFlight('${flight.flightId}')">Book Flight Now</button>`
      }
    </div>
  </div>
`;

  modal.style.display = "flex";
}

function closeFlightDetailsModal() {
  const modal = document.getElementById("flightDetailsModal");
  if (modal) modal.style.display = "none";
}

function switchToWaitlist(flightId) {
  switchTab("standby");
  const select = document.getElementById("waitlistFlight");
  if (select) select.value = flightId;
}

function startBookingFlight(flightId) {
  switchTab("book");
  selectWizardFlight(flightId);
}

// --- 5. STEP-BY-STEP BOOKING WIZARD ---
function initBookingWizard() {
  document.querySelectorAll("#stepper .step").forEach(stepEl => {
    stepEl.addEventListener("click", () => {
      const targetStep = parseInt(stepEl.getAttribute("data-step"), 10);
      if (targetStep <= bookingWizardState.highestStepReached) {
        goToWizardStep(targetStep);
      }
    });
  });

  document.getElementById("wizardFilterForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const orig = document.getElementById("wOrigin")?.value.trim().toUpperCase() || "";
    const dest = document.getElementById("wDest")?.value.trim().toUpperCase() || "";
    renderWizardFlights(orig, dest);
  });

  document.getElementById("toStep2Btn")?.addEventListener("click", () => {
    if (bookingWizardState.selectedFlight) goToWizardStep(2);
  });

  document.getElementById("generatePaxBtn")?.addEventListener("click", generatePassengerFields);
  document.getElementById("toStep3Btn")?.addEventListener("click", handleStep2Submit);
  document.getElementById("toStep4Btn")?.addEventListener("click", handleStep3Submit);
  document.getElementById("toStep5Btn")?.addEventListener("click", handleStep4Submit);
  document.getElementById("confirmBookingBtn")?.addEventListener("click", handleFinalBookingSubmit);

  document.querySelectorAll("[data-back]").forEach(btn => {
    btn.addEventListener("click", () => {
      const stepBack = parseInt(btn.getAttribute("data-back"), 10);
      goToWizardStep(stepBack);
    });
  });
}

function goToWizardStep(stepNum) {
  if (stepNum > bookingWizardState.highestStepReached) {
    bookingWizardState.highestStepReached = stepNum;
  }
  bookingWizardState.currentStep = stepNum;

  if (stepNum === 2) {
    const savedUser = getCurrentUser();
    const nameInput = document.getElementById("wContactName");
    const emailInput = document.getElementById("wContactEmail");
    if (savedUser) {
      if (nameInput && !nameInput.value) nameInput.value = savedUser.username;
      if (emailInput && !emailInput.value) emailInput.value = `${savedUser.username}@terrava.com`;
    }
  }
  document.querySelectorAll("#stepper .step").forEach(item => {
    const step = parseInt(item.getAttribute("data-step"), 10);
    if (step === stepNum) item.classList.add("is-current");
    else item.classList.remove("is-current");

    if (step <= bookingWizardState.highestStepReached) {
      item.classList.add("is-clickable");
    } else {
      item.classList.remove("is-clickable");
    }
  });

  document.querySelectorAll("#panel-book .wizard-step").forEach(ws => {
    const step = parseInt(ws.getAttribute("data-step"), 10);
    if (step === stepNum) ws.classList.add("is-active");
    else ws.classList.remove("is-active");
  });
}

function resetWizardState() {
  bookingWizardState = {
    selectedFlight: null,
    contact: "",
    passengers: [],
    currentStep: 1,
    highestStepReached: 1,
    activePaxIndexForSeat: 0,
    totalCalculatedFare: 0
  };

const nameInput = document.getElementById("wContactName");
  if (nameInput) nameInput.value = "";

  const emailInput = document.getElementById("wContactEmail");
  if (emailInput) emailInput.value = "";
  
  const paxList = document.getElementById("wPassengerList");
  if (paxList) paxList.innerHTML = "";

  const banner = document.getElementById("selectedFlightBanner");
  if (banner) banner.innerHTML = "";

  const toStep2Btn = document.getElementById("toStep2Btn");
  if (toStep2Btn) toStep2Btn.disabled = true;

  renderWizardFlights();
  goToWizardStep(1);
}

function renderWizardFlights(origFilter = "", destFilter = "") {
  const container = document.getElementById("wizardFlightsTable");
  if (!container) return;

  const filtered = FLIGHT_DATABASE.filter(f => {
    const matchOrig = !origFilter || f.origin.includes(origFilter) || f.originName.toUpperCase().includes(origFilter);
    const matchDest = !destFilter || f.destination.includes(destFilter) || f.destinationName.toUpperCase().includes(destFilter);
    return matchOrig && matchDest;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<p class="p-3 text-center">No flights found matching criteria.</p>`;
    return;
  }

  let html = `<table class="table" style="width:100%; margin-top:12px; border-collapse: separate; border-spacing: 0 4px; text-align:center;">
    <thead>
      <tr>
        <th style="text-align:center;">Flight</th>
        <th style="text-align:center;">Route</th>
        <th style="text-align:center;">Date</th>
        <th style="text-align:center;">Departure</th>
        <th style="text-align:center;">Duration</th>
        <th style="text-align:center;">Seats</th>
        <th style="text-align:center;">Price</th>
        <th style="text-align:center;">Action</th>
      </tr>
    </thead>
    <tbody>`;

  filtered.forEach(f => {
    const seatsLeft = getSeatsLeft(f);
    const isFull = seatsLeft <= 0;
    const isSelected = bookingWizardState.selectedFlight?.flightId === f.flightId;

    html += `
      <tr class="flight-row-selectable ${isSelected ? 'is-selected' : ''}" 
          onclick="${isFull ? `switchToWaitlist('${f.flightId}')` : `selectWizardFlight('${f.flightId}')`}">
        <td style="text-align:center;"><strong>${f.flightId}</strong></td>
        <td style="text-align:center;">${f.origin} &rarr; ${f.destination}</td>
        <td style="text-align:center;">${formatDateMonthFirst(f.departureDate)}</td>
        <td style="text-align:center;">${f.departure}</td>
        <td style="text-align:center;">${f.duration}</td>
        <td style="text-align:center;">${isFull ? '<span style="color:red; font-weight:bold;">FULL</span>' : seatsLeft}</td>
        <td style="text-align:center;">₱${f.baseFare.toLocaleString()}</td>
        <td style="text-align:center;">
          <button type="button" class="btn btn--ghost" style="padding: 2px 8px; font-size: 0.8rem;" onclick="event.stopPropagation(); openFlightDetailsModal('${f.flightId}');">Details</button>
          ${isFull 
            ? `<span style="color:red; font-weight:bold; font-size:0.85rem; margin-left:4px;">FULL</span>` 
            : isSelected 
              ? `<span style="color:var(--accent); font-weight:bold; font-size:0.85rem; margin-left:4px;">Selected ✓</span>`
              : `<span style="color:var(--muted); font-size:0.85rem; margin-left:4px;">Select</span>`
          }
        </td>
      </tr>`;
  });

  html += `</tbody></table>`;
  container.innerHTML = html;
}

function selectWizardFlight(flightId) {
  const flight = FLIGHT_DATABASE.find(f => f.flightId === flightId);
  if (!flight) return;

  bookingWizardState.selectedFlight = flight;
  const toStep2Btn = document.getElementById("toStep2Btn");
  if (toStep2Btn) toStep2Btn.disabled = false;

  const banner = document.getElementById("selectedFlightBanner");
  if (banner) {
    banner.innerHTML = `<strong>Selected Flight:</strong> ${flight.flightId} (${flight.origin} ➔ ${flight.destinationName}) | <strong>Date & Time:</strong> ${formatDateMonthFirst(flight.departureDate)} at ${flight.departure} (${flight.duration}) | <strong>Fare:</strong> ₱${flight.baseFare.toLocaleString()}`;
  }

  renderWizardFlights();
}

function generatePassengerFields() {
  const countInput = document.getElementById("wPaxCount");
  const count = parseInt(countInput?.value || "1", 10);
  const container = document.getElementById("wPassengerList");
  if (!container) return;

  const savedUser = getCurrentUser();

  let html = "";
  for (let i = 1; i <= count; i++) {
    const defaultName = (i === 1 && savedUser) ? savedUser.username : "";
    html += `
      <div class="card" style="margin-top: 12px; padding: 12px;">
        <h4>Passenger ${i}</h4>
        <div style="display: flex; gap: 12px; margin-top: 8px;">
          <div style="flex:2;">
            <label>Full Name</label>
            <input type="text" class="pax-name-input" value="${defaultName}" placeholder="e.g. Juan Cruz" required style="width:100%;">
          </div>
          <div style="flex:1;">
            <label>Age</label>
            <input type="number" class="pax-age-input" value="25" min="1" max="120" style="width:100%;">
          </div>
        </div>
      </div>`;
  }

  container.innerHTML = html;
}

function handleStep2Submit() {
  const contactName = document.getElementById("wContactName")?.value.trim();
  const contactEmail = document.getElementById("wContactEmail")?.value.trim();
  const errorDiv = document.getElementById("step2Error");

  // 1. Validate Contact Name
  if (!contactName) {
    if (errorDiv) errorDiv.textContent = "Please enter contact name.";
    return;
  }

  // 2. Validate Contact Email Format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!contactEmail || !emailRegex.test(contactEmail)) {
    if (errorDiv) errorDiv.textContent = "Please enter a valid contact email address.";
    return;
  }

  // 3. Ensure passenger inputs are generated
  const nameInputs = document.querySelectorAll(".pax-name-input");
  if (nameInputs.length === 0) generatePassengerFields();

  const updatedNames = document.querySelectorAll(".pax-name-input");
  const updatedAges = document.querySelectorAll(".pax-age-input");
  const passengers = [];

  let valid = true;
  updatedNames.forEach((nEl, idx) => {
    const name = nEl.value.trim();
    const age = parseInt(updatedAges[idx]?.value || "25", 10);
    if (!name) valid = false;
    passengers.push({
      id: idx + 1,
      name,
      age,
      seat: bookingWizardState.passengers[idx]?.seat || null,
      baggage: bookingWizardState.passengers[idx]?.baggage || 0
    });
  });

  if (!valid) {
    if (errorDiv) errorDiv.textContent = "Please provide names for all passengers.";
    return;
  }

  // 4. Validate available seat capacity
  const seatsLeft = getSeatsLeft(bookingWizardState.selectedFlight);
  if (passengers.length > seatsLeft) {
    if (errorDiv) errorDiv.textContent = `Only ${seatsLeft} seat(s) remaining on this flight. Please reduce passenger count.`;
    return;
  }

  // 5. Clear errors, save state, and go to Step 3
  if (errorDiv) errorDiv.textContent = "";
  bookingWizardState.contact = `${contactName} (${contactEmail})`;
  bookingWizardState.contactName = contactName;
  bookingWizardState.contactEmail = contactEmail;
  bookingWizardState.passengers = passengers;

  renderSeatMap();
  goToWizardStep(3);
}

// In-memory cache so seats stay fixed in place after being randomly generated
const flightOccupancyCache = {};

// Seeded pseudo-random number generator
function seededRandom(seedStr) {
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = seedStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  const x = Math.sin(hash++) * 10000;
  return x - Math.floor(x);
}

// Deterministically shuffles an array using a string seed (flight ID)
function shuffleWithSeed(array, seed) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const rand = seededRandom(`${seed}-shuffle-${i}`);
    const j = Math.floor(rand * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Generates occupied seats matching the flight's EXACT available seats count from getSeatsLeft()
function getBookedSeatsForFlight(flight) {
  if (!flight) return new Set();

  // Accept either flight object or flightId string
  if (typeof flight === "string") {
    const flightIdStr = flight;
    flight = FLIGHT_DATABASE.find(f => f.flightId === flightIdStr) || 
             JSON.parse(localStorage.getItem(STORAGE_FLIGHTS) || "[]").find(f => f.flightId === flightIdStr);
    if (!flight) return new Set();
  }

  const flightId = flight.flightId || flight.id || "FLIGHT";
  const totalSeats = parseInt(flight.capacity || flight.totalSeats || flight.total_seats || 48, 10);
  const totalRows = Math.ceil(totalSeats / 4);
  const cols = ['A', 'B', 'C', 'D'];

  // 1. Use central getSeatsLeft helper for accurate available count
  const availableCount = getSeatsLeft(flight);

  // 2. Calculate exact required taken seats count
  const requiredOccupiedCount = Math.max(0, Math.min(totalSeats, totalSeats - availableCount));

  // 3. Generate all seat codes (1A, 1B, 1C, 1D...)
  const allSeats = [];
  let seatCount = 0;
  for (let r = 1; r <= totalRows; r++) {
    for (let c of cols) {
      if (seatCount < totalSeats) {
        allSeats.push(`${r}${c}`);
        seatCount++;
      }
    }
  }

  // 4. Deterministically shuffle using flightId as seed
  const shuffledSeats = shuffleWithSeed(allSeats, flightId);

  // 5. Slice exact taken seats
  const initialOccupied = shuffledSeats.slice(0, requiredOccupiedCount);
  const occupiedSet = new Set(initialOccupied);

  // 6. Include seats already assigned in confirmed localStorage bookings
  const bookings = JSON.parse(localStorage.getItem(STORAGE_BOOKINGS) || "[]");
  bookings
    .filter(b => b.flightId === flightId && b.status !== "CANCELLED")
    .forEach(b => {
      if (b.passengers) {
        b.passengers.forEach(p => {
          if (p.seat) occupiedSet.add(p.seat);
        });
      }
    });

  return occupiedSet;
}

function assignSeatToActivePax(seatCode) {
  const flight = bookingWizardState.selectedFlight;
  if (!flight) return;

  // Pass flight object instead of string ID
  const takenSeats = getBookedSeatsForFlight(flight);

  if (takenSeats.has(seatCode)) {
    alert("This seat has already been booked by another passenger.");
    return;
  }

  const activeIdx = bookingWizardState.activePaxIndexForSeat || 0;
  if (!bookingWizardState.passengers[activeIdx]) return;

  // Toggle seat selection
  if (bookingWizardState.passengers[activeIdx].seat === seatCode) {
    bookingWizardState.passengers[activeIdx].seat = null;
  } else {
    bookingWizardState.passengers[activeIdx].seat = seatCode;
  }

  renderSeatMap();
}

function renderSeatMap() {
  const paxChipRow = document.getElementById("paxChipRow");
  const seatGrid = document.getElementById("seatGrid");
  if (!seatGrid || !paxChipRow) return;

  paxChipRow.innerHTML = bookingWizardState.passengers.map((p, idx) => `
    <button type="button" class="btn ${idx === bookingWizardState.activePaxIndexForSeat ? 'btn--accent' : 'btn--ghost'}" 
      onclick="setActivePaxForSeat(${idx})" style="margin-right: 6px; margin-bottom: 8px;">
      ${p.name} ${p.seat ? `[Seat ${p.seat}]` : '(No seat)'}
    </button>
  `).join("");

  const flight = bookingWizardState.selectedFlight;
  if (!flight) return;

  // Calculate total rows required based on flight capacity (4 seats per row)
  const totalSeats = flight.totalSeats || 48;
  const totalRows = Math.ceil(totalSeats / 4);
  const rows = Array.from({ length: totalRows }, (_, i) => i + 1);

  const occupiedSet = getBookedSeatsForFlight(flight);

  let cabinHtml = `
    <div class="airplane-cabin">
      <div class="plane-cockpit">✈️ Front of Aircraft (Cockpit)</div>
  `;

  rows.forEach(r => {
    cabinHtml += `<div class="plane-row"><div class="seat-group">`;
    
    // Left side: A, B
    ["A", "B"].forEach(col => {
      const seatCode = `${r}${col}`;
      const isOccupied = occupiedSet.has(seatCode);
      const assignedPax = bookingWizardState.passengers.find(p => p.seat === seatCode);
      const isSelectedByOtherPax = bookingWizardState.passengers.some(
        (p, idx) => p.seat === seatCode && idx !== bookingWizardState.activePaxIndexForSeat
      );

      const isDisabled = isOccupied || isSelectedByOtherPax;

      cabinHtml += `
        <button type="button" 
          class="plane-seat ${isOccupied ? 'is-taken' : ''} ${assignedPax ? 'is-selected' : ''}" 
          ${isDisabled ? 'disabled' : ''} 
          onclick="assignSeatToActivePax('${seatCode}')">
          <div class="seat-headrest"></div>
          <span class="seat-label">${seatCode}</span>
          <span class="pax-tag">${assignedPax ? assignedPax.name.split(' ')[0] : (isOccupied ? 'X' : '')}</span>
        </button>`;
    });

    cabinHtml += `</div><div class="plane-aisle">${r}</div><div class="seat-group">`;

    // Right side: C, D
    ["C", "D"].forEach(col => {
      const seatCode = `${r}${col}`;
      const isOccupied = occupiedSet.has(seatCode);
      const assignedPax = bookingWizardState.passengers.find(p => p.seat === seatCode);
      const isSelectedByOtherPax = bookingWizardState.passengers.some(
        (p, idx) => p.seat === seatCode && idx !== bookingWizardState.activePaxIndexForSeat
      );

      const isDisabled = isOccupied || isSelectedByOtherPax;

      cabinHtml += `
        <button type="button" 
          class="plane-seat ${isOccupied ? 'is-taken' : ''} ${assignedPax ? 'is-selected' : ''}" 
          ${isDisabled ? 'disabled' : ''} 
          onclick="assignSeatToActivePax('${seatCode}')">
          <div class="seat-headrest"></div>
          <span class="seat-label">${seatCode}</span>
          <span class="pax-tag">${assignedPax ? assignedPax.name.split(' ')[0] : (isOccupied ? 'X' : '')}</span>
        </button>`;
    });

    cabinHtml += `</div></div>`;
  });

  cabinHtml += `
      <div style="text-align:center; font-size: 0.75rem; color: var(--muted); margin-top: 14px; font-weight:600;">
        Rear of Aircraft
      </div>
    </div>`;

  seatGrid.innerHTML = cabinHtml;
}

function setActivePaxForSeat(idx) {
  bookingWizardState.activePaxIndexForSeat = idx;
  renderSeatMap();
}

function handleStep3Submit() {
  const unassigned = bookingWizardState.passengers.find(p => !p.seat);
  const errorDiv = document.getElementById("step3Error");

  if (unassigned) {
    if (errorDiv) errorDiv.textContent = `Please select a seat for ${unassigned.name}.`;
    return;
  }

  if (errorDiv) errorDiv.textContent = "";
  renderBaggageOptions();
  goToWizardStep(4);
}

function renderBaggageOptions() {
  const container = document.getElementById("baggageList");
  if (!container) return;

  let html = "";
  bookingWizardState.passengers.forEach((p, idx) => {
    html += `
      <div class="baggage-card">
        <h4>${p.name} <span style="font-weight: normal; color: var(--muted); font-size: 0.9rem;">(Seat ${p.seat || 'N/A'})</span></h4>
        <label>Select Check-in Baggage Allowance:</label>
        <select class="pax-baggage-select" data-idx="${idx}">
          <option value="0" ${p.baggage === 0 ? 'selected' : ''}>7 kg Cabin Bag Only (Included Free)</option>
          <option value="15" ${p.baggage === 15 ? 'selected' : ''}>15 kg Check-in Baggage (+₱500)</option>
          <option value="20" ${p.baggage === 20 ? 'selected' : ''}>20 kg Check-in Baggage (+₱800)</option>
          <option value="32" ${p.baggage === 32 ? 'selected' : ''}>32 kg Check-in Baggage (+₱1,200)</option>
        </select>
      </div>`;
  });

  container.innerHTML = html;
}

function handleStep4Submit() {
  const selects = document.querySelectorAll(".pax-baggage-select");
  selects.forEach(sel => {
    const idx = parseInt(sel.getAttribute("data-idx"), 10);
    const weight = parseInt(sel.value, 10);
    if (bookingWizardState.passengers[idx]) {
      bookingWizardState.passengers[idx].baggage = weight;
    }
  });

  renderReviewSummary();
  goToWizardStep(5);
}

function getBaggageFare(weight) {
  if (weight === 15) return 500;
  if (weight === 20) return 800;
  if (weight === 32) return 1200;
  return 0;
}

// Generates the baseline initial taken seats consistently per flight
function getInitialTakenSeats(flightId, totalRows = 10, occupancyRate = 0.45) {
  const seats = [];
  const cols = ['A', 'B', 'C', 'D'];

  for (let r = 1; r <= totalRows; r++) {
    for (let c of cols) {
      const seatCode = `${r}${c}`;
      // flightId + seatCode ensures PR101-1A is always same status across browser reloads
      const pseudoRand = seededRandom(`${flightId}-${seatCode}`);
      if (pseudoRand < occupancyRate) {
        seats.push(seatCode);
      }
    }
  }
  return seats;
}

// Combines seeded seats with actual booked seats saved from the database
function getOccupiedSeatsForFlight(flight) {
  if (!flight) return [];
  const initialOccupied = getInitialTakenSeats(flight.flightId || flight.id || "FLIGHT");
  const dbBookedSeats = flight.bookedSeats || []; 
  return Array.from(new Set([...initialOccupied, ...dbBookedSeats]));
}

function renderReviewSummary() {
  const container = document.getElementById("reviewSummary");
  if (!container) return;

  const flight = bookingWizardState.selectedFlight;
  let totalFare = 0;

  let paxTableRows = bookingWizardState.passengers.map(p => {
    let paxType = "Adult";
    let multiplier = 1.0;

    // Determine passenger type and discount multiplier
    if (p.age >= 60) {
      paxType = "Senior";
      multiplier = 0.80; // 20% Senior Citizen discount (change to 0.75 if you want 25% off)
    } else if (p.age < 12) {
      paxType = "Child";
      multiplier = 0.75; // 25% Child discount
    }

    const base = flight.baseFare * multiplier;
    const bagFare = getBaggageFare(p.baggage);
    const subtotal = base + bagFare;
    totalFare += subtotal;

    return `
      <tr>
        <td style="text-align:center;">${p.name} (${paxType})</td>
        <td style="text-align:center;">${p.seat}</td>
        <td style="text-align:center;">${p.baggage} kg</td>
        <td style="text-align:center;">₱${subtotal.toLocaleString()}</td>
      </tr>`;
  }).join("");

  bookingWizardState.totalCalculatedFare = totalFare;

  container.innerHTML = `
    <div class="card" style="padding: 16px;">
      <h3>Flight Details: ${flight.flightId}</h3>
      <p><strong>Route:</strong> ${flight.originName} &rarr; ${flight.destinationName}</p>
      <p><strong>Date & Time:</strong> ${formatDateMonthFirst(flight.departureDate)} at ${flight.departure} (Duration: ${flight.duration})</p>
      <p><strong>Contact:</strong> ${bookingWizardState.contact}</p>

      <table class="table" style="width:100%; margin-top: 12px; text-align:center;">
        <thead>
          <tr>
            <th style="text-align:center;">Passenger</th>
            <th style="text-align:center;">Seat</th>
            <th style="text-align:center;">Baggage</th>
            <th style="text-align:center;">Subtotal</th>
          </tr>
        </thead>
        <tbody>${paxTableRows}</tbody>
      </table>

      <h3 style="text-align: right; margin-top: 16px; color: var(--accent);">Total Fare: ₱${totalFare.toLocaleString()}</h3>
    </div>`;
}
function handleFinalBookingSubmit() {
  const flight = bookingWizardState.selectedFlight;
  if (!flight) return;

  // 1. Check if all passengers have assigned seats
  const unassignedPax = bookingWizardState.passengers.some(p => !p.seat);
  if (unassignedPax) {
    alert("Please assign a seat for all passengers before completing the booking.");
    return;
  }

  const pnr = "TRV-" + Math.random().toString(36).substring(2, 8).toUpperCase();
  const savedUser = getCurrentUser();
  const guestId = getGuestId();

  const newBooking = {
    pnr: pnr,
    username: savedUser ? savedUser.username : "guest",
    guestId: savedUser ? null : guestId, // Links booking to this specific browser for guest sessions
    flightId: flight.flightId,
    route: `${flight.originName} ➔ ${flight.destinationName}`,
    departure: `${formatDateMonthFirst(flight.departureDate)} @ ${flight.departure}`,
    contact: bookingWizardState.contact,
    status: "CONFIRMED",
    totalFare: bookingWizardState.totalCalculatedFare,
    passengers: bookingWizardState.passengers
  };

  // 2. Save booking to STORAGE_BOOKINGS
  const existingBookings = JSON.parse(localStorage.getItem(STORAGE_BOOKINGS) || "[]");
  existingBookings.unshift(newBooking);
  localStorage.setItem(STORAGE_BOOKINGS, JSON.stringify(existingBookings));

  // 3. Update seat count on the stored flight record
  const storageFlightsKey = typeof STORAGE_FLIGHTS !== "undefined" ? STORAGE_FLIGHTS : "flights";
  const storedFlights = JSON.parse(localStorage.getItem(storageFlightsKey) || "[]");
  const flightIndex = storedFlights.findIndex(f => f.flightId === flight.flightId);

  if (flightIndex !== -1 && storedFlights[flightIndex].seats !== undefined) {
    const bookedCount = bookingWizardState.passengers.length;
    storedFlights[flightIndex].seats = Math.max(0, storedFlights[flightIndex].seats - bookedCount);
    localStorage.setItem(storageFlightsKey, JSON.stringify(storedFlights));
    
    // Keep local selectedFlight seats count synced
    bookingWizardState.selectedFlight.seats = storedFlights[flightIndex].seats;
  }

  // 4. Refresh UI across the app
  refreshAllUI();

  // 5. Render confirmation screen
  const card = document.getElementById("confirmationCard");
  if (card) {
    card.innerHTML = `
      <div style="text-align: center; padding: 24px;">
        <h1 style="color: var(--ok, #28a745); margin-bottom: 8px;">✔ Booking Confirmed!</h1>
        <p style="font-size: 1.2rem; margin-top: 8px;">Your Booking Reference (PNR): <strong style="color: var(--accent);">${pnr}</strong></p>
        <p>A confirmation email has been dispatched to <strong>${newBooking.contact}</strong>.</p>
        ${savedUser ? `<p style="color: green; font-size: 0.9rem;">✔ Automatically saved to your <strong>${savedUser.username}</strong> account profile!</p>` : ''}
        
        <div style="display: flex; gap: 12px; justify-content: center; margin-top: 24px;">
          <button class="btn btn--accent" onclick="viewBookingDetails('${pnr}')">View / Manage Booking</button>
          <button class="btn btn--ghost" onclick="resetWizardState()">+ Book Another Flight</button>
        </div>
      </div>`;
  }

  goToWizardStep(6);
}

function viewBookingDetails(pnr) {
  switchTab("manage");
  const input = document.getElementById("pnrInput");
  if (input) input.value = pnr;
  lookupPNR(pnr);
}

// --- 6. MANAGE BOOKINGS & ACCOUNT DASHBOARD ---
function initManageBooking() {
  document.getElementById("pnrLookupForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const pnr = document.getElementById("pnrInput")?.value.trim() || "";
    lookupPNR(pnr);
  });

  document.getElementById("undoBtn")?.addEventListener("click", undoLastCancellation);
}

function lookupPNR(pnr) {
  const container = document.getElementById("bookingDetail") || document.getElementById("bookingResult");
  if (!container) return;

  let cleanPNR = pnr.trim().toUpperCase();

  if (!cleanPNR) {
    container.innerHTML = `<div class="card p-3" style="color: orange;">Please enter a PNR code.</div>`;
    return;
  }

  if (cleanPNR.length === 6 && !cleanPNR.startsWith("TRV-")) {
    cleanPNR = "TRV-" + cleanPNR;
  }

  const bookings = JSON.parse(localStorage.getItem(STORAGE_BOOKINGS) || "[]");
  const found = bookings.find(b => b.pnr.toUpperCase() === cleanPNR);

  if (!found) {
    container.innerHTML = `<div class="card p-3" style="color: red;">No booking found with PNR: ${cleanPNR}</div>`;
    return;
  }

  renderBookingCard(found, container);
}

function renderBookingCard(booking, container) {
  const isCancelled = booking.status === "CANCELLED";

  let paxRows = (booking.passengers || []).map(p => `
    <tr>
      <td style="text-align:center;">${p.name}</td>
      <td style="text-align:center;">${p.age}</td>
      <td style="text-align:center;">${p.seat || 'Unassigned'}</td>
      <td style="text-align:center;">${p.baggage || 0} kg</td>
    </tr>
  `).join("");

  container.innerHTML = `
    <div class="card" style="padding: 16px; margin-top: 16px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <h2>Booking ${booking.pnr}</h2>
        <span style="padding: 4px 8px; border-radius: 4px; color: white; background: ${isCancelled ? '#dc3545' : '#28a745'};">
          ${booking.status}
        </span>
      </div>
      <p style="margin-top: 8px;">
        <strong>Flight:</strong> ${booking.flightId} | 
        <strong>Contact:</strong> ${booking.contact} | 
        <strong>Account:</strong> ${booking.username || 'guest'}
      </p>

      <table class="table" style="width: 100%; margin-top: 12px; text-align:center;">
        <thead>
          <tr>
            <th style="text-align:center;">Name</th>
            <th style="text-align:center;">Age</th>
            <th style="text-align:center;">Seat</th>
            <th style="text-align:center;">Baggage</th>
          </tr>
        </thead>
        <tbody>${paxRows}</tbody>
      </table>

      <h3 style="text-align: right; margin-top: 12px;">Total Paid: ₱${(booking.totalFare || 0).toLocaleString()}</h3>

      ${!isCancelled ? `
        <div style="text-align: right; margin-top: 16px;">
          <button type="button" class="btn btn--ghost" style="color: red; border-color: red;" onclick="cancelPNRBooking('${booking.pnr}')">
            Cancel Booking
          </button>
        </div>` : ''}
    </div>`;
}

function cancelPNRBooking(pnr) {
  if (!confirm(`Are you sure you want to cancel booking ${pnr}?`)) return;

  const bookings = JSON.parse(localStorage.getItem(STORAGE_BOOKINGS) || "[]");
  const booking = bookings.find(b => b.pnr.toUpperCase() === pnr.toUpperCase());

  if (booking) {
    booking.status = "CANCELLED";
    localStorage.setItem(STORAGE_BOOKINGS, JSON.stringify(bookings));
    localStorage.setItem(STORAGE_LAST_CANCELLED, JSON.stringify(booking));

    refreshAllUI();
    lookupPNR(pnr);
  }
}

function undoLastCancellation() {
  const lastRaw = localStorage.getItem(STORAGE_LAST_CANCELLED);
  if (!lastRaw) {
    alert("No recent cancellation to undo.");
    return;
  }

  const lastBooking = JSON.parse(lastRaw);
  const bookings = JSON.parse(localStorage.getItem(STORAGE_BOOKINGS) || "[]");

  const target = bookings.find(b => b.pnr === lastBooking.pnr);
  if (target) {
    target.status = "CONFIRMED";
    localStorage.setItem(STORAGE_BOOKINGS, JSON.stringify(bookings));
    localStorage.removeItem(STORAGE_LAST_CANCELLED);

    refreshAllUI();
    alert(`Restored booking ${lastBooking.pnr}!`);
    lookupPNR(lastBooking.pnr);
  }
}

function renderRecentBookings() {
  const container = document.getElementById("recentBookingsList");
  if (!container) return;

  const savedUser = getCurrentUser();
  const bookings = JSON.parse(localStorage.getItem(STORAGE_BOOKINGS) || "[]");

  if (savedUser && (savedUser.role === 'admin' || savedUser.username === 'admin')) {
    const totalRevenue = bookings
      .filter(b => b.status !== "CANCELLED")
      .reduce((sum, b) => sum + (b.totalFare || 0), 0);
    
    const activeCount = bookings.filter(b => b.status === "CONFIRMED").length;
    const cancelledCount = bookings.filter(b => b.status === "CANCELLED").length;

    let adminRows = bookings.map(b => `
      <tr>
        <td style="text-align:center;"><strong>${b.pnr}</strong></td>
        <td style="text-align:center;">${b.username || 'guest'}</td>
        <td style="text-align:center;">${b.flightId}</td>
        <td style="text-align:center;">₱${(b.totalFare || 0).toLocaleString()}</td>
        <td style="text-align:center;"><span style="color:${b.status === 'CANCELLED' ? 'red' : 'green'}; font-weight:bold;">${b.status}</span></td>
        <td style="text-align:center;">
          <button class="btn btn--ghost" onclick="viewBookingDetails('${b.pnr}')">Inspect</button>
          ${b.status !== 'CANCELLED' ? `<button class="btn btn--ghost" style="color:red; border-color:red;" onclick="cancelPNRBooking('${b.pnr}')">Cancel</button>` : ''}
        </td>
      </tr>
    `).join("");

    container.innerHTML = `
      <div class="card" style="margin-top: 16px; padding: 16px; border-left: 4px solid #dc3545;">
        <h2 style="color: #dc3545; margin-bottom: 12px;">⚙ Admin Operations Console</h2>
        <div style="display: flex; gap: 16px; margin-bottom: 20px;">
          <div class="card" style="flex:1; padding:12px; background:var(--bg-muted, #f8f9fa);">
            <div style="font-size:0.85rem; color:var(--muted);">Total System Revenue</div>
            <div style="font-size:1.4rem; font-weight:bold; color:var(--accent);">₱${totalRevenue.toLocaleString()}</div>
          </div>
          <div class="card" style="flex:1; padding:12px; background:var(--bg-muted, #f8f9fa);">
            <div style="font-size:0.85rem; color:var(--muted);">Active Bookings</div>
            <div style="font-size:1.4rem; font-weight:bold; color:green;">${activeCount}</div>
          </div>
          <div class="card" style="flex:1; padding:12px; background:var(--bg-muted, #f8f9fa);">
            <div style="font-size:0.85rem; color:var(--muted);">Cancelled Bookings</div>
            <div style="font-size:1.4rem; font-weight:bold; color:red;">${cancelledCount}</div>
          </div>
        </div>

        <h3>All Passenger Transactions</h3>
        ${bookings.length === 0 ? '<p style="color:var(--muted);">No bookings recorded in the system.</p>' : `
          <table class="table" style="width:100%; margin-top:8px; text-align:center;">
            <thead>
              <tr>
                <th style="text-align:center;">PNR</th>
                <th style="text-align:center;">User</th>
                <th style="text-align:center;">Flight</th>
                <th style="text-align:center;">Fare</th>
                <th style="text-align:center;">Status</th>
                <th style="text-align:center;">Action</th>
              </tr>
            </thead>
            <tbody>${adminRows}</tbody>
          </table>
        `}
      </div>`;
    return;
  }

  if (savedUser) {
    const userBookings = bookings.filter(b => b.username === savedUser.username);

    let tripsHtml = userBookings.map(b => `
      <div style="padding: 12px; border: 1px solid var(--line); border-radius: 6px; margin-top: 8px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <strong style="color: var(--accent); font-size: 1.1rem;">${b.pnr}</strong> - Flight ${b.flightId}
          <span style="padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; color: white; background: ${b.status === 'CANCELLED' ? '#dc3545' : '#28a745'}; margin-left: 8px;">
            ${b.status}
          </span>
          <br><small style="color: var(--muted);">${b.route} | Passengers: ${b.passengers?.length || 1} | Total: ₱${(b.totalFare || 0).toLocaleString()}</small>
        </div>
        <button type="button" class="btn btn--accent" onclick="viewBookingDetails('${b.pnr}')">View Details</button>
      </div>
    `).join("");

    container.innerHTML = `
      <div class="card" style="margin-top: 16px; padding: 16px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h3>✈ My Trips (${savedUser.username})</h3>
        </div>
        <p style="font-size:0.85rem; color:var(--muted);">All flights linked directly to your Terrava account.</p>
        
        <div style="margin-top: 12px;">
          ${userBookings.length > 0 ? tripsHtml : '<p style="color:var(--muted); padding:12px 0;">You have no active or past bookings under this account.</p>'}
        </div>
      </div>`;
    return;
  }

  // --- GUEST VIEW ---
  const guestId = getGuestId();
  const guestBookings = bookings.filter(b => b.guestId === guestId || (!b.guestId && b.username === "guest"));

  if (guestBookings.length > 0) {
    let tripsHtml = guestBookings.map(b => `
      <div style="padding: 12px; border: 1px solid var(--line); border-radius: 6px; margin-top: 8px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <strong style="color: var(--accent); font-size: 1.1rem;">${b.pnr}</strong> - Flight ${b.flightId}
          <span style="padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; color: white; background: ${b.status === 'CANCELLED' ? '#dc3545' : '#28a745'}; margin-left: 8px;">
            ${b.status}
          </span>
          <br><small style="color: var(--muted);">${b.route} | Passengers: ${b.passengers?.length || 1} | Total: ₱${(b.totalFare || 0).toLocaleString()}</small>
        </div>
        <button type="button" class="btn btn--accent" onclick="viewBookingDetails('${b.pnr}')">View Details</button>
      </div>
    `).join("");

    container.innerHTML = `
      <div class="card" style="margin-top: 16px; padding: 16px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h3>✈ Guest Trips (Saved in this Browser)</h3>
        </div>
        <p style="font-size:0.85rem; color:var(--muted);">Bookings made during your active guest session in this browser.</p>
        <div style="margin-top: 12px;">
          ${tripsHtml}
        </div>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="card" style="margin-top: 16px; padding: 16px; background: rgba(0,0,0,0.02);">
      <h3>💡 Traveling as a Guest?</h3>
      <p style="font-size:0.9rem; color:var(--muted); margin-top:4px;">
        Enter your PNR code in the lookup bar above to inspect or cancel your booking.
      </p>
      <p style="font-size:0.85rem; color:var(--accent); margin-top:8px;">
        <strong>Pro-tip:</strong> <a href="#" onclick="openLoginModal(); return false;">Log in as <strong>passenger</strong></a> to automatically centralize all your flight bookings in one dashboard!
      </p>
    </div>`;
}

// --- 7. WAITLIST MANAGEMENT ---
function initWaitlist() {
  document.getElementById("waitlistForm")?.addEventListener("submit", handleWaitlistSubmit);
}

function populateWaitlistDropdown() {
  const select = document.getElementById("waitlistFlight");
  if (!select) return;

  select.innerHTML = '<option value="">Select a flight...</option>' + FLIGHT_DATABASE.map(f => `
    <option value="${f.flightId}">${f.flightId} — ${f.origin} to ${f.destinationName} (${formatDateMonthFirst(f.departureDate)} ${f.departure})</option>
  `).join("");
}

function handleWaitlistSubmit(event) {
  if (event) event.preventDefault();

  // Existing DOM Elements
  const flightSelect = document.getElementById("waitlistFlight");
  const nameInput = document.getElementById("waitlistName");
  const ageInput = document.getElementById("waitlistAge");
  const resultDiv = document.getElementById("waitlistResult");

  const flightCode = flightSelect?.value;
  const name = nameInput?.value.trim();
  const age = ageInput?.value;

  // Existing Active User Helper
  const savedUser = getCurrentUser();

  if (!flightCode || !name || !age) {
    if (resultDiv) resultDiv.innerHTML = `<span style="color:red;">Please complete all waitlist fields.</span>`;
    return;
  }

  // Existing Storage & Database Variables
  const currentWaitlist = JSON.parse(localStorage.getItem(STORAGE_WAITLIST) || "[]");
  const flight = FLIGHT_DATABASE.find(f => f.flightId === flightCode);
  
  // Existing Capacity Helper
  const seatsLeft = getSeatsLeft(flight);
  const isFull = seatsLeft <= 0;

  const entry = {
    id: "WL-" + Math.floor(1000 + Math.random() * 9000),
    username: savedUser ? savedUser.username : "guest",
    guestId: savedUser ? null : getGuestId(), // Ties guest waitlist entry to this browser
    flight: flightCode,
    name: name,
    age: parseInt(age, 10),
    timestamp: Date.now(),
    joinedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    status: isFull ? "FULL_WAITLIST" : "STANDARD_WAITLIST"
  };

  currentWaitlist.push(entry);
  localStorage.setItem(STORAGE_WAITLIST, JSON.stringify(currentWaitlist));

  if (resultDiv) {
    resultDiv.innerHTML = `<span style="color:green; font-weight:bold;">✔ Added to waitlist under Request ID: ${entry.id}</span>`;
  }

  // Refresh UI and Table using existing engines
  refreshAllUI();
  document.getElementById("waitlistForm")?.reset();
}

function renderWaitlistTable() {
  const tbody = document.getElementById("waitlistTableBody");
  const container = document.getElementById("waitlistTable") || tbody?.closest('.card');
  if (!container && !tbody) return;

  const savedUser = getCurrentUser();
  const allWaitlist = JSON.parse(localStorage.getItem(STORAGE_WAITLIST) || "[]");

  // Helper for status badge HTML
  const getStatusBadge = (status, pnr) => {
    if (status === "APPROVED") {
      return `<span style="padding: 2px 8px; border-radius: 4px; background: #28a745; color: white; font-weight: bold; font-size: 0.85rem;">APPROVED</span>
              ${pnr ? `<br><button class="btn btn--ghost" style="font-size: 0.75rem; margin-top: 4px; padding: 2px 6px;" onclick="viewBookingDetails('${pnr}')">View Booking (${pnr})</button>` : ''}`;
    }
    if (status === "REJECTED") {
      return `<span style="padding: 2px 8px; border-radius: 4px; background: #dc3545; color: white; font-weight: bold; font-size: 0.85rem;">REJECTED</span>`;
    }
    return `<span style="padding: 2px 8px; border-radius: 4px; background: #ffc107; color: black; font-weight: bold; font-size: 0.85rem;">PENDING</span>`;
  };

  // Admin View
  if (savedUser && (savedUser.role === 'admin' || savedUser.username === 'admin')) {
    if (allWaitlist.length === 0) {
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="7" style="padding:16px; text-align:center; color: var(--muted);">No waitlist entries in system.</td></tr>`;
      } else {
        container.innerHTML = `<p class="p-3" style="color: var(--muted);">No waitlist entries in system.</p>`;
      }
      return;
    }

    let rows = allWaitlist.map((w, idx) => `
      <tr>
        <td style="text-align:center;">${idx + 1}</td>
        <td style="text-align:center;"><strong>${w.flight}</strong></td>
        <td style="text-align:center;">${w.name} (${w.age} y/o)</td>
        <td style="text-align:center;"><span style="font-size:0.8rem; background:rgba(0,0,0,0.06); padding:2px 6px; border-radius:4px;">${w.username || 'guest'}</span></td>
        <td style="text-align:center;">${w.joinedAt}</td>
        <td style="text-align:center;">${getStatusBadge(w.status, w.pnr)}</td>
        <td style="text-align:center;"><button class="btn btn--ghost" style="color:red; border-color:red; font-size:0.75rem;" onclick="deleteWaitlistEntry('${w.id}')">Delete Entry</button></td>
      </tr>
    `).join("");

    if (tbody) {
      tbody.innerHTML = rows;
    } else {
      container.innerHTML = `
        <div style="margin-top:12px;">
          <h4 style="color:#dc3545; margin-bottom:8px;">⚙ Admin Master Standby Control</h4>
          <table class="table" style="width:100%; text-align:center;">
            <thead>
              <tr>
                <th style="text-align:center;">#</th>
                <th style="text-align:center;">Flight</th>
                <th style="text-align:center;">Passenger Name</th>
                <th style="text-align:center;">Account</th>
                <th style="text-align:center;">Time</th>
                <th style="text-align:center;">Status</th>
                <th style="text-align:center;">Action</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }
    return;
  }

  // Passenger / Guest View
  const guestId = getGuestId();
  const userWaitlist = allWaitlist.filter(w => {
    if (savedUser) return w.username === savedUser.username;
    return w.guestId === guestId || (!w.guestId && w.username === "guest");
  });

  if (userWaitlist.length === 0) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="5" style="padding:16px; text-align:center; color: var(--muted);">${savedUser ? 'You have no active waitlist requests.' : 'No guest waitlist entries found.'}</td></tr>`;
    } else {
      container.innerHTML = `<p class="p-3" style="color: var(--muted);">${savedUser ? 'You have no active waitlist requests.' : 'No guest waitlist entries found.'}</p>`;
    }
    return;
  }

  let rows = userWaitlist.map((w, idx) => `
    <tr>
      <td style="text-align:center;">${idx + 1}</td>
      <td style="text-align:center;"><strong>${w.flight}</strong></td>
      <td style="text-align:center;">${w.name} (${w.age} y/o)</td>
      <td style="text-align:center;">${w.joinedAt}</td>
      <td style="text-align:center;">${getStatusBadge(w.status, w.pnr)}</td>
    </tr>
  `).join("");

  if (tbody) {
    tbody.innerHTML = rows;
  } else {
    container.innerHTML = `
      <div style="margin-top:12px;">
        <h4 style="margin-bottom:8px;">📋 ${savedUser ? `My Waitlist Requests (${savedUser.username})` : 'Guest Session Waitlist Queue'}</h4>
        <table class="table" style="width:100%; text-align:center;">
          <thead>
            <tr>
              <th style="text-align:center;">#</th>
              <th style="text-align:center;">Flight</th>
              <th style="text-align:center;">Name</th>
              <th style="text-align:center;">Time</th>
              <th style="text-align:center;">Status</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }
}

function updateNavigationForRole(user) {
  const navBrowse = document.getElementById("navBrowse");
  const navBook = document.getElementById("navBook");
  const navMyBooking = document.getElementById("navMyBooking");
  const navWaitlist = document.getElementById("navWaitlist");
  const navAdmin = document.getElementById("navAdmin");
  const adminTab = document.getElementById("adminTab");

  const isAdmin = user && (user.role === "admin" || user.username === "admin");

  const passengerNavs = [navBrowse, navBook, navMyBooking, navWaitlist];
  passengerNavs.forEach((el) => {
    if (el) el.style.display = isAdmin ? "none" : "";
  });

  // Handle single Admin tab display to prevent duplicates
  if (navAdmin) navAdmin.style.display = isAdmin ? "" : "none";
  if (adminTab) {
    if (navAdmin) {
      adminTab.style.display = "none";
    } else {
      adminTab.style.display = isAdmin ? "" : "none";
    }
  }
}

function deleteWaitlistEntry(id) {
  let currentWaitlist = JSON.parse(localStorage.getItem(STORAGE_WAITLIST) || "[]");
  currentWaitlist = currentWaitlist.filter(w => w.id !== id);
  localStorage.setItem(STORAGE_WAITLIST, JSON.stringify(currentWaitlist));
  refreshAllUI();
}

// --- 8. LOGIN & REGISTER MODAL LOGIC ---
function initModalListeners() {
  const loginModal = document.getElementById("loginModal");
  window.addEventListener("click", (e) => {
    if (e.target === loginModal) closeLoginModal();
    const detailsModal = document.getElementById("flightDetailsModal");
    if (detailsModal && e.target === detailsModal) closeFlightDetailsModal();
  });
}

function openLoginModal() {
  const modal = document.getElementById("loginModal");
  if (modal) {
    modal.style.display = "flex";
    modal.classList.add("is-active");
  }
  switchAuthMode('login');
}

function closeLoginModal() {
  const modal = document.getElementById("loginModal");
  if (modal) {
    modal.style.display = "none";
    modal.classList.remove("is-active");
  }
  clearAuthErrors();
}

function switchAuthMode(mode) {
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const modalTitle = document.getElementById("modalTitle");
  const switchPrompt = document.getElementById("authSwitchPrompt");

  clearAuthErrors();

  if (mode === 'register') {
    if (modalTitle) modalTitle.textContent = "Create Account";
    if (loginForm) loginForm.style.display = "none";
    if (registerForm) registerForm.style.display = "block";
    if (switchPrompt) {
      switchPrompt.innerHTML = `Already have an account? <a href="#" onclick="switchAuthMode('login'); return false;">Sign In</a>`;
    }
  } else {
    if (modalTitle) modalTitle.textContent = "Login";
    if (registerForm) registerForm.style.display = "none";
    if (loginForm) loginForm.style.display = "block";
    if (switchPrompt) {
      switchPrompt.innerHTML = `Don't have an account? <a href="#" onclick="switchAuthMode('register'); return false;">Sign Up</a>`;
    }
  }
}

function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;

  const eyeIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
  
  const eyeOffIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

  if (input.type === "password") {
    input.type = "text";
    btn.innerHTML = eyeOffIcon;
  } else {
    input.type = "password";
    btn.innerHTML = eyeIcon;
  }
}

function clearAuthErrors() {
  const resultDiv = document.getElementById("loginResult");
  if (resultDiv) {
    resultDiv.innerHTML = "";
    resultDiv.style.display = "none";
  }
  document.querySelectorAll("#loginModal input").forEach(input => {
    input.classList.remove("input-error");
  });
}

function handleLoginSubmit(e) {
  if (e) e.preventDefault();
  clearAuthErrors();

  const user = document.getElementById("loginUsername")?.value.trim();
  const pass = document.getElementById("loginPassword")?.value.trim();
  const userInput = document.getElementById("loginUsername");
  const passInput = document.getElementById("loginPassword");
  const resultDiv = document.getElementById("loginResult");

  const registeredUsers = JSON.parse(localStorage.getItem(STORAGE_USERS) || "[]");
  const registeredMatch = registeredUsers.find(u => u.username === user && u.password === pass);

  if (registeredMatch) {
    localStorage.setItem("terrava_user", JSON.stringify({ 
      username: registeredMatch.username,
      role: registeredMatch.role || "passenger" 
    }));

    clearSessionUI();
    refreshAllUI();

    // Auto-route active tab immediately based on logged-in user role
    if (registeredMatch.role === "admin" || registeredMatch.username === "admin") {
      switchTab("admin");
    } else {
      switchTab("book");
    }

    if (resultDiv) {
      resultDiv.style.display = "block";
      resultDiv.className = "result is-success";
      resultDiv.innerHTML = `✔ Logged in as <strong>${registeredMatch.username}</strong>!`;
    }

    setTimeout(() => {
      closeLoginModal();
      document.getElementById("loginForm")?.reset();
    }, 800);
  } else {
    if (userInput) userInput.classList.add("input-error");
    if (passInput) passInput.classList.add("input-error");

    if (resultDiv) {
      resultDiv.style.display = "block";
      resultDiv.className = "result is-error";
      resultDiv.innerHTML = `❌ Incorrect username or password.`;
    }
  }
}

function handleRegisterSubmit(e) {
  if (e) e.preventDefault();
  clearAuthErrors();

  const regUser = document.getElementById("regUsername")?.value.trim();
  const regPass = document.getElementById("regPassword")?.value.trim();
  const regUserInput = document.getElementById("regUsername");
  const resultDiv = document.getElementById("loginResult");

  if (!regUser || !regPass) return;

  const registeredUsers = JSON.parse(localStorage.getItem(STORAGE_USERS) || "[]");
  const isTaken = registeredUsers.some(u => u.username === regUser);

  if (isTaken) {
    if (regUserInput) regUserInput.classList.add("input-error");
    if (resultDiv) {
      resultDiv.style.display = "block";
      resultDiv.className = "result is-error";
      resultDiv.innerHTML = `❌ Username "${regUser}" is already taken.`;
    }
    return;
  }

  const newUser = { username: regUser, password: regPass, role: "passenger" };
  registeredUsers.push(newUser);
  localStorage.setItem(STORAGE_USERS, JSON.stringify(registeredUsers));

  localStorage.setItem("terrava_user", JSON.stringify({ username: newUser.username, role: newUser.role }));

  clearSessionUI();
  refreshAllUI();
  switchTab("book");

  if (resultDiv) {
    resultDiv.style.display = "block";
    resultDiv.className = "result is-success";
    resultDiv.innerHTML = `✔ Account created! Welcome, <strong>${regUser}</strong>!`;
  }

  setTimeout(() => {
    closeLoginModal();
    document.getElementById("registerForm")?.reset();
  }, 1000);
}

// --- 9. ADMIN DASHBOARD & MONITORING EXTENSIONS ---
function getFlightStatuses() {
  const saved = localStorage.getItem(STORAGE_FLIGHT_STATUSES);
  if (saved) return JSON.parse(saved);

  const initialStatuses = {
    "TRV-101": { status: "SCHEDULED", delayReason: "" },
    "TRV-102": { status: "NEAR_BOARDING", delayReason: "" },
    "TRV-103": { status: "BOARDING", delayReason: "" },
    "TRV-104": { status: "SCHEDULED", delayReason: "" }
  };
  localStorage.setItem(STORAGE_FLIGHT_STATUSES, JSON.stringify(initialStatuses));
  return initialStatuses;
}

function updateFlightStatus(flightId, newStatus, delayReason = "") {
  const statuses = getFlightStatuses();
  statuses[flightId] = { status: newStatus, delayReason: delayReason };
  localStorage.setItem(STORAGE_FLIGHT_STATUSES, JSON.stringify(statuses));
  
  refreshAllUI();
  renderAdminManifest(document.getElementById("adminManifestFlightSelect")?.value);
}

function renderAdminDashboard() {
  renderAdminMetrics();
  renderAdminFlightMonitor();
  populateAdminManifestDropdown();
  renderAdminWaitlistApproval();
}

function renderAdminMetrics() {
  const container = document.getElementById("adminMetricsSummary");
  if (!container) return;

  const bookings = JSON.parse(localStorage.getItem(STORAGE_BOOKINGS) || "[]");
  const waitlist = JSON.parse(localStorage.getItem(STORAGE_WAITLIST) || "[]");
  const statuses = getFlightStatuses();

  const totalPax = bookings
    .filter(b => b.status === "CONFIRMED")
    .reduce((sum, b) => sum + (b.passengers ? b.passengers.length : 1), 0);

  const delayedCount = Object.values(statuses).filter(s => s.status === "DELAYED").length;

  container.innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
      <div class="card" style="border-left: 4px solid var(--sky);">
        <div style="font-size: 0.8rem; color: var(--muted); font-weight:700;">TOTAL FLOWN/BOOKED PAX</div>
        <div style="font-size: 1.6rem; font-weight: 800; color: var(--text);">${totalPax} Passengers</div>
      </div>
      <div class="card" style="border-left: 4px solid #ffc107;">
        <div style="font-size: 0.8rem; color: var(--muted); font-weight:700;">WAITLIST QUEUE</div>
        <div style="font-size: 1.6rem; font-weight: 800; color: var(--accent-strong);">${waitlist.length} Standby</div>
      </div>
      <div class="card" style="border-left: 4px solid #dc3545;">
        <div style="font-size: 0.8rem; color: var(--muted); font-weight:700;">DELAYED FLIGHTS</div>
        <div style="font-size: 1.6rem; font-weight: 800; color: #dc3545;">${delayedCount} Delayed</div>
      </div>
    </div>`;
}

function renderAdminFlightMonitor() {
  const container = document.getElementById("adminFlightMonitorTable");
  if (!container) return;

  const statuses = getFlightStatuses();

  let rows = FLIGHT_DATABASE.map(f => {
    const currentStatusObj = statuses[f.flightId] || { status: "SCHEDULED", delayReason: "" };
    const currentStatus = currentStatusObj.status;
    const seatsLeft = getSeatsLeft(f);

    return `
      <tr>
        <td style="text-align:center;"><strong>${f.flightId}</strong></td>
        <td style="text-align:center;">${f.origin} &rarr; ${f.destination}</td>
        <td style="text-align:center;">${formatDateMonthFirst(f.departureDate)} ${f.departure}</td>
        <td style="text-align:center;">${seatsLeft} / ${f.capacity} left</td>
        <td style="text-align:center;">
          <span class="badge badge--status-${currentStatus.toLowerCase()}">${currentStatus.replace("_", " ")}</span>
          ${currentStatus === "DELAYED" && currentStatusObj.delayReason ? `<br><small style="color:red;">(${currentStatusObj.delayReason})</small>` : ''}
        </td>
        <td style="text-align:center;">
          <select onchange="handleAdminStatusChange('${f.flightId}', this.value)" style="padding: 4px 8px; font-size: 0.8rem;">
            <option value="SCHEDULED" ${currentStatus === 'SCHEDULED' ? 'selected' : ''}>Scheduled</option>
            <option value="NEAR_BOARDING" ${currentStatus === 'NEAR_BOARDING' ? 'selected' : ''}>Near Boarding</option>
            <option value="BOARDING" ${currentStatus === 'BOARDING' ? 'selected' : ''}>Boarding</option>
            <option value="DELAYED" ${currentStatus === 'DELAYED' ? 'selected' : ''}>Delayed</option>
            <option value="FLOWN" ${currentStatus === 'FLOWN' ? 'selected' : ''}>Already Flown</option>
          </select>
        </td>
      </tr>`;
  }).join("");

  container.innerHTML = `
    <table class="table" style="width:100%; text-align:center;">
      <thead>
        <tr>
          <th style="text-align:center;">Flight</th>
          <th style="text-align:center;">Route</th>
          <th style="text-align:center;">Departure</th>
          <th style="text-align:center;">Seats</th>
          <th style="text-align:center;">Current Status</th>
          <th style="text-align:center;">Update Status</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function handleAdminStatusChange(flightId, newStatus) {
  let delayReason = "";
  if (newStatus === "DELAYED") {
    delayReason = prompt("Enter delay reason/time (e.g., Delayed 45m due to weather):", "Aircraft Maintenance") || "Delayed";
  }
  updateFlightStatus(flightId, newStatus, delayReason);
}

function populateAdminManifestDropdown() {
  const select = document.getElementById("adminManifestFlightSelect");
  const modalSelect = document.getElementById("adminBookFlight");
  if (!select) return;

  const options = '<option value="">-- Select Flight --</option>' + FLIGHT_DATABASE.map(f => `
    <option value="${f.flightId}">${f.flightId} (${f.origin} ➔ ${f.destination}) - ${f.departure}</option>
  `).join("");

  select.innerHTML = options;
  if (modalSelect) modalSelect.innerHTML = options;
}

function renderAdminManifest(flightId) {
  const container = document.getElementById("adminManifestContainer");
  if (!container) return;

  if (!flightId) {
    container.innerHTML = `<div class="empty-state">Select a flight above to view its passenger manifest.</div>`;
    return;
  }

  const flight = FLIGHT_DATABASE.find(f => f.flightId === flightId);
  const bookings = JSON.parse(localStorage.getItem(STORAGE_BOOKINGS) || "[]");
  const statuses = getFlightStatuses();
  const currentStatus = statuses[flightId]?.status || "SCHEDULED";

  const flightBookings = bookings.filter(b => b.flightId === flightId && b.status === "CONFIRMED");

  let manifestPaxList = [];
  flightBookings.forEach(b => {
    (b.passengers || []).forEach(p => {
      manifestPaxList.push({
        pnr: b.pnr,
        username: b.username,
        contact: b.contact,
        paxName: p.name,
        age: p.age,
        seat: p.seat || "Unassigned",
        baggage: p.baggage || 0
      });
    });
  });

  let rows = manifestPaxList.map((p, idx) => `
    <tr>
      <td style="text-align:center;">${idx + 1}</td>
      <td style="text-align:center;"><strong>${p.pnr}</strong></td>
      <td style="text-align:center;">${p.paxName} (${p.age} y/o)</td>
      <td style="text-align:center;"><strong>${p.seat}</strong></td>
      <td style="text-align:center;">${p.baggage} kg</td>
      <td style="text-align:center;"><small>${p.username} (${p.contact})</small></td>
      <td style="text-align:center;">
        <button class="btn btn--ghost" style="color:red; border-color:red; font-size:0.75rem;" onclick="adminCancelPassengerBooking('${p.pnr}')">
          Cancel Booking
        </button>
      </td>
    </tr>
  `).join("");

  container.innerHTML = `
    <div class="manifest-header-box">
      <div>
        <h3 style="margin:0;">Manifest: ${flight.flightId} (${flight.origin} &rarr; ${flight.destinationName})</h3>
        <small style="color:var(--muted);">Total Passengers Manifested: <strong>${manifestPaxList.length}</strong> | Capacity: ${flight.capacity}</small>
      </div>
      <div>
        <span class="badge badge--status-${currentStatus.toLowerCase()}">${currentStatus.replace("_", " ")}</span>
      </div>
    </div>

    ${manifestPaxList.length === 0 ? '<p style="padding:16px; text-align:center; color:var(--muted);">No confirmed passengers found on this flight manifest.</p>' : `
      <table class="table" style="width:100%; text-align:center;">
        <thead>
          <tr>
            <th style="text-align:center;">#</th>
            <th style="text-align:center;">PNR</th>
            <th style="text-align:center;">Passenger Name</th>
            <th style="text-align:center;">Seat</th>
            <th style="text-align:center;">Baggage</th>
            <th style="text-align:center;">Account/Contact</th>
            <th style="text-align:center;">Admin Action</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `}`;
}

function adminCancelPassengerBooking(pnr) {
  if (confirm(`Admin Action: Are you sure you want to cancel booking ${pnr}? This will release seats immediately.`)) {
    cancelPNRBooking(pnr);
    const selectedFlight = document.getElementById("adminManifestFlightSelect")?.value;
    renderAdminManifest(selectedFlight);
  }
}

function openAdminAddBookingModal() {
  const modal = document.getElementById("adminAddBookingModal");
  if (modal) modal.style.display = "flex";
}

function closeAdminAddBookingModal() {
  const modal = document.getElementById("adminAddBookingModal");
  if (modal) modal.style.display = "none";
}

function handleAdminAddBookingSubmit(e) {
  if (e) e.preventDefault();
  const flightId = document.getElementById("adminBookFlight")?.value;
  const username = document.getElementById("adminBookUsername")?.value.trim() || "guest";
  const contact = document.getElementById("adminBookContact")?.value.trim();
  const paxName = document.getElementById("adminBookPaxName")?.value.trim();
  const age = parseInt(document.getElementById("adminBookAge")?.value || "25", 10);
  const seat = document.getElementById("adminBookSeat")?.value.trim().toUpperCase();

  const flight = FLIGHT_DATABASE.find(f => f.flightId === flightId);
  if (!flight) return;

  const seatsLeft = getSeatsLeft(flight);
  if (seatsLeft <= 0) {
    alert("Cannot add booking: Flight is completely full!");
    return;
  }

  const pnr = "TRV-ADM" + Math.random().toString(36).substring(2, 6).toUpperCase();
  const newBooking = {
    pnr: pnr,
    username: username,
    flightId: flightId,
    route: `${flight.originName} ➔ ${flight.destinationName}`,
    departure: `${formatDateMonthFirst(flight.departureDate)} @ ${flight.departure}`,
    contact: contact,
    status: "CONFIRMED",
    totalFare: flight.baseFare,
    passengers: [{ id: 1, name: paxName, age: age, seat: seat, baggage: 0 }]
  };

// Add to confirmed bookings
  const bookings = JSON.parse(localStorage.getItem(STORAGE_BOOKINGS) || "[]");
  bookings.unshift(newBooking);
  localStorage.setItem(STORAGE_BOOKINGS, JSON.stringify(bookings));

  alert(`✔ Booking ${pnr} created successfully for ${paxName}!`);
  closeAdminAddBookingModal();
  document.getElementById("adminAddBookingForm")?.reset();

  refreshAllUI();
  renderAdminManifest(flightId);
}

function renderAdminWaitlistApproval() {
  const container = document.getElementById("adminWaitlistApprovalContainer");
  if (!container) return;

  let waitlist = JSON.parse(localStorage.getItem(STORAGE_WAITLIST) || "[]");
  
  // Filter for pending requests only
  let pendingWaitlist = waitlist.filter(w => w.status !== "APPROVED" && w.status !== "REJECTED");

  if (pendingWaitlist.length === 0) {
    container.innerHTML = `<p class="p-3 text-center" style="color:var(--muted);">No waitlisted passengers currently pending.</p>`;
    return;
  }

  pendingWaitlist.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  let rows = pendingWaitlist.map((w, idx) => {
    const flight = FLIGHT_DATABASE.find(f => f.flightId === w.flight);
    const seatsLeft = getSeatsLeft(flight);
    const hasSeatAvailable = seatsLeft > 0;

    return `
      <tr>
        <td style="text-align:center;"><strong>Priority #${idx + 1}</strong></td>
        <td style="text-align:center;"><strong>${w.flight}</strong></td>
        <td style="text-align:center;">${w.name} (${w.age} y/o)</td>
        <td style="text-align:center;"><small>${w.joinedAt}</small></td>
        <td style="text-align:center;">
          ${hasSeatAvailable 
            ? `<span style="color:green; font-weight:bold;">${seatsLeft} Seats Available</span>` 
            : `<span style="color:red; font-weight:bold;">Flight Full</span>`}
        </td>
        <td style="text-align:center;">
          <button class="btn btn--accent" style="font-size:0.75rem; padding: 4px 10px;" 
            ${!hasSeatAvailable ? 'disabled title="No seats available to approve"' : ''} 
            onclick="adminApproveWaitlistEntry('${w.id}')">
            Approve & Issue Seat
          </button>
          <button class="btn btn--ghost" style="color:red; border-color:red; font-size:0.75rem; padding: 4px 8px;" 
            onclick="adminRejectWaitlistEntry('${w.id}')">
            Reject
          </button>
        </td>
      </tr>`;
  }).join("");

  container.innerHTML = `
    <table class="table" style="width:100%; text-align:center;">
      <thead>
        <tr>
          <th style="text-align:center;">Priority</th>
          <th style="text-align:center;">Flight</th>
          <th style="text-align:center;">Passenger Name</th>
          <th style="text-align:center;">Time Joined</th>
          <th style="text-align:center;">Seat Status</th>
          <th style="text-align:center;">Admin Action</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

async function adminApproveWaitlistEntry(waitlistId) {
  let waitlist = JSON.parse(localStorage.getItem(STORAGE_WAITLIST) || "[]");
  const entryIdx = waitlist.findIndex(w => w.id === waitlistId);
  if (entryIdx === -1) return;

  const entry = waitlist[entryIdx];
  const flight = FLIGHT_DATABASE.find(f => f.flightId === entry.flight);
  const seatsLeft = getSeatsLeft(flight);

  if (seatsLeft <= 0) {
    alert("Cannot approve waitlist entry: No available seats on flight " + flight.flightId);
    return;
  }

// Dynamic seat lookup - pass the flight object directly
  const takenSeats = getBookedSeatsForFlight(flight);
  const columns = ["A", "B", "C", "D"];
  let autoSeat = null;

  for (let r = 1; r <= 12; r++) {
    for (let c of columns) {
      let code = `${r}${c}`;
      if (!takenSeats.has(code)) {
        autoSeat = code;
        break;
      }
    }
    if (autoSeat) break;
  }

  if (!autoSeat) autoSeat = "1A";

  const passengerContact = `${entry.name.toLowerCase().replace(/\s+/g, '')}@terrava.com`;

  try {
    // Call Java Backend API
    const response = await fetch('/api/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        flightCode: entry.flight,
        contact: passengerContact,
        passengers: [{
          name: entry.name,
          age: Number(entry.age),
          isPwd: Boolean(entry.isPwd),
          baggage: 0,
          seat: autoSeat
        }]
      })
    });

    const result = await response.json();

    if (result.success) {
      // Synchronize booking object returned by Java server with localStorage
      const serverBooking = result.booking;
      const newBooking = {
        pnr: serverBooking.pnr,
        username: entry.username || "guest",
        flightId: entry.flight,
        route: `${flight.originName} ➔ ${flight.destinationName}`,
        departure: `${formatDateMonthFirst(flight.departureDate)} @ ${flight.departure}`,
        contact: passengerContact,
        status: "CONFIRMED",
        totalFare: serverBooking.totalFare,
        passengers: serverBooking.passengers || [{ id: 1, name: entry.name, age: entry.age, seat: autoSeat, baggage: 0 }]
      };

      const bookings = JSON.parse(localStorage.getItem(STORAGE_BOOKINGS) || "[]");
      bookings.unshift(newBooking);
      localStorage.setItem(STORAGE_BOOKINGS, JSON.stringify(bookings));

      // Update waitlist status
      entry.status = "APPROVED";
      entry.pnr = serverBooking.pnr;
      localStorage.setItem(STORAGE_WAITLIST, JSON.stringify(waitlist));

      alert(`✔ Approved! Passenger ${entry.name} promoted to confirmed booking (${serverBooking.pnr}, Seat ${autoSeat}). Total: ₱${serverBooking.totalFare.toLocaleString()}`);
      refreshAllUI();
    } else {
      alert(`Backend Error: ${result.message}`);
    }
  } catch (error) {
    console.error("Failed to connect to backend server:", error);
    alert("Could not reach Java backend server. Please verify WebServer is running.");
  }
}

function adminRejectWaitlistEntry(waitlistId) {
  let waitlist = JSON.parse(localStorage.getItem(STORAGE_WAITLIST) || "[]");
  const entry = waitlist.find(w => w.id === waitlistId);
  if (!entry) return;

  if (confirm(`Reject waitlist request for ${entry.name}?`)) {
    entry.status = "REJECTED";
    localStorage.setItem(STORAGE_WAITLIST, JSON.stringify(waitlist));
    refreshAllUI();
  }
}