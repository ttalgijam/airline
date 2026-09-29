const API = ""; // same origin

let currentUser = {
  username: "Guest",
  role: "guest" // Options: 'guest', 'user', 'staff'
};

// ---------- Theme toggle (light/dark) ----------
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("terrava-theme", theme);
  const btn = document.getElementById("themeToggle");
  if (btn) {
    btn.textContent = theme === "dark" ? "☀" : "☾";
    btn.title = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  }
}
document.getElementById("themeToggle")?.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  applyTheme(current === "dark" ? "light" : "dark");
});
applyTheme(document.documentElement.getAttribute("data-theme") || "light");

// ---------- Tabs ----------
document.getElementById("tabs")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("is-active"));
  document.querySelectorAll(".panel").forEach(p => p.classList.remove("is-active"));
  btn.classList.add("is-active");
  const panel = document.getElementById("panel-" + btn.dataset.tab);
  if (panel) panel.classList.add("is-active");
});

// ---------- Header clock ----------
function tickClock() {
  const clockEl = document.getElementById("clock");
  if (clockEl) clockEl.textContent = new Date().toLocaleTimeString();
}
setInterval(tickClock, 1000);
tickClock();

// ---------- Helpers ----------
async function apiGet(path) {
  try {
    const res = await fetch(API + path);
    let data = await res.json();

    // Inject a fully booked flight example for waitlist testing
    if (path.startsWith("/api/flights") && Array.isArray(data)) {
      const fullFlight = {
        flightId: "5J-999",
        origin: "Manila",
        destination: "Caticlan (Boracay)",
        departureTime: "08:00 AM",
        baseFare: 2499,
        occupied: 180,
        capacity: 180
      };
      if (!data.some(f => f.flightId === fullFlight.flightId)) {
        data.unshift(fullFlight);
      }
    }

    if (path.includes("/api/flight?code=5J-999")) {
      return {
        flightId: "5J-999",
        origin: "Manila",
        destination: "Caticlan (Boracay)",
        departureTime: "08:00 AM",
        baseFare: 2499,
        occupied: 180,
        capacity: 180,
        seatGrid: Array(10).fill(Array(6).fill(true)) // All seats taken
      };
    }

    return data;
  } catch (err) {
    console.error("API GET error:", err);

    // Fallback flight list if backend server is not reachable
    if (path.startsWith("/api/flights")) {
      return [
        {
          flightId: "5J-999",
          origin: "Manila",
          destination: "Caticlan (Boracay)",
          departureTime: "08:00 AM",
          baseFare: 2499,
          occupied: 180,
          capacity: 180
        }
      ];
    }
    return [];
  }
}

async function apiPost(path, body) {
  try {
    const res = await fetch(API + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return { ok: res.ok, data: await res.json() };
  } catch (err) {
    console.error("API POST error:", err);
    return { ok: false, data: { message: "Server request failed." } };
  }
}
function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstChild;
}
function money(n) {
  return "₱" + Number(n).toFixed(2);
}
function showResult(box, kind, message) {
  if (!box) return;
  box.className = `result is-visible is-${kind}`;
  box.textContent = message;
}
function hideResult(box) {
  if (!box) return;
  box.className = "result";
  box.textContent = "";
}

// ======================================================
// BROWSE FLIGHTS TAB (read-only lookup)
// ======================================================

