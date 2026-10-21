package sa.urtv.home;

import java.security.MessageDigest;
import java.security.SecureRandom;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

/** Salted, deliberately slow PIN verifier; no plaintext PIN is persisted. */
final class PinCrypto {
    private static final int ROUNDS = 120000;
    static boolean valid(String pin) { return pin != null && pin.matches("[0-9]{4,8}"); }
    static String create(String pin) {
        if (!valid(pin)) throw new IllegalArgumentException("PIN must have 4–8 digits");
        byte[] salt = new byte[16]; new SecureRandom().nextBytes(salt);
        return "1:" + ROUNDS + ":" + hex(salt) + ":" + hex(derive(pin, salt, ROUNDS));
    }
    static boolean verify(String pin, String record) {
        if (!valid(pin) || record == null) return false;
        try {
            String[] p = record.split(":");
            if (p.length != 4 || !"1".equals(p[0])) return false;
            int rounds = Integer.parseInt(p[1]);
            if (rounds < 10000 || rounds > 1000000 || p[2].length() != 32 || p[3].length() != 64) return false;
            return MessageDigest.isEqual(unhex(p[3]), derive(pin, unhex(p[2]), rounds));
        } catch (RuntimeException e) { return false; }
    }
    private static byte[] derive(String pin, byte[] salt, int rounds) {
        PBEKeySpec spec = new PBEKeySpec(pin.toCharArray(), salt, rounds, 256);
        try { return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded(); }
        catch (Exception e) { throw new IllegalStateException("PIN verifier unavailable", e); }
        finally { spec.clearPassword(); }
    }
    private static String hex(byte[] b) {
        StringBuilder s = new StringBuilder();
        for (byte x : b) s.append(String.format(java.util.Locale.ROOT, "%02x", x & 255));
        return s.toString();
    }
    private static byte[] unhex(String s) {
        byte[] b = new byte[s.length()/2];
        for (int i=0;i<b.length;i++) b[i]=(byte)Integer.parseInt(s.substring(i*2,i*2+2),16);
        return b;
    }
}
