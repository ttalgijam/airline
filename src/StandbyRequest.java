public class Passenger {
    public enum Type { ADULT, CHILD }

    private final int passengerId;
    private String fullName;
    private int age;
    private Type type;
    private double fareMultiplier;
    private String assignedSeat;
    private double baggageWeightKg;

    public Passenger(int passengerId, String fullName, int age, String assignedSeat, double baggageWeightKg) {
        this.passengerId = passengerId;
        this.fullName = fullName;
        this.age = age;
        this.assignedSeat = assignedSeat;
        this.baggageWeightKg = baggageWeightKg;
        this.type = age < 12 ? Type.CHILD : Type.ADULT;
        this.fareMultiplier = (type == Type.CHILD) ? 0.5 : 1.0;
    }

    public int getPassengerId() { return passengerId; }
    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }
    public int getAge() { return age; }
    public Type getType() { return type; }
    public double getFareMultiplier() { return fareMultiplier; }
    public String getAssignedSeat() { return assignedSeat; }
    public void setAssignedSeat(String assignedSeat) { this.assignedSeat = assignedSeat; }
    public double getBaggageWeightKg() { return baggageWeightKg; }
    public void setBaggageWeightKg(double baggageWeightKg) { this.baggageWeightKg = baggageWeightKg; }

    /** Age-Bracket Pricing + baggage tier fee, applied on top of a flight's base fare. */
    public double calculateFare(double baseFare) {
        double FREE_ALLOWANCE_KG = 20.0;
        double FEE_PER_EXTRA_KG = 5.0;
        double subtotal = baseFare * fareMultiplier;
        double extraKg = Math.max(0, baggageWeightKg - FREE_ALLOWANCE_KG);
        double baggageFee = extraKg * FEE_PER_EXTRA_KG;
        return subtotal + baggageFee;
    }

    @Override
    public String toString() {
        return String.format("#%d %-20s Age:%-3d %-6s Seat:%-4s Bag:%.1fkg",
                passengerId, fullName, age, type, assignedSeat == null ? "-" : assignedSeat, baggageWeightKg);
    }
}