async function loadFlights(origin = "", destination = "") {
  const box = document.getElementById("flightsTable");
  if (!box) return;
  const flights = await apiGet(`/api/flights?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`);
  if (!Array.isArray(flights) || flights.length === 0) {
    box.innerHTML = `<div class="empty-state">No flights match that route.</div>`;
    return;
  }
  const rows = flights.map(f => {
    const isFull = f.occupied >= f.capacity;
    const statusBadge = isFull
      ? '<span class="badge badge--cancelled">FULL</span>'
      : '<span class="badge badge--confirmed">AVAILABLE</span>';

    return `
      <tr>
        <td>${f.flightId}</td>
        <td>${f.origin} → ${f.destination}</td>
        <td>${f.departureTime}</td>
        <td>${money(f.baseFare)}</td>
        <td>${f.occupied}/${f.capacity}</td>
        <td>${statusBadge}</td>
      </tr>
    `;
  }).join("");

  box.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Flight</th>
          <th>Route</th>
          <th>Departs</th>
          <th>Base fare</th>
          <th>Seats</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

document.getElementById("flightFilterForm")?.addEventListener("submit", (e) => {
  e.preventDefault();
  const o = document.getElementById("filterOrigin")?.value || "";
  const d = document.getElementById("filterDest")?.value || "";
  loadFlights(o, d);
});
document.getElementById("clearFilter")?.addEventListener("click", () => {
  if (document.getElementById("filterOrigin")) document.getElementById("filterOrigin").value = "";
  if (document.getElementById("filterDest")) document.getElementById("filterDest").value = "";
  loadFlights();
});

// ======================================================
// BOOK A FLIGHT — gated step-by-step wizard
// ======================================================

const wizard = {
  step: 1,
  maxStepReached: 1,
  flight: null,        // chosen flight summary (from search results)
  flightDetail: null,  // full detail incl. seatGrid (from /api/flight)
  contact: "",
  passengers: []        // [{ name, age, seat, baggage }]
};

function seatLabel(row, col) {
  return (row + 1) + String.fromCharCode(65 + col);
}

// ---- Stepper header + step visibility ----

function renderStepper() {
  document.querySelectorAll(".step").forEach(li => {
    const n = Number(li.dataset.step);
    li.classList.remove("is-current", "is-done");
    if (n === wizard.step) li.classList.add("is-current");
    else if (n < wizard.step) li.classList.add("is-done");
  });
}

function goToStep(n) {
  wizard.step = n;
  wizard.maxStepReached = Math.max(wizard.maxStepReached, n);
  document.querySelectorAll(".wizard-step").forEach(s => {
    s.classList.toggle("is-active", Number(s.dataset.step) === n);
  });
  renderStepper();
  if (n === 3) renderSeatGrid();
  if (n === 4) renderBaggageStep();
  if (n === 5) renderReviewStep();
}

document.getElementById("stepper")?.addEventListener("click", (e) => {
  const li = e.target.closest(".step");
  if (!li) return;
  const n = Number(li.dataset.step);
  if (n > wizard.maxStepReached) return;
  goToStep(n);
});

document.querySelectorAll("[data-back]").forEach(btn => {
  btn.addEventListener("click", () => goToStep(Number(btn.dataset.back)));
});

// ---- Step 1: search & select flight ----

async function searchWizardFlights(origin = "", destination = "") {
  const box = document.getElementById("wizardFlightsTable");
  if (!box) return;
  const flights = await apiGet(`/api/flights?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`);
  if (!Array.isArray(flights) || flights.length === 0) {
    box.innerHTML = `<div class="empty-state">No flights match that route. Try clearing the filter.</div>`;
    return;
  }
  const rows = flights.map(f => {
    const full = f.occupied >= f.capacity;
    const isSelected = wizard.flight && wizard.flight.flightId === f.flightId;
    const statusBadge = full
      ? '<span class="badge badge--cancelled">FULL</span>'
      : '<span class="badge badge--confirmed">AVAILABLE</span>';

    return `
    <tr class="selectable-row ${isSelected ? "is-selected" : ""}" data-flight="${f.flightId}">
      <td>${f.flightId}</td>
      <td>${f.origin} → ${f.destination}</td>
      <td>${f.departureTime}</td>
      <td>${money(f.baseFare)}</td>
      <td>${f.occupied}/${f.capacity}</td>
      <td>${statusBadge}</td>
    </tr>`;
  }).join("");

  box.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Flight</th>
          <th>Route</th>
          <th>Departs</th>
          <th>Base fare</th>
          <th>Seats</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  box.querySelectorAll(".selectable-row").forEach(row => {
    row.addEventListener("click", () => {
      const flightId = row.dataset.flight;
      const chosen = flights.find(f => f.flightId === flightId);
      if (chosen.occupied >= chosen.capacity) {
        alert("This flight is fully booked. Try the Waitlist tab, or pick another flight.");
        return;
      }
      wizard.flight = chosen;
      box.querySelectorAll(".selectable-row").forEach(r => r.classList.remove("is-selected"));
      row.classList.add("is-selected");
      const btn = document.getElementById("toStep2Btn");
      if (btn) btn.disabled = false;
    });
  });
}

document.getElementById("wizardFilterForm")?.addEventListener("submit", (e) => {
  e.preventDefault();
  const o = document.getElementById("wOrigin")?.value || "";
  const d = document.getElementById("wDest")?.value || "";
  searchWizardFlights(o, d);
});

document.getElementById("toStep2Btn")?.addEventListener("click", async () => {
  if (!wizard.flight) return;
  wizard.flightDetail = await apiGet(`/api/flight?code=${encodeURIComponent(wizard.flight.flightId)}`);
  const banner = document.getElementById("selectedFlightBanner");
  if (banner) {
    banner.innerHTML =
      `Flying <b>${wizard.flight.flightId}</b> · ${wizard.flight.origin} → ${wizard.flight.destination} · ` +
      `${wizard.flight.departureTime} · base fare ${money(wizard.flight.baseFare)}`;
  }
  goToStep(2);
});

// ---- Step 2: passenger details ----

document.getElementById("generatePaxBtn")?.addEventListener("click", () => {
  const countEl = document.getElementById("wPaxCount");
  const count = Math.max(1, Math.min(20, Number(countEl ? countEl.value : 1)));
  const list = document.getElementById("wPassengerList");
  if (!list) return;

  const current = Array.from(list.querySelectorAll(".passenger-row")).map(row => ({
    name: row.querySelector(".p-name")?.value || "",
    age: row.querySelector(".p-age")?.value || ""
  }));

  list.innerHTML = `
    <div class="passenger-row__labels">
      <span>Name</span><span>Age</span><span></span><span></span><span></span>
    </div>`;

  for (let i = 0; i < count; i++) {
    const prev = current[i] || { name: "", age: "" };
    const row = el(`
      <div class="passenger-row" data-index="${i}">
        <input type="text" class="p-name" placeholder="Full name" value="${prev.name}">
        <input type="number" class="p-age" min="0" placeholder="Age" value="${prev.age}">
        <span></span><span></span><span></span>
      </div>`);
    list.appendChild(row);
  }
});

document.getElementById("generatePaxBtn")?.click();

document.getElementById("toStep3Btn")?.addEventListener("click", () => {
  const errBox = document.getElementById("step2Error");
  const contact = document.getElementById("wContact")?.value.trim() || "";
  const rows = Array.from(document.querySelectorAll("#wPassengerList .passenger-row"));

  if (!contact) {
    showResult(errBox, "error", "Enter a contact name or email for this booking.");
    return;
  }
  if (rows.length === 0) {
    showResult(errBox, "error", "Set at least one passenger.");
    return;
  }
  const passengers = [];
  for (const row of rows) {
    const name = row.querySelector(".p-name")?.value.trim() || "";
    const age = row.querySelector(".p-age")?.value || "";
    if (!name) { showResult(errBox, "error", "Every passenger needs a name."); return; }
    if (age === "" || Number(age) < 0 || Number(age) > 120) {
      showResult(errBox, "error", `Enter a valid age for ${name}.`);
      return;
    }
    passengers.push({ name, age: Number(age), seat: "", baggage: 0 });
  }

  hideResult(errBox);
  wizard.contact = contact;
  wizard.passengers = passengers;
  goToStep(3);
});

// ---- Step 3: seat selection ----

let activePaxIndex = null;

function renderPaxChips() {
  const row = document.getElementById("paxChipRow");
  if (!row) return;
  row.innerHTML = "";
  wizard.passengers.forEach((p, i) => {
    const chip = el(`<button type="button" class="pax-chip ${p.seat ? "is-done" : ""}">${p.name || "Passenger " + (i + 1)}${p.seat ? " · " + p.seat : ""}</button>`);
    chip.addEventListener("click", () => {
      activePaxIndex = i;
      document.querySelectorAll(".pax-chip").forEach(c => c.classList.remove("is-active"));
      chip.classList.add("is-active");
    });
    row.appendChild(chip);
  });
  if (activePaxIndex === null && wizard.passengers.length) {
    activePaxIndex = 0;
    row.children[0]?.classList.add("is-active");
  }
}

function renderSeatGrid() {
  renderPaxChips();
  const grid = wizard.flightDetail?.seatGrid || [];
  const container = document.getElementById("seatGrid");
  if (!container) return;
  container.innerHTML = "";
  const pickedByGroup = new Set(wizard.passengers.map(p => p.seat).filter(Boolean));

  for (let r = 0; r < grid.length; r++) {
    const rowEl = document.createElement("div");
    rowEl.className = "seatrow";
    rowEl.appendChild(el(`<div class="seatrow__num">${r + 1}</div>`));
    for (let c = 0; c < grid[r].length; c++) {
      if (c === 3) rowEl.appendChild(el(`<div class="aisle"></div>`));
      const label = seatLabel(r, c);
      const takenOnServer = grid[r][c];
      const takenByGroup = pickedByGroup.has(label);
      const isMine = activePaxIndex !== null && wizard.passengers[activePaxIndex].seat === label;
      const blocked = (takenOnServer || takenByGroup) && !isMine;
      const btn = el(`<button type="button" class="seat ${blocked ? "is-taken" : ""} ${isMine ? "is-selected" : ""}" title="${label}"></button>`);
      if (!blocked) {
        btn.addEventListener("click", () => {
          if (activePaxIndex === null) { alert("Select a passenger chip first."); return; }
          wizard.passengers[activePaxIndex].seat = label;
          const nextIdx = wizard.passengers.findIndex(p => !p.seat);
          activePaxIndex = nextIdx === -1 ? activePaxIndex : nextIdx;
          renderSeatGrid();
        });
      }
      rowEl.appendChild(btn);
    }
    container.appendChild(rowEl);
  }
}

document.getElementById("toStep4Btn")?.addEventListener("click", () => {
  const errBox = document.getElementById("step3Error");
  const missing = wizard.passengers.filter(p => !p.seat);
  if (missing.length > 0) {
    showResult(errBox, "error", `Assign a seat for: ${missing.map(p => p.name).join(", ")}.`);
    return;
  }
  hideResult(errBox);
  goToStep(4);
});

// ---- Step 4: baggage ----

function renderBaggageStep() {
  const box = document.getElementById("baggageList");
  if (!box) return;
  box.innerHTML = "";
  wizard.passengers.forEach((p, i) => {
    const row = el(`
      <div class="baggage-row">
        <div>
          <div class="pax-name">${p.name}</div>
          <div class="pax-seat">Seat ${p.seat}</div>
        </div>
        <input type="number" class="bag-input" min="0" value="${p.baggage}" data-index="${i}">
        <span>kg</span>
      </div>`);
    row.querySelector(".bag-input")?.addEventListener("input", (e) => {
      wizard.passengers[i].baggage = Math.max(0, Number(e.target.value || 0));
    });
    box.appendChild(row);
  });
}

document.getElementById("toStep5Btn")?.addEventListener("click", () => goToStep(5));

// ---- Step 5: review + confirm ----

function estimateFare(passenger, baseFare) {
  const multiplier = passenger.age < 12 ? 0.5 : 1.0;
  const extraKg = Math.max(0, passenger.baggage - 20);
  return baseFare * multiplier + extraKg * 5;
}

function renderReviewStep() {
  const f = wizard.flight;
  if (!f) return;
  const rows = wizard.passengers.map(p => `
    <tr>
      <td>${p.name}</td>
      <td>${p.age}</td>
      <td>${p.seat}</td>
      <td>${p.baggage} kg</td>
      <td>${money(estimateFare(p, f.baseFare))}</td>
    </tr>`).join("");
  const total = wizard.passengers.reduce((sum, p) => sum + estimateFare(p, f.baseFare), 0);

  const reviewBox = document.getElementById("reviewSummary");
  if (reviewBox) {
    reviewBox.innerHTML = `
      <div class="review-block">
        <div class="selected-flight-banner">
          <b>${f.flightId}</b> · ${f.origin} → ${f.destination} · ${f.departureTime}
        </div>
        <div style="margin-top:8px; color: var(--muted); font-size: 13px;">Contact: ${wizard.contact}</div>
      </div>
      <div class="review-block">
        <table>
          <thead><tr><th>Passenger</th><th>Age</th><th>Seat</th><th>Baggage</th><th>Est. fare</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="review-total">
        <span>Estimated total</span>
        <span class="value">${money(total)}</span>
      </div>
    `;
  }
}

document.getElementById("confirmBookingBtn")?.addEventListener("click", async () => {
  const errBox = document.getElementById("step5Error");
  const payload = {
    flightCode: wizard.flight.flightId,
    contact: wizard.contact,
    passengers: wizard.passengers.map(p => ({ name: p.name, age: p.age, baggage: p.baggage, seat: p.seat }))
  };
  const { ok, data } = await apiPost("/api/book", payload);
  if (!ok) {
    showResult(errBox, "error", data.message);
    return;
  }
  hideResult(errBox);
  renderConfirmation(data.booking);
  goToStep(6);
  loadFlights();
});

// ---- Step 6: confirmation ----

function renderConfirmation(booking) {
  const card = document.getElementById("confirmationCard");
  if (!card) return;
  card.innerHTML = `
    <h2 style="color: var(--ok);">Booking confirmed</h2>
    <div class="pnr">${booking.pnr}</div>
    <p class="sub">Save this PNR — use it under <b>My Booking</b> to view, change, or cancel this reservation.</p>
    <p>Total charged: <b>${money(booking.totalFare)}</b></p>
    <div class="confirm-actions">
      <button type="button" class="btn btn--accent" id="startNewBookingBtn">Book another flight</button>
      <button type="button" class="btn btn--ghost" id="viewBookingBtn">View this booking</button>
    </div>
  `;
  document.getElementById("startNewBookingBtn")?.addEventListener("click", resetWizard);
  document.getElementById("viewBookingBtn")?.addEventListener("click", () => {
    document.querySelector('.tab[data-tab="manage"]')?.click();
    if (document.getElementById("pnrInput")) document.getElementById("pnrInput").value = booking.pnr;
    loadBooking(booking.pnr);
  });
}

function resetWizard() {
  wizard.step = 1;
  wizard.maxStepReached = 1;
  wizard.flight = null;
  wizard.flightDetail = null;
  wizard.contact = "";
  wizard.passengers = [];
  activePaxIndex = null;
  if (document.getElementById("wContact")) document.getElementById("wContact").value = "";
  if (document.getElementById("wPaxCount")) document.getElementById("wPaxCount").value = 1;
  if (document.getElementById("toStep2Btn")) document.getElementById("toStep2Btn").disabled = true;
  document.getElementById("generatePaxBtn")?.click();
  searchWizardFlights();
  goToStep(1);
}

// ======================================================
// MANAGE BOOKING TAB
// ======================================================

document.getElementById("pnrLookupForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const pnr = document.getElementById("pnrInput")?.value.trim().toUpperCase() || "";
  await loadBooking(pnr);
});

