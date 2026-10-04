import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Random;

/**
 * Module 2: Core Operations & System Logic.
 * Owns the master data structures:
 *  - flights: dynamic array (ArrayList) of Flight
 *  - bookings: dynamic array (ArrayList) of Booking, kept SORTED BY PNR so
 *              searchBookingByPNR() can use binary search
 *  - cancellationStack: Stack (ArrayDeque used as a stack) for undo
 *  - each Flight owns its own standby Queue
 */
public class BookingManager {

    private final List<Flight> flights = new ArrayList<>();
    private final List<Booking> bookings = new ArrayList<>(); // kept sorted by PNR
    private final Deque<Booking> cancellationStack = new ArrayDeque<>(); // push/pop = LIFO undo
    private final Random random = new Random();
    private int nextPassengerId = 1;
    private long standbySequence = 1;

    // ---------- Setup / sample data ----------

    public void loadSampleFlights() {
        flights.add(new Flight("PR101", "MNL", "CEB", "2026-09-01 08:30", 2500.0, 20, 6));
        flights.add(new Flight("PR202", "MNL", "DVO", "2026-09-01 11:00", 3200.0, 20, 6));
        flights.add(new Flight("5J303", "CEB", "MNL", "2026-09-02 06:15", 1800.0, 20, 6));
        flights.add(new Flight("5J404", "MNL", "ILO", "2026-09-02 14:45", 2100.0, 15, 6));
    }

    public List<Flight> getFlights() { return flights; }
    public List<Booking> getBookings() { return bookings; }

    public Flight findFlightById(String flightId) {
        for (Flight f : flights) {
            if (f.getFlightId().equalsIgnoreCase(flightId)) return f;
        }
        return null;
    }

    // ---------- Data Validation Algorithm ----------

    public static boolean isPositiveNumber(double value) { return value >= 0; }

    public static boolean isValidAge(int age) { return age >= 0 && age <= 120; }

    public static boolean isNonEmpty(String s) { return s != null && !s.trim().isEmpty(); }

    // ---------- Sorting Algorithms (searchAndSortFlights) ----------

    /** Insertion Sort by base fare, ascending. Returns a new sorted list; does not mutate original order. */
    public List<Flight> insertionSortByFare(List<Flight> input) {
        List<Flight> list = new ArrayList<>(input);
        for (int i = 1; i < list.size(); i++) {
            Flight key = list.get(i);
            int j = i - 1;
            while (j >= 0 && list.get(j).getBaseFare() > key.getBaseFare()) {
                list.set(j + 1, list.get(j));
                j--;
            }
            list.set(j + 1, key);
        }
        return list;
    }

    /** Merge Sort by departure time (lexicographic on the "yyyy-MM-dd HH:mm" string). */
    public List<Flight> mergeSortByDeparture(List<Flight> input) {
        List<Flight> list = new ArrayList<>(input);
        mergeSortHelper(list, 0, list.size() - 1);
        return list;
    }

    private void mergeSortHelper(List<Flight> list, int left, int right) {
        if (left >= right) return;
        int mid = (left + right) / 2;
        mergeSortHelper(list, left, mid);
        mergeSortHelper(list, mid + 1, right);
        merge(list, left, mid, right);
    }

    private void merge(List<Flight> list, int left, int mid, int right) {
        List<Flight> leftPart = new ArrayList<>(list.subList(left, mid + 1));
        List<Flight> rightPart = new ArrayList<>(list.subList(mid + 1, right + 1));
        int i = 0, j = 0, k = left;
        while (i < leftPart.size() && j < rightPart.size()) {
            if (leftPart.get(i).getDepartureTime().compareTo(rightPart.get(j).getDepartureTime()) <= 0) {
                list.set(k++, leftPart.get(i++));
            } else {
                list.set(k++, rightPart.get(j++));
            }
        }
        while (i < leftPart.size()) list.set(k++, leftPart.get(i++));
        while (j < rightPart.size()) list.set(k++, rightPart.get(j++));
    }

    /** Filters by origin/destination (case-insensitive, blank = wildcard), then sorts by fare. */
    public List<Flight> searchAndSortFlights(String origin, String destination) {
        List<Flight> filtered = new ArrayList<>();
        for (Flight f : flights) {
            boolean originOk = origin == null || origin.isBlank() || f.getOrigin().equalsIgnoreCase(origin);
            boolean destOk = destination == null || destination.isBlank() || f.getDestination().equalsIgnoreCase(destination);
            if (originOk && destOk) filtered.add(f);
        }
        return insertionSortByFare(filtered);
    }

