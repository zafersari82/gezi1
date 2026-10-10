# Teşvik platform servisi

Kampanya, kupon ve sadakat Sipariş motoruna gömülmez. Sipariş, platformun tipli
fiyatlama arayüzünü ve işlem kancalarını tüketir. Restoran paketleri kapalı
mağaza aynı gerçek HTTP/SQL akışını kullanır.

## İndirim ve kullanım kuralları

İşletme ayarı `stackCampaignCoupon` varsayılan **false** değerindedir. Bir kampanya
varken kupon eklemek bu durumda açık hata döndürür; müşteri tam fiyatlı siparişe
sessizce geçirilmez. Birleşim açılırsa sıra kampanya → kupon → sadakat puanıdır.
Bir siparişte en çok bir kampanya ve bir kupon kullanılır. Uygun kampanyalardan
en büyük indirimi sağlayan seçilir; eşitlikte UUID sırası kararlıdır.

Kuralın tarih aralığı başlangıç dahil, bitiş hariçtir; checkout anında denetlenir.
Şube ve isteğe bağlı ürün kapsamı vardır. Asgari ürün tutarı her indirim adımından
önce kalan ürün tutarına uygulanır. Eve teslim bölgesinin asgari tutarı bütün
indirimlerden **sonraki** ürün toplamına uygulanır; teslimat ücreti dahil değildir.

Yüzde değeri baz puandır: 1000 = %10. Yüzde indirimi toplamda aşağı yuvarlanır.
Sabit indirim uygun satır toplamıyla sınırlıdır. Her kuruş en büyük artık yöntemiyle
satırlara dağıtılır; eşit artıkta sepet satırı sırası kullanılır. Birim fiyat ve
seçeneklerin eski görüntüsü korunur; `discountMinor`, indirimli `totalMinor` ve
bu tutardan ayrılan `vatMinor` sipariş satırında değişmez saklanır. Tamsayı/BigInt
hesabı kullanılır; SQL de aynı tahsisi doğrular.

Toplam ve müşteri limitleri `reserved` + `redeemed` kullanımlarını sayar. Aynı
müşterinin şubeleri ortak limittir. Ret/iptal rezervasyonu bir kez bırakır.
Tamamlanan siparişin iadesi kupon kullanım limitini yeniden açmaz. Checkout ve
kural/ayar değişimleri işletmeye özel işlem kilidiyle sıralanır; başka işletmeler
birbirini beklemez. Tekrar anahtarı yeni bir kullanım oluşturmaz.

## Sadakat

Bir puan bir kuruş indirime karşılık gelir. Harcama checkout ile aynı işlemde
bakiyeden çıkar. Puan yalnız **tamamlanan ve ödenmiş** siparişin indirimli ürün
tutarından kazanılır; teslimat ücreti puan kazandırmaz. Ödenmemiş tamamlanmada
puan verilmez, sonradan fiziksel tahsilat kaydı aynı işlemde bir kere kazandırır.

Ret/iptalde harcanan puan geri gelir. Fiziksel iade kayıtlarının kümülatif tutarı
orijinal tahsilata oranlanır; kazanılan puan geri alınır, harcanan puan iade edilir.
Kısmi iadelerde aşağı yuvarlama kullanılır; son tam iade kalan bütün puanı kapatır.
Sıfır tutarlı ödül siparişinde açık tam iade kaydı harcanan puanın tamamını geri
verir. Daha önce harcanmış bir ödül geri alınırsa bakiye negatif olabilir;
kullanılabilir puan `max(bakiye, 0)` olur, borç yeni harcama yaratmaz.

Defter yalnız eklenir. Sipariş, mali kayıt, bakiye, defter, outbox ve denetim aynı
SQL işlemindedir. SQL tetikleyicileri ve `OrderingLifecycle` kancaları aynı tekrar
korumalı hesabı çalıştırır. Tüketici başarısızsa hepsi geri alınır. Fiziksel iade
kanıtı `order_refunds` ödeme kaydıdır; müşteri iade talebi ve işletme sonuçlandırma
arayüzü dördüncü ara sürümde tamamlanacaktır.

## API ve kabuk

Sahip/yönetici uçları `/v1/business/:businessId/incentives` altında:

- `GET/POST /rules`, `PUT /rules/:id`: sürümlü kural yönetimi. Kupon kodu işletmede benzersizdir.
- `GET/PUT /settings`: `expectedVersion`, `stackCampaignCoupon`, `earnBasisPoints`.

Müşteri uçları `/v1/shell/:businessId/:appInstanceId` altında:

- `GET /incentives`: kampanyalar, ayar ve müşterinin puan bakiyesi.
- `GET /loyalty`: `balance`, `available`, `version`.
- `PUT /carts/:id/incentives`: `expectedVersion`, `couponCode` veya null,
  `pointsToSpend`. `idempotency-key` zorunludur.

Kupon sonradan geçersizleşirse veya bakiye değişirse yeni sepet `issues` alanıyla
sebebi gösterir; checkout `cart_changed` ve güncel sepet döndürür. Müşteri tercihi
düzeltip tutarı yeniden onaylar. Eski fiyatla sessizce sipariş verilmez.

SDK `vado.incentives.getAvailable/getLoyalty/applyCart` yöntemlerini sunar.
`incentives.basic` yetkisi gerekir; sepeti değiştiren yöntem ayrıca `ordering.basic`
ister. Kabuk tenant ve müşteri kimliğini kendi doğrular; paket bu kimlikleri ve
serbest HTTP adresini seçemez. Yanıtlar ortak Zod sözleşmeleriyle denetlenir.

0018–0020 dahil yayımlanmış şema dosyaları değişmedi; 0021 yeni mali görüntü,
platform tekrar kaydı ve FORCE RLS tablolarını ekler. Üç veritabanı rolü korunur.
Yedekten yükseltme ve geri dönüş kuralları diğer 2.8 ara sürümleriyle aynıdır.
Bu sürüm ticari ileti göndermez; gerçek İYS/kanal izni ve deneyim ekranları son
adımda tamamlanacaktır. Online ödeme ve canlı GPS yoktur.