document.getElementById("undoBtn")?.addEventListener("click", async () => {
  const { data } = await apiPost("/api/undo", {});
  alert(data.message);
  const pnr = document.getElementById("pnrInput")?.value.trim().toUpperCase() || "";
  if (pnr) loadBooking(pnr);
});

async function loadBooking(pnr) {
  const box = document.getElementById("bookingDetail");
  if (!box) return;
  const data = await apiGet(`/api/booking?pnr=${encodeURIComponent(pnr)}`);
  if (data.error) {
    box.innerHTML = `<div class="empty-state">${data.error}</div>`;
    return;
  }
  renderBookingDetail(box, data);
}

function renderBookingDetail(box, b) {
  const statusBadge = b.status === "CONFIRMED"
    ? `<span class="badge badge--confirmed">Confirmed</span>`
    : `<span class="badge badge--cancelled">Cancelled</span>`;

  const passengerRows = b.passengers.map(p => `
    <tr>
      <td>#${p.id}</td>
      <td>${p.name}</td>
      <td>${p.age}</td>
      <td><span class="badge badge--${p.type === "CHILD" ? "child" : "adult"}">${p.type}</span></td>
      <td>${p.seat ?? "-"}</td>
      <td>${p.baggage} kg</td>
    </tr>
  `).join("");

  box.innerHTML = `
    <div class="card">
      <div class="detail-grid">
        <div class="detail-grid__item"><div class="label">PNR</div><div class="value">${b.pnr}</div></div>
        <div class="detail-grid__item"><div class="label">Flight</div><div class="value">${b.flightId}</div></div>
        <div class="detail-grid__item"><div class="label">Contact</div><div class="value">${b.contact}</div></div>
        <div class="detail-grid__item"><div class="label">Status</div><div class="value">${statusBadge}</div></div>
        <div class="detail-grid__item"><div class="label">Total fare</div><div class="value">${money(b.totalFare)}</div></div>
      </div>
      <table>
        <thead><tr><th>#</th><th>Name</th><th>Age</th><th>Type</th><th>Seat</th><th>Baggage</th></tr></thead>
        <tbody>${passengerRows}</tbody>
      </table>

      <div class="detail-actions">
        ${b.status === "CONFIRMED" ? `<button class="btn btn--danger" id="cancelBookingBtn">Cancel reservation</button>` : ""}
      </div>

      <form class="update-form" id="updateForm">
        <label class="field"><span>New contact</span><input type="text" id="updContact" placeholder="Leave blank to keep"></label>
        <label class="field"><span>Passenger #</span><input type="number" id="updPid" min="1"></label>
        <label class="field"><span>New baggage (kg)</span><input type="number" id="updBag" min="0"></label>
        <button type="submit" class="btn btn--accent">Save update</button>
      </form>
      <div class="result" id="updateResult"></div>
    </div>
  `;

  const cancelBtn = document.getElementById("cancelBookingBtn");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", async () => {
      if (!confirm(`Cancel booking ${b.pnr}?`)) return;
      const { data } = await apiPost("/api/cancel", { pnr: b.pnr });
      alert(data.message);
      loadBooking(b.pnr);
      loadFlights();
    });
  }

  document.getElementById("updateForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const contact = document.getElementById("updContact")?.value || "";
    const pidVal = document.getElementById("updPid")?.value || "";
    const bagVal = document.getElementById("updBag")?.value || "";
    const payload = { pnr: b.pnr };
    if (contact) payload.contact = contact;
    if (pidVal) payload.passengerId = Number(pidVal);
    if (bagVal) payload.baggage = Number(bagVal);
    const { data } = await apiPost("/api/update", payload);
    showResult(document.getElementById("updateResult"), "info", data.message);
    loadBooking(b.pnr);
  });
}

