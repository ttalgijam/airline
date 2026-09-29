import java.util.ArrayList;
import java.util.List;
import java.util.Scanner;

/**
 * Module 1: Driver & Navigation Methods.
 */
public class Main {
    private static final Scanner scanner = new Scanner(System.in);
    private static final BookingManager manager = new BookingManager();

    public static void main(String[] args) {
        manager.loadSampleFlights();
        System.out.println("=== Terrava: Airline Ticket Reservation System ===");
        boolean running = true;
        while (running) {
            displayMainMenu();
            int choice = getUserChoice();
            switch (choice) {
                case 1 -> handleSearchAndSortFlights();
                case 2 -> handleAddPassengerGroup();
                case 3 -> handleSearchBookingByPNR();
                case 4 -> handleUpdateBooking();
                case 5 -> handleCancelReservation();
                case 6 -> handleUndoCancellation();
                case 7 -> handleDisplayManifest();
                case 8 -> handleJoinStandby();
                case 9 -> handleViewSeatMap();
                case 0 -> {
                    running = false;
                    System.out.println("Goodbye!");
                }
                default -> System.out.println("Invalid option, try again.");
            }
        }
        scanner.close();
    }

    private static void displayMainMenu() {
        System.out.println("\n--- Main Menu ---");
        System.out.println("1. Search & sort flights");
        System.out.println("2. Book passenger group (new PNR)");
        System.out.println("3. Search booking by PNR");
        System.out.println("4. Update booking");
        System.out.println("5. Cancel reservation");
        System.out.println("6. Undo last cancellation");
        System.out.println("7. Display flight manifest");
        System.out.println("8. Join standby queue (full flight)");
        System.out.println("9. View seat map");
        System.out.println("0. Exit");
        System.out.print("Choose an option: ");
    }

    private static int getUserChoice() {
        String line = scanner.nextLine().trim();
        try {
            return Integer.parseInt(line);
        } catch (NumberFormatException e) {
            return -1;
        }
    }

    private static String prompt(String label) {
        System.out.print(label);
        return scanner.nextLine().trim();
    }

    private static int promptInt(String label, int defaultVal) {
        String s = prompt(label);
        if (s.isBlank()) return defaultVal;
        try { return Integer.parseInt(s); } catch (NumberFormatException e) { return defaultVal; }
    }

    private static double promptDouble(String label, double defaultVal) {
        String s = prompt(label);
        if (s.isBlank()) return defaultVal;
        try { return Double.parseDouble(s); } catch (NumberFormatException e) { return defaultVal; }
    }

    // ---------- Menu handlers ----------

    private static void handleSearchAndSortFlights() {
        String origin = prompt("Origin (blank = any): ");
        String dest = prompt("Destination (blank = any): ");
        List<Flight> results = manager.searchAndSortFlights(origin, dest);
        if (results.isEmpty()) {
            System.out.println("No matching flights.");
            return;
        }
        System.out.println("Results (sorted by fare, ascending):");
        for (Flight f : results) System.out.println("  " + f);
    }

    private static void handleAddPassengerGroup() {
        String flightCode = prompt("Flight code (e.g. PR101): ");
        Flight flight = manager.findFlightById(flightCode);
        if (flight == null) {
            System.out.println("Flight not found.");
            return;
        }
        String contact = prompt("Primary contact (name or email): ");
        int count = promptInt("Number of passengers in this group: ", 1);

        List<BookingManager.PassengerInput> group = new ArrayList<>();
        for (int i = 1; i <= count; i++) {
            System.out.println(" -- Passenger " + i + " --");
            BookingManager.PassengerInput pi = new BookingManager.PassengerInput();
            pi.fullName = prompt("  Full name: ");
            pi.age = promptInt("  Age: ", 0);
            pi.baggageWeightKg = promptDouble("  Baggage weight kg (0-20 free): ", 0);
            System.out.print(flight.renderSeatGrid());
            String seat = prompt("  Preferred seat (e.g. 5C, blank = auto-assign): ");
            pi.preferredSeat = seat.isBlank() ? null : seat;
            group.add(pi);
        }

        BookingManager.BookingResult result = manager.addPassengerGroup(flightCode, contact, group);
        System.out.println(result.message);
        if (result.success) {
            System.out.println(result.booking);
            for (Passenger p : result.booking.getPassengers()) System.out.println("  " + p);
        } else {
            System.out.println("(Tip: option 8 lets a passenger join the standby queue if the flight is full.)");
        }
    }

    private static void handleSearchBookingByPNR() {
        String pnr = prompt("Enter PNR: ").toUpperCase();
        Booking b = manager.searchBookingByPNR(pnr);
        if (b == null) {
            System.out.println("No booking found for PNR " + pnr);
            return;
        }
        System.out.println(b);
        for (Passenger p : b.getPassengers()) System.out.println("  " + p);
    }

    private static void handleUpdateBooking() {
        String pnr = prompt("Enter PNR: ").toUpperCase();
        Booking b = manager.searchBookingByPNR(pnr);
        if (b == null) {
            System.out.println("No booking found for PNR " + pnr);
            return;
        }
        System.out.println(b);
        for (Passenger p : b.getPassengers()) System.out.println("  " + p);

        String newContact = prompt("New primary contact (blank = keep current): ");
        String pidStr = prompt("Passenger # to update baggage (blank = skip): ");
        Integer pid = null;
        Double newBag = null;
        if (!pidStr.isBlank()) {
            try {
                pid = Integer.parseInt(pidStr);
                newBag = promptDouble("New baggage weight kg: ", 0);
            } catch (NumberFormatException ignored) { }
        }
        String result = manager.updateBooking(pnr, pid, newContact.isBlank() ? null : newContact, newBag);
        System.out.println(result);
    }

    private static void handleCancelReservation() {
        String pnr = prompt("Enter PNR to cancel: ").toUpperCase();
        System.out.println(manager.cancelReservation(pnr));
    }

    private static void handleUndoCancellation() {
        System.out.println(manager.undoCancellation());
    }

    private static void handleDisplayManifest() {
        String flightCode = prompt("Flight code: ");
        System.out.print(manager.displayManifest(flightCode));
    }

    private static void handleJoinStandby() {
        String flightCode = prompt("Flight code: ");
        String name = prompt("Passenger name: ");
        int age = promptInt("Age: ", 0);
        System.out.println(manager.joinStandby(flightCode, name, age));
    }

    private static void handleViewSeatMap() {
        String flightCode = prompt("Flight code: ");
        Flight f = manager.findFlightById(flightCode);
        if (f == null) {
            System.out.println("Flight not found.");
            return;
        }
        System.out.print(f.renderSeatGrid());
    }
}