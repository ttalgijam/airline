import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Web front end for the same BookingManager used by the console app (Main.java).
 * Uses only classes bundled with the JDK (com.sun.net.httpserver) so there is
 * still nothing to install beyond a JDK — same "javac *.java" workflow.
 *
 * Run from the project root (the folder that contains both src/ and web/):
 *   javac -d out src/*.java
 *   java -cp out WebServer
 * Then open http://localhost:8080 in a browser.
 */
public class WebServer {

    private static final BookingManager manager = new BookingManager();
    private static final int PORT = 8080;
    private static final String WEB_ROOT = "web"; // static files live here, sibling to src/

    public static void main(String[] args) throws IOException {
        manager.loadSampleFlights();

        HttpServer server = HttpServer.create(new InetSocketAddress(PORT), 0);

        server.createContext("/api/flights", WebServer::handleFlights);
        server.createContext("/api/flight", WebServer::handleFlight);
        server.createContext("/api/book", WebServer::handleBook);
        server.createContext("/api/booking", WebServer::handleBooking);
        server.createContext("/api/update", WebServer::handleUpdate);
        server.createContext("/api/cancel", WebServer::handleCancel);
        server.createContext("/api/undo", WebServer::handleUndo);
        server.createContext("/api/manifest", WebServer::handleManifest);
        server.createContext("/api/standby", WebServer::handleStandby);
        server.createContext("/", WebServer::handleStatic);

        server.setExecutor(null);
        server.start();
        System.out.println("Terrava web server running: http://localhost:" + PORT);
    }

    // ---------- API handlers ----------

    private static void handleFlights(HttpExchange ex) throws IOException {
        if (!method(ex, "GET")) return;
        Map<String, String> q = queryParams(ex);
        List<Flight> flights = manager.searchAndSortFlights(q.get("origin"), q.get("destination"));
        List<Object> arr = new ArrayList<>();
        for (Flight f : flights) arr.add(flightSummary(f));
        sendJson(ex, 200, arr);
    }

    private static void handleFlight(HttpExchange ex) throws IOException {
        if (!method(ex, "GET")) return;
        Map<String, String> q = queryParams(ex);
        Flight f = manager.findFlightById(q.get("code"));
        if (f == null) { sendJson(ex, 404, error("Flight not found")); return; }
        Map<String, Object> body = flightSummary(f);
        body.put("seatGrid", f.getSeatGrid());
        sendJson(ex, 200, body);
    }

    @SuppressWarnings("unchecked")
    private static void handleBook(HttpExchange ex) throws IOException {
        if (!method(ex, "POST")) return;
        Map<String, Object> req = readJsonBody(ex);
        String flightCode = Json.getString(req, "flightCode");
        String contact = Json.getString(req, "contact");
        List<Object> passengersRaw = Json.getList(req, "passengers");

        List<BookingManager.PassengerInput> group = new ArrayList<>();
        for (Object o : passengersRaw) {
            Map<String, Object> pm = (Map<String, Object>) o;
            BookingManager.PassengerInput pi = new BookingManager.PassengerInput();
            pi.fullName = Json.getString(pm, "name");
            pi.age = Json.getInt(pm, "age", 0);
            pi.baggageWeightKg = Json.getDouble(pm, "baggage", 0);
            String seat = Json.getString(pm, "seat");
            pi.preferredSeat = (seat == null || seat.isBlank()) ? null : seat;
            group.add(pi);
        }

        BookingManager.BookingResult result = manager.addPassengerGroup(flightCode, contact, group);
        Map<String, Object> resp = Json.obj();
        resp.put("success", result.success);
        resp.put("message", result.message);
        if (result.success) resp.put("booking", bookingDetail(result.booking));
        sendJson(ex, result.success ? 200 : 400, resp);
    }