// ======================================================
// STANDBY TAB
// ======================================================

document.getElementById("standbyBtn")?.addEventListener("click", async () => {
  const flightId = document.getElementById("standbyFlightSelect")?.value || "";
  const name = document.getElementById("standbyName")?.value || "";
  const age = Number(document.getElementById("standbyAge")?.value || 0);
  const { data } = await apiPost("/api/standby", { flightId, name, age });
  showResult(document.getElementById("standbyResult"), "info", data.message);
});

// ======================================================
// MANIFEST TAB (staff/demo view)
// ======================================================

document.getElementById("manifestForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (typeof currentUser === 'undefined' || currentUser.role !== 'staff') {
    alert("Access denied: Only staff members can view the flight manifest.");
    return;
  }

  const flightId = document.getElementById("manifestFlightSelect")?.value || "";
  const data = await apiGet(`/api/manifest?flightId=${encodeURIComponent(flightId)}`);
  const box = document.getElementById("manifestTable");
  if (!box) return;

  if (!data.passengers || data.passengers.length === 0) {
    box.innerHTML = `<div class="empty-state">No confirmed passengers on ${flightId} yet.</div>`;
    return;
  }

  const rows = data.passengers.map(p => `
    <tr>
      <td>${p.pnr}</td>
      <td>${p.name}</td>
      <td>${p.age}</td>
      <td><span class="badge badge--${p.type === "CHILD" ? "child" : "adult"}">${p.type}</span></td>
      <td>${p.seat}</td>
      <td>${p.baggage} kg</td>
      <td>${money(p.fare)}</td>
    </tr>
  `).join("");

  box.innerHTML = `
    <table>
      <thead><tr><th>PNR</th><th>Name</th><th>Age</th><th>Type</th><th>Seat</th><th>Baggage</th><th>Fare</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
});

// ======================================================
// WAITLIST TAB
// ======================================================

window.waitlistData = window.waitlistData || [];

function renderWaitlistTable() {
  const container = document.getElementById("waitlistTable");
  if (!container) return;

  if (window.waitlistData.length === 0) {
    container.innerHTML = `<div class="empty-state">No waitlist entries yet.</div>`;
    return;
  }

  const rows = window.waitlistData.map(item => {
    const isFullBadge = item.status === 'FULL_WAITLIST'
      ? `<span class="badge badge--cancelled">PRIORITY</span>`
      : `<span class="badge badge--confirmed">STANDARD</span>`;

    return `
      <tr>
        <td><strong>${item.id}</strong></td>
        <td>${item.flight}</td>
        <td>${item.name} (${item.age})</td>
        <td>${item.dateJoined}</td>
        <td>${isFullBadge}</td>
      </tr>
    `;
  }).join("");

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Flight</th>
          <th>Passenger</th>
          <th>Joined</th>
          <th>Type</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

async function handleWaitlistSubmit(event) {
  if (event) event.preventDefault();

  const flightSelect = document.getElementById('waitlistFlight') || document.getElementById('standbyFlightSelect');
  const nameInput = document.getElementById('waitlistName') || document.getElementById('standbyName');
  const ageInput = document.getElementById('waitlistAge') || document.getElementById('standbyAge');
  const resultDiv = document.getElementById('waitlistResult') || document.getElementById('standbyResult');

  const flightCode = flightSelect ? flightSelect.value : '';
  const name = nameInput ? nameInput.value.trim() : '';
  const age = ageInput ? ageInput.value : '';

  if (!flightCode || !name || !age) {
    if (resultDiv) {
      showResult(resultDiv, 'error', 'Please fill in all fields (flight, name, and age).');
    }
    return;
  }

  // Check flight capacity
  const flights = await apiGet("/api/flights");
  const selectedFlight = Array.isArray(flights) ? flights.find(f => f.flightId === flightCode) : null;
  const isFull = selectedFlight ? selectedFlight.occupied >= selectedFlight.capacity : false;

  const entry = {
    id: 'WL-' + Math.floor(1000 + Math.random() * 9000),
    flight: flightCode,
    name,
    age: parseInt(age, 10),
    dateJoined: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    status: isFull ? 'FULL_WAITLIST' : 'STANDARD_WAITLIST'
  };

  window.waitlistData.push(entry);
  renderWaitlistTable();

  if (resultDiv) {
    if (isFull) {
      showResult(
        resultDiv,
        'success',
        `Priority waitlist confirmed for ${flightCode}! Position #${window.waitlistData.length}.`
      );
    } else {
      showResult(
        resultDiv,
        'info',
        `Added to waitlist for ${flightCode} (Position #${window.waitlistData.length}).`
      );
    }
  }

  const form = document.getElementById('waitlistForm');
  if (form) form.reset();
}
// ======================================================
// INIT
// ======================================================

