public class StandbyRequest {
    private final String name;
    private final int age;
    private final long sequenceNumber;

    public StandbyRequest(String name, int age, long sequenceNumber) {
        this.name = name;
        this.age = age;
        this.sequenceNumber = sequenceNumber;
    }

    public String getName() { return name; }
    public int getAge() { return age; }
    public long getSequenceNumber() { return sequenceNumber; }

    @Override
    public String toString() {
        return String.format("%s (Age %d, Seq #%d)", name, age, sequenceNumber);
    }
}