export type LegalDocumentId = "terms" | "privacy";

interface LegalDocument {
  title: string;
  paragraphs: string[];
}

/**
 * Kayıt ekranından açılan hukuki metinler.
 *
 * Buradaki içerik yer tutucudur. Yayına çıkmadan önce şirketin hukuk danışmanı tarafından
 * hazırlanan metinlerle değiştirilmeli ve `@vado/contracts` içindeki `TERMS_VERSION` artırılmalıdır.
 */
export const LEGAL_DOCUMENTS: Record<LegalDocumentId, LegalDocument> = {
  terms: {
    title: "Kullanım Koşulları",
    paragraphs: [
      "Bu metin taslaktır. Yayına çıkmadan önce hukuk danışmanınızın hazırladığı Kullanım Koşulları ile değiştirilmelidir.",
      "VADO; mesajlaşma, paylaşım, mini uygulama ve ödeme başlatma hizmetleri sunar. Hesabını yalnızca kendi telefon numaranla açabilir, hesabında yapılan işlemlerden sen sorumlu olursun.",
      "Hukuka aykırı, taciz edici veya yanıltıcı içerik paylaşılamaz. Bu tür içerikler şikayet üzerine kaldırılabilir ve hesap askıya alınabilir.",
      "Mini uygulamalar üçüncü taraflarca sunulur. Bir mini uygulamaya verdiğin izinleri Ayarlar bölümünden dilediğin zaman geri alabilirsin.",
    ],
  },
  privacy: {
    title: "KVKK Aydınlatma Metni",
    paragraphs: [
      "Bu metin taslaktır. Yayına çıkmadan önce 6698 sayılı Kişisel Verilerin Korunması Kanunu'na uygun aydınlatma metniyle değiştirilmelidir.",
      "Hesabını oluşturmak için telefon numaran; hizmeti sunmak için adın, profil fotoğrafın, kişilerin, mesajların ve paylaşımların işlenir.",
      "Telefon numaran diğer kullanıcılara ve mini uygulamalara gösterilmez. Mini uygulamalar yalnızca senin onay verdiğin bilgilere erişir.",
      "Hesabını Ayarlar bölümünden silebilirsin. Hesap silindiğinde kişisel bilgilerin, paylaşımların ve kişi listen kaldırılır.",
    ],
  },
};