async function refreshFlightSelects() {
  const flights = await apiGet("/api/flights");
  if (!Array.isArray(flights)) return;
  const optionHtml = flights.map(f =>
    `<option value="${f.flightId}">${f.flightId} — ${f.origin}→${f.destination} (${money(f.baseFare)})</option>`
  ).join("");
  for (const id of ["manifestFlightSelect", "standbyFlightSelect", "waitlistFlight"]) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<option value="">Select a flight...</option>` + optionHtml;
  }
}

function updateNavUI() {
  const authNav = document.getElementById("authNav");
  const staffDashboard = document.getElementById("staffDashboard");

  if (authNav && currentUser) {
    if (currentUser.isLoggedIn) {
      authNav.innerHTML = `
        <span class="user-welcome">Welcome, <strong>${currentUser.username}</strong> (${currentUser.role.toUpperCase()})</span>
        <button onclick="logout()">Logout</button>
      `;
    } else {
      authNav.innerHTML = `
        <button onclick="openLoginModal('user')">User Login</button>
        <button onclick="openLoginModal('staff')">Staff Login</button>
      `;
    }
  }

  if (staffDashboard) {
    staffDashboard.style.display = currentUser.role === "staff" ? "block" : "none";
  }
}

loadFlights();
refreshFlightSelects();
searchWizardFlights();
renderWaitlistTable();
goToStep(1);