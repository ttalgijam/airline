import java.util.ArrayList;
import java.util.List;

public class Booking {
    public enum Status { CONFIRMED, CANCELLED }

    private final String pnr;
    private final String flightId;
    private String primaryContact;
    private final List<Passenger> passengers;
    private double totalFare;
    private Status status;

    public Booking(String pnr, String flightId, String primaryContact) {
        this.pnr = pnr;
        this.flightId = flightId;
        this.primaryContact = primaryContact;
        this.passengers = new ArrayList<>();
        this.totalFare = 0.0;
        this.status = Status.CONFIRMED;
    }

    public String getPnr() { return pnr; }
    public String getFlightId() { return flightId; }
    public String getPrimaryContact() { return primaryContact; }
    public void setPrimaryContact(String primaryContact) { this.primaryContact = primaryContact; }
    public List<Passenger> getPassengers() { return passengers; }
    public double getTotalFare() { return totalFare; }
    public void setTotalFare(double totalFare) { this.totalFare = totalFare; }
    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }

    public void recalculateTotalFare(double baseFare) {
        double total = 0;
        for (Passenger p : passengers) {
            total += p.calculateFare(baseFare);
        }
        this.totalFare = total;
    }

    @Override
    public String toString() {
        return String.format("PNR:%s Flight:%s Contact:%s Passengers:%d Total:₱%.2f Status:%s",
            pnr, flightId, primaryContact, passengers.size(), totalFare, status);
}
}