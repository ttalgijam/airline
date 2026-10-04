public class Passenger {
    public enum Type { INFANT, CHILD, ADULT, SENIOR, PWD }

    private final int passengerId;
    private String fullName;
    private final int age;
    private final boolean isPwd;
    private final Type type;
    private final double fareMultiplier;
    private String assignedSeat;
    private double baggageWeightKg;

    // Overloaded constructor for backward compatibility
    public Passenger(int passengerId, String fullName, int age, String assignedSeat, double baggageWeightKg) {
        this(passengerId, fullName, age, false, assignedSeat, baggageWeightKg);
    }

    public Passenger(int passengerId, String fullName, int age, boolean isPwd, String assignedSeat, double baggageWeightKg) {
        this.passengerId = passengerId;
        this.fullName = fullName;
        this.age = age;
        this.isPwd = isPwd;
        this.assignedSeat = assignedSeat;
        this.baggageWeightKg = baggageWeightKg;

        // Discount logic hierarchy
        if (isPwd) {
            this.type = Type.PWD;
            this.fareMultiplier = 0.80; // 20% off
        } else if (age < 2) {
            this.type = Type.INFANT;
            this.fareMultiplier = 0.10; // 90% off
        } else if (age >= 2 && age < 12) {
            this.type = Type.CHILD;
            this.fareMultiplier = 0.80; // 20% off
        } else if (age >= 60) {
            this.type = Type.SENIOR;    // Senior Citizen (60+)
            this.fareMultiplier = 0.80; // 20% off
        } else {
            this.type = Type.ADULT;
            this.fareMultiplier = 1.00; // Full fare
        }
    }

    public int getPassengerId() { return passengerId; }
    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }
    public int getAge() { return age; }
    public boolean isPwd() { return isPwd; }
    public Type getType() { return type; }
    public double getFareMultiplier() { return fareMultiplier; }
    public String getAssignedSeat() { return assignedSeat; }
    public void setAssignedSeat(String assignedSeat) { this.assignedSeat = assignedSeat; }
    public double getBaggageWeightKg() { return baggageWeightKg; }
    public void setBaggageWeightKg(double baggageWeightKg) { this.baggageWeightKg = baggageWeightKg; }

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
        return String.format("#%d %-20s Age:%-3d Type:%-7s Seat:%-4s Bag:%.1fkg",
                passengerId, fullName, age, type, assignedSeat == null ? "-" : assignedSeat, baggageWeightKg);
    }
}