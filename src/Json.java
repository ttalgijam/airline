import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * A small hand-rolled JSON writer + parser so the web layer needs zero
 * external libraries (no Gson/Jackson/Maven). Good enough for this app's
 * flat-ish request/response shapes: objects, arrays, strings, numbers,
 * booleans, null.
 */
public final class Json {
    private Json() { }

    // ---------- Writing ----------

    public static String write(Object value) {
        StringBuilder sb = new StringBuilder();
        writeValue(value, sb);
        return sb.toString();
    }

    @SuppressWarnings("unchecked")
    private static void writeValue(Object value, StringBuilder sb) {
        if (value == null) {
            sb.append("null");
        } else if (value instanceof String s) {
            writeString(s, sb);
        } else if (value instanceof Boolean b) {
            sb.append(b.toString());
        } else if (value instanceof Number n) {
            sb.append(n.toString());
        } else if (value instanceof Map) {
            writeObject((Map<String, Object>) value, sb);
        } else if (value instanceof List) {
            writeArray((List<Object>) value, sb);
        } else if (value instanceof boolean[][] grid) {
            writeBoolGrid(grid, sb);
        } else {
            writeString(value.toString(), sb);
        }
    }

    private static void writeObject(Map<String, Object> map, StringBuilder sb) {
        sb.append('{');
        boolean first = true;
        for (Map.Entry<String, Object> e : map.entrySet()) {
            if (!first) sb.append(',');
            first = false;
            writeString(e.getKey(), sb);
            sb.append(':');
            writeValue(e.getValue(), sb);
        }
        sb.append('}');
    }

    private static void writeArray(List<Object> list, StringBuilder sb) {
        sb.append('[');
        boolean first = true;
        for (Object o : list) {
            if (!first) sb.append(',');
            first = false;
            writeValue(o, sb);
        }
        sb.append(']');
    }

    private static void writeBoolGrid(boolean[][] grid, StringBuilder sb) {
        sb.append('[');
        for (int r = 0; r < grid.length; r++) {
            if (r > 0) sb.append(',');
            sb.append('[');
            for (int c = 0; c < grid[r].length; c++) {
                if (c > 0) sb.append(',');
                sb.append(grid[r][c]);
            }
            sb.append(']');
        }
        sb.append(']');
    }

    private static void writeString(String s, StringBuilder sb) {
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
                }
            }
        }
        sb.append('"');
    }

    public static Map<String, Object> obj() {
        return new LinkedHashMap<>();
    }

    // ---------- Parsing ----------

    /** Parses a JSON object/array/value from a string. Returns Map, List, String, Double, Boolean, or null. */
    public static Object parse(String text) {
        Parser p = new Parser(text);
        Object result = p.parseValue();
        p.skipWhitespace();
        return result;
    }

    private static class Parser {
        private final String s;
        private int i = 0;

        Parser(String s) { this.s = s; }

        void skipWhitespace() {
            while (i < s.length() && Character.isWhitespace(s.charAt(i))) i++;
        }

        Object parseValue() {
            skipWhitespace();
            if (i >= s.length()) return null;
            char c = s.charAt(i);
            if (c == '{') return parseObject();
            if (c == '[') return parseArray();
            if (c == '"') return parseString();
            if (c == 't' || c == 'f') return parseBoolean();
            if (c == 'n') { i += 4; return null; } // "null"
            return parseNumber();
        }

        Map<String, Object> parseObject() {
            Map<String, Object> map = new LinkedHashMap<>();
            i++; // {
            skipWhitespace();
            if (i < s.length() && s.charAt(i) == '}') { i++; return map; }
            while (true) {
                skipWhitespace();
                String key = parseString();
                skipWhitespace();
                i++; // :
                Object value = parseValue();
                map.put(key, value);
                skipWhitespace();
                if (i < s.length() && s.charAt(i) == ',') { i++; continue; }
                break;
            }
            skipWhitespace();
            if (i < s.length() && s.charAt(i) == '}') i++;
            return map;
        }

        List<Object> parseArray() {
            List<Object> list = new ArrayList<>();
            i++; // [
            skipWhitespace();
            if (i < s.length() && s.charAt(i) == ']') { i++; return list; }
            while (true) {
                Object value = parseValue();
                list.add(value);
                skipWhitespace();
                if (i < s.length() && s.charAt(i) == ',') { i++; continue; }
                break;
            }
            skipWhitespace();
            if (i < s.length() && s.charAt(i) == ']') i++;
            return list;
        }

        String parseString() {
            StringBuilder sb = new StringBuilder();
            i++; // opening quote
            while (i < s.length() && s.charAt(i) != '"') {
                char c = s.charAt(i);
                if (c == '\\' && i + 1 < s.length()) {
                    char next = s.charAt(i + 1);
                    switch (next) {
                        case '"' -> sb.append('"');
                        case '\\' -> sb.append('\\');
                        case '/' -> sb.append('/');
                        case 'n' -> sb.append('\n');
                        case 'r' -> sb.append('\r');
                        case 't' -> sb.append('\t');
                        case 'u' -> {
                            String hex = s.substring(i + 2, i + 6);
                            sb.append((char) Integer.parseInt(hex, 16));
                            i += 4;
                        }
                        default -> sb.append(next);
                    }
                    i += 2;
                } else {
                    sb.append(c);
                    i++;
                }
            }
            i++; // closing quote
            return sb.toString();
        }

        Boolean parseBoolean() {
            if (s.startsWith("true", i)) { i += 4; return Boolean.TRUE; }
            i += 5;
            return Boolean.FALSE;
        }

        Double parseNumber() {
            int start = i;
            while (i < s.length() && "-+.eE0123456789".indexOf(s.charAt(i)) >= 0) i++;
            return Double.parseDouble(s.substring(start, i));
        }
    }

    // ---------- Small helpers for reading parsed values back out ----------

    public static String getString(Map<String, Object> m, String key) {
        Object v = m.get(key);
        return v == null ? null : v.toString();
    }

    public static int getInt(Map<String, Object> m, String key, int def) {
        Object v = m.get(key);
        if (v instanceof Number n) return n.intValue();
        return def;
    }

    public static double getDouble(Map<String, Object> m, String key, double def) {
        Object v = m.get(key);
        if (v instanceof Number n) return n.doubleValue();
        return def;
    }

    @SuppressWarnings("unchecked")
    public static List<Object> getList(Map<String, Object> m, String key) {
        Object v = m.get(key);
        return v instanceof List ? (List<Object>) v : new ArrayList<>();
    }
}