    // ---------- Searching Algorithms ----------

    /** Binary Search over bookings, which are kept sorted by PNR. */
    public Booking searchBookingByPNR(String targetPNR) {
        int lo = 0, hi = bookings.size() - 1;
        while (lo <= hi) {
            int mid = (lo + hi) / 2;
            int cmp = bookings.get(mid).getPnr().compareTo(targetPNR);
            if (cmp == 0) return bookings.get(mid);
            else if (cmp < 0) lo = mid + 1;
            else hi = mid - 1;
        }
        return null; // not found
    }

    /** Linear Search across a booking's passenger list by id or (partial, case-insensitive) name. */
    public Passenger searchPassenger(Booking booking, String idOrName) {
        for (Passenger p : booking.getPassengers()) {
            if (String.valueOf(p.getPassengerId()).equals(idOrName)) return p;
        }
        for (Passenger p : booking.getPassengers()) {
            if (p.getFullName().toLowerCase().contains(idOrName.toLowerCase())) return p;
        }
        return null;
    }

    /** Inserts a booking into the PNR-sorted list at the correct position (keeps list sorted for binary search). */
    private void insertBookingSorted(Booking booking) {
        int i = 0;
        while (i < bookings.size() && bookings.get(i).getPnr().compareTo(booking.getPnr()) < 0) {
            i++;
        }
        bookings.add(i, booking);
    }

    private String generatePNR() {
        String chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        String pnr;
        do {
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < 6; i++) sb.append(chars.charAt(random.nextInt(chars.length())));
            pnr = sb.toString();
        } while (searchBookingByPNR(pnr) != null); // ensure uniqueness
        return pnr;
    }

    // ---------- Core CRUD-style operations ----------

    public static class PassengerInput {
        public String fullName;
        public int age;
        public boolean isPwd; // ADDED
        public String preferredSeat;
        public double baggageWeightKg;
    }

    public static class BookingResult {
        public boolean success;
        public String message;
        public Booking booking;
    }

    /** addPassengerGroup(): registers a multi-passenger group under one PNR. */
    public BookingResult addPassengerGroup(String flightCode, String primaryContact, List<PassengerInput> group) {
        BookingResult result = new BookingResult();
        Flight flight = findFlightById(flightCode);
        if (flight == null) {
            result.success = false;
            result.message = "Flight " + flightCode + " not found.";
            return result;
        }
        if (!isNonEmpty(primaryContact)) {
            result.success = false;
            result.message = "Primary contact is required.";
            return result;
        }

        int freeSeats = flight.getCapacity() - flight.getOccupiedCount();
        if (freeSeats < group.size()) {
            result.success = false;
            result.message = "Not enough seats (" + freeSeats + " free, " + group.size()
                    + " requested). Consider joining the standby queue.";
            return result;
        }

        Booking booking = new Booking(generatePNR(), flightCode, primaryContact);
        List<String> claimedSeats = new ArrayList<>();

        for (PassengerInput pi : group) {
            if (!isNonEmpty(pi.fullName) || !isValidAge(pi.age) || !isPositiveNumber(pi.baggageWeightKg)) {
                // roll back any seats claimed so far in this attempt
                for (String s : claimedSeats) flight.freeSeat(s);
                result.success = false;
                result.message = "Invalid passenger data for '" + pi.fullName + "'.";
                return result;
            }

            String seat = pi.preferredSeat;
            if (seat == null || seat.isBlank()) {
                seat = flight.findFirstFreeSeat();
            } else if (!flight.isSeatFree(seat)) {
                for (String s : claimedSeats) flight.freeSeat(s);
                result.success = false;
                result.message = "Seat " + seat + " is already taken.";
                return result;
            }

            flight.occupySeat(seat);
            claimedSeats.add(seat);

            Passenger p = new Passenger(nextPassengerId++, pi.fullName, pi.age, seat, pi.baggageWeightKg);
            booking.getPassengers().add(p);
        }

        booking.recalculateTotalFare(flight.getBaseFare());
        insertBookingSorted(booking);

        result.success = true;
        result.message = "Booking confirmed under PNR " + booking.getPnr();
        result.booking = booking;
        return result;
    }

    /** updateBooking(): edits a passenger's contact/baggage, or the booking's primary contact. */
    public String updateBooking(String pnr, Integer passengerId, String newContact, Double newBaggageKg) {
        Booking b = searchBookingByPNR(pnr);
        if (b == null) return "Booking " + pnr + " not found.";
        if (b.getStatus() == Booking.Status.CANCELLED) return "Booking " + pnr + " is already cancelled.";

        if (newContact != null && isNonEmpty(newContact)) {
            b.setPrimaryContact(newContact);
        }
        if (passengerId != null && newBaggageKg != null) {
            if (!isPositiveNumber(newBaggageKg)) return "Baggage weight must be non-negative.";
            Passenger p = searchPassenger(b, String.valueOf(passengerId));
            if (p == null) return "Passenger #" + passengerId + " not found in booking " + pnr + ".";
            p.setBaggageWeightKg(newBaggageKg);
            Flight f = findFlightById(b.getFlightId());
            if (f != null) b.recalculateTotalFare(f.getBaseFare());
        }
        return "Booking " + pnr + " updated. New total: ₱" + String.format("%.2f", b.getTotalFare());
    }

    /** cancelReservation(): cancels a booking, frees seats, pushes to undo stack, promotes standby if possible. */
    public String cancelReservation(String pnr) {
        Booking b = searchBookingByPNR(pnr);
        if (b == null) return "Booking " + pnr + " not found.";
        if (b.getStatus() == Booking.Status.CANCELLED) return "Booking " + pnr + " is already cancelled.";

        Flight f = findFlightById(b.getFlightId());
        if (f != null) {
            for (Passenger p : b.getPassengers()) {
                if (p.getAssignedSeat() != null) f.freeSeat(p.getAssignedSeat());
            }
        }
        b.setStatus(Booking.Status.CANCELLED);
        cancellationStack.push(b); // LIFO undo log

        StringBuilder msg = new StringBuilder("Booking " + pnr + " cancelled. Refund due: ₱"
        + String.format("%.2f", b.getTotalFare()) + ".");

        // Promote next standby passenger if a seat just opened up
        if (f != null && !f.getStandbyQueue().isEmpty()) {
            StandbyRequest next = f.getStandbyQueue().poll();
            msg.append(" Seat offered to standby passenger: ").append(next).append(".");
        }
        return msg.toString();
    }

    /** undoCancellation(): pops the last cancelled booking and restores seats/status. */
    public String undoCancellation() {
        if (cancellationStack.isEmpty()) return "No cancellations to undo.";
        Booking b = cancellationStack.pop();
        Flight f = findFlightById(b.getFlightId());
        if (f != null) {
            for (Passenger p : b.getPassengers()) {
                if (p.getAssignedSeat() != null) {
                    if (!f.isSeatFree(p.getAssignedSeat())) {
                        return "Cannot undo: seat " + p.getAssignedSeat() + " on " + f.getFlightId()
                                + " has since been reassigned.";
                    }
                }
            }
            for (Passenger p : b.getPassengers()) {
                if (p.getAssignedSeat() != null) f.occupySeat(p.getAssignedSeat());
            }
        }
        b.setStatus(Booking.Status.CONFIRMED);
        return "Restored booking " + b.getPnr() + ".";
    }

