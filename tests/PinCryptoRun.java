package sa.urtv.home;

public final class PinCryptoRun {
    private static void check(boolean ok,String why) { if(!ok) throw new AssertionError(why); }
    public static void main(String[] args) {
        String first=PinCrypto.create("0123"),second=PinCrypto.create("0123");
        check(!first.equals(second),"independent random salts");
        check(PinCrypto.verify("0123",first),"leading zero preserved");
        check(!PinCrypto.verify("1230",first),"wrong PIN rejected");
        check(!PinCrypto.verify("0123","1:999999999:a:b"),"unbounded work refused");
        check(!PinCrypto.verify("0123",null),"missing record rejected");
        check(!PinCrypto.verify("0123","bad"),"malformed record rejected");
        check(!PinCrypto.valid("123")&&!PinCrypto.valid("123456789")&&!PinCrypto.valid("12a4"),"PIN constraints");
        check(PinCrypto.verify("12345678",PinCrypto.create("12345678")),"8 digit PIN");
        check(!first.contains("0123"),"no plaintext PIN in saved verifier");
        System.out.println("PASS salted PIN verifier, correct/wrong PINs, leading zero, limits and corrupt records");
    }
}
