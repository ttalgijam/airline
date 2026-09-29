import java.util.LinkedList;
import java.util.Queue;

/**
 * Represents a single flight, including its aircraft seat grid.
 * Data Structure: 2D Matrix Array for seating (rows x seatsPerRow).
 */
public class Flight {
    private final String flightId;
    private final String origin;
    private final String destination;
    private final String departureTime; // simple string e.g. "2026-09-01 08:30"
    private final double baseFare;
    private final int rows;
    private final int seatsPerRow; // e.g. 6 -> columns A..F

    // 2D Matrix Array: true = occupied, false = free
    private final boolean[][] seatGrid;

    // Priority/standby queue for this flight when fully booked.
    // Implemented as a FIFO queue ordered by request time (earlier = higher priority).
    private final Queue<StandbyRequest> standbyQueue = new LinkedList<>();

    public Flight(String flightId, String origin, String destination,
                  String departureTime, double baseFare, int rows, int seatsPerRow) {
        this.flightId = flightId;
        this.origin = origin;
        this.destination = destination;
        this.departureTime = departureTime;
        this.baseFare = baseFare;
        this.rows = rows;
        this.seatsPerRow = seatsPerRow;
        this.seatGrid = new boolean[rows][seatsPerRow];
    }

    public String getFlightId() { return flightId; }
    public String getOrigin() { return origin; }
    public String getDestination() { return destination; }
    public String getDepartureTime() { return departureTime; }
    public double getBaseFare() { return baseFare; }
    public int getRows() { return rows; }
    public int getSeatsPerRow() { return seatsPerRow; }
    public boolean[][] getSeatGrid() { return seatGrid; }
    public Queue<StandbyRequest> getStandbyQueue() { return standbyQueue; }

    public int getCapacity() { return rows * seatsPerRow; }

    public int getOccupiedCount() {
        int count = 0;
        for (boolean[] row : seatGrid) {
            for (boolean seat : row) {
                if (seat) count++;
            }
        }
        return count;
    }

    public boolean isFull() { return getOccupiedCount() >= getCapacity(); }

    /** Converts a seat label like "5C" into [rowIndex, colIndex], or null if invalid format. */
    public int[] parseSeatLabel(String label) {
        if (label == null || label.length() < 2) return null;
        try {
            String rowPart = label.substring(0, label.length() - 1);
            char colChar = Character.toUpperCase(label.charAt(label.length() - 1));
            int rowNum = Integer.parseInt(rowPart); // 1-based
            int col = colChar - 'A';
            if (rowNum < 1 || rowNum > rows) return null;
            if (col < 0 || col >= seatsPerRow) return null;
            return new int[]{rowNum - 1, col};
        } catch (NumberFormatException e) {
            return null;
        }
    }

    public String seatLabel(int row, int col) {
        return (row + 1) + "" + (char) ('A' + col);
    }

    public boolean isSeatFree(String label) {
        int[] rc = parseSeatLabel(label);
        if (rc == null) return false;
        return !seatGrid[rc[0]][rc[1]];
    }

    public boolean occupySeat(String label) {
        int[] rc = parseSeatLabel(label);
        if (rc == null || seatGrid[rc[0]][rc[1]]) return false;
        seatGrid[rc[0]][rc[1]] = true;
        return true;
    }

    public void freeSeat(String label) {
        int[] rc = parseSeatLabel(label);
        if (rc != null) seatGrid[rc[0]][rc[1]] = false;
    }

    /** Finds the first free seat, or null if the flight is full. */
    public String findFirstFreeSeat() {
        for (int r = 0; r < rows; r++) {
            for (int c = 0; c < seatsPerRow; c++) {
                if (!seatGrid[r][c]) return seatLabel(r, c);
            }
        }
        return null;
    }

    /** Renders the seat grid as a text diagram: 'X' occupied, '.' free. */
    public String renderSeatGrid() {
        StringBuilder sb = new StringBuilder();
        sb.append("Flight ").append(flightId).append(" seat map (").append(rows)
          .append(" rows x ").append(seatsPerRow).append(" seats)\n");
        sb.append("     ");
        for (int c = 0; c < seatsPerRow; c++) sb.append((char) ('A' + c)).append("  ");
        sb.append("\n");
        for (int r = 0; r < rows; r++) {
            sb.append(String.format("%3d  ", r + 1));
            for (int c = 0; c < seatsPerRow; c++) {
                sb.append(seatGrid[r][c] ? "X  " : ".  ");
            }
            sb.append("\n");
        }
        return sb.toString();
    }

   @Override
    public String toString() {
        return String.format("%-6s %-4s -> %-4s  %-16s  Fare: ₱%.2f  Seats: %d/%d",
            flightId, origin, destination, departureTime, baseFare,
            getOccupiedCount(), getCapacity());
}
}