    private static void handleBooking(HttpExchange ex) throws IOException {
        if (!method(ex, "GET")) return;
        Map<String, String> q = queryParams(ex);
        String pnr = q.getOrDefault("pnr", "").toUpperCase();
        Booking b = manager.searchBookingByPNR(pnr);
        if (b == null) { sendJson(ex, 404, error("Booking not found")); return; }
        sendJson(ex, 200, bookingDetail(b));
    }

    private static void handleUpdate(HttpExchange ex) throws IOException {
        if (!method(ex, "POST")) return;
        Map<String, Object> req = readJsonBody(ex);
        String pnr = Json.getString(req, "pnr");
        String contact = Json.getString(req, "contact");
        Object pidObj = req.get("passengerId");
        Integer pid = (pidObj instanceof Number n) ? n.intValue() : null;
        Object bagObj = req.get("baggage");
        Double bag = (bagObj instanceof Number n) ? n.doubleValue() : null;
        String message = manager.updateBooking(pnr, pid, contact, bag);
        Map<String, Object> resp = Json.obj();
        resp.put("message", message);
        sendJson(ex, 200, resp);
    }

    private static void handleCancel(HttpExchange ex) throws IOException {
        if (!method(ex, "POST")) return;
        Map<String, Object> req = readJsonBody(ex);
        String pnr = Json.getString(req, "pnr");
        String message = manager.cancelReservation(pnr);
        Map<String, Object> resp = Json.obj();
        resp.put("message", message);
        sendJson(ex, 200, resp);
    }

    private static void handleUndo(HttpExchange ex) throws IOException {
        if (!method(ex, "POST")) return;
        String message = manager.undoCancellation();
        Map<String, Object> resp = Json.obj();
        resp.put("message", message);
        sendJson(ex, 200, resp);
    }

    private static void handleManifest(HttpExchange ex) throws IOException {
        if (!method(ex, "GET")) return;
        Map<String, String> q = queryParams(ex);
        String flightId = q.get("flightId");
        Flight f = manager.findFlightById(flightId);
        if (f == null) { sendJson(ex, 404, error("Flight not found")); return; }

        List<Object> rows = new ArrayList<>();
        for (Booking b : manager.getBookings()) {
            if (!b.getFlightId().equalsIgnoreCase(flightId)) continue;
            if (b.getStatus() == Booking.Status.CANCELLED) continue;
            for (Passenger p : b.getPassengers()) {
                Map<String, Object> row = Json.obj();
                row.put("pnr", b.getPnr());
                row.put("name", p.getFullName());
                row.put("age", p.getAge());
                row.put("type", p.getType().toString());
                row.put("seat", p.getAssignedSeat());
                row.put("baggage", p.getBaggageWeightKg());
                row.put("fare", round2(p.calculateFare(f.getBaseFare())));
                rows.add(row);
            }
        }
        Map<String, Object> resp = Json.obj();
        resp.put("flight", flightSummary(f));
        resp.put("passengers", rows);
        sendJson(ex, 200, resp);
    }

    private static void handleStandby(HttpExchange ex) throws IOException {
        if (!method(ex, "POST")) return;
        Map<String, Object> req = readJsonBody(ex);
        String flightId = Json.getString(req, "flightId");
        String name = Json.getString(req, "name");
        int age = Json.getInt(req, "age", 0);
        String message = manager.joinStandby(flightId, name, age);
        Map<String, Object> resp = Json.obj();
        resp.put("message", message);
        sendJson(ex, 200, resp);
    }

    // ---------- JSON shape helpers ----------

    private static Map<String, Object> flightSummary(Flight f) {
        Map<String, Object> m = Json.obj();
        m.put("flightId", f.getFlightId());
        m.put("origin", f.getOrigin());
        m.put("destination", f.getDestination());
        m.put("departureTime", f.getDepartureTime());
        m.put("baseFare", f.getBaseFare());
        m.put("rows", f.getRows());
        m.put("seatsPerRow", f.getSeatsPerRow());
        m.put("capacity", f.getCapacity());
        m.put("occupied", f.getOccupiedCount());
        m.put("standbyCount", f.getStandbyQueue().size());
        return m;
    }