/** displayManifest(): tabular list of all confirmed passengers on a flight. */
    public String displayManifest(String flightId) {
        Flight f = findFlightById(flightId);
        if (f == null) return "Flight " + flightId + " not found.";

        StringBuilder sb = new StringBuilder();
        sb.append(String.format("Manifest for Flight %s%n", flightId));
        sb.append(String.format("%-6s %-20s %-5s %-6s %-6s %-8s %-8s%n",
                "PNR", "Name", "Age", "Type", "Seat", "Bag(kg)", "Fare(₱)"));

        for (Booking b : bookings) {
            if (b.getFlightId().equalsIgnoreCase(flightId) && b.getStatus() == Booking.Status.CONFIRMED) {
                for (Passenger p : b.getPassengers()) {
                    sb.append(String.format("%-6s %-20s %-5d %-6s %-6s %-8.1f ₱%-7.2f%n",
                            b.getPnr(), p.getFullName(), p.getAge(), p.getType(),
                            p.getAssignedSeat() != null ? p.getAssignedSeat() : "-",
                            p.getBaggageWeightKg(), p.calculateFare(f.getBaseFare())));
                }
            }
        }
        return sb.toString();
    }
    /** Joins the standby queue for a full flight. */
    public String joinStandby(String flightId, String name, int age) {
        Flight f = findFlightById(flightId);
        if (f == null) return "Flight " + flightId + " not found.";
        if (!f.isFull()) return "Flight " + flightId + " still has open seats — book directly instead.";
        f.getStandbyQueue().add(new StandbyRequest(name, age, standbySequence++));
        return name + " added to standby queue for " + flightId + " (position " + f.getStandbyQueue().size() + ").";
    }
}