    private static Map<String, Object> bookingDetail(Booking b) {
        Map<String, Object> m = Json.obj();
        m.put("pnr", b.getPnr());
        m.put("flightId", b.getFlightId());
        m.put("contact", b.getPrimaryContact());
        m.put("status", b.getStatus().toString());
        m.put("totalFare", round2(b.getTotalFare()));
        List<Object> passengers = new ArrayList<>();
        for (Passenger p : b.getPassengers()) {
            Map<String, Object> pm = Json.obj();
            pm.put("id", p.getPassengerId());
            pm.put("name", p.getFullName());
            pm.put("age", p.getAge());
            pm.put("type", p.getType().toString());
            pm.put("seat", p.getAssignedSeat());
            pm.put("baggage", p.getBaggageWeightKg());
            passengers.add(pm);
        }
        m.put("passengers", passengers);
        return m;
    }

    private static Map<String, Object> error(String msg) {
        Map<String, Object> m = Json.obj();
        m.put("error", msg);
        return m;
    }

    private static double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }

    // ---------- HTTP plumbing ----------

    private static boolean method(HttpExchange ex, String expected) throws IOException {
        if (!ex.getRequestMethod().equalsIgnoreCase(expected)) {
            sendJson(ex, 405, error("Method not allowed, expected " + expected));
            return false;
        }
        return true;
    }

    private static Map<String, String> queryParams(HttpExchange ex) {
        Map<String, String> params = new HashMap<>();
        String query = ex.getRequestURI().getRawQuery();
        if (query == null) return params;
        for (String pair : query.split("&")) {
            int eq = pair.indexOf('=');
            if (eq < 0) continue;
            String key = URLDecoder.decode(pair.substring(0, eq), StandardCharsets.UTF_8);
            String value = URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8);
            params.put(key, value);
        }
        return params;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> readJsonBody(HttpExchange ex) throws IOException {
        String body = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        if (body.isBlank()) return new LinkedHashMap<>();
        Object parsed = Json.parse(body);
        return parsed instanceof Map ? (Map<String, Object>) parsed : new LinkedHashMap<>();
    }

    private static void sendJson(HttpExchange ex, int status, Object payload) throws IOException {
        byte[] bytes = Json.write(payload).getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        ex.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = ex.getResponseBody()) {
            os.write(bytes);
        }
    }

    // ---------- Static file serving (the web/ folder: index.html, styles.css, app.js) ----------

    private static void handleStatic(HttpExchange ex) throws IOException {
        String path = ex.getRequestURI().getPath();
        if (path.equals("/") || path.isBlank()) path = "/index.html";

        File file = new File(WEB_ROOT, path).getCanonicalFile();
        File root = new File(WEB_ROOT).getCanonicalFile();
        if (!file.getPath().startsWith(root.getPath()) || !file.isFile()) {
            ex.sendResponseHeaders(404, -1);
            return;
        }

        String contentType = guessContentType(file.getName());
        byte[] bytes;
        try (InputStream in = new FileInputStream(file); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            in.transferTo(out);
            bytes = out.toByteArray();
        }
        ex.getResponseHeaders().set("Content-Type", contentType);
        ex.sendResponseHeaders(200, bytes.length);
        try (OutputStream os = ex.getResponseBody()) {
            os.write(bytes);
        }
    }

    private static String guessContentType(String filename) {
        if (filename.endsWith(".html")) return "text/html; charset=utf-8";
        if (filename.endsWith(".css")) return "text/css; charset=utf-8";
        if (filename.endsWith(".js")) return "application/javascript; charset=utf-8";
        if (filename.endsWith(".svg")) return "image/svg+xml";
        return "application/octet-stream";
    }
}