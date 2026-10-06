# Üçüncü taraf bildirimleri

VADO'nun özgün kodu [LICENSE.md](LICENSE.md) kapsamındadır. Aşağıdaki açık kaynak paketler kendi
lisanslarıyla kullanılır. Liste doğrudan bağımlılıkları kapsar; bunların dolaylı bağımlılıklarıyla
birlikte kesin sürümler `package-lock.json` dosyasındadır.

2.0 sıfırdan yazıldı; başka bir projeden kaynak kod, görsel ya da simge kopyalanmadı. Marka simgesi
1.1 paketinden alındı.

## Uygulamayla birlikte dağıtılan paketler

Bu paketlerin kodu sunucuda çalışır ya da mobil uygulamanın, panelin ve mini uygulamanın içine
derlenir. Tamamı MIT lisanslıdır.

| Paket                                       | Sürüm   | Nerede                      |
| ------------------------------------------- | ------- | --------------------------- |
| `@expo/vector-icons`                        | 15.1.1  | Mobil                       |
| `@fastify/cors`                             | 11.3.0  | API                         |
| `@fastify/helmet`                           | 13.1.1  | API                         |
| `@fastify/multipart`                        | 10.1.2  | API                         |
| `@fastify/rate-limit`                       | 11.2.0  | API                         |
| `@fastify/static`                           | 10.1.5  | API                         |
| `@react-native-async-storage/async-storage` | 2.2.0   | Mobil                       |
| `@socket.io/redis-adapter`                  | 8.3.0   | API                         |
| `@tanstack/react-query`                     | 5.104.1 | Mobil                       |
| `expo`                                      | 57.0.26 | Mobil                       |
| `expo-camera`                               | 57.0.6  | Mobil                       |
| `expo-clipboard`                            | 57.0.2  | Mobil                       |
| `expo-constants`                            | 57.0.20 | Mobil                       |
| `expo-crypto`                               | 57.0.3  | Mobil                       |
| `expo-device`                               | 57.0.2  | Mobil                       |
| `expo-font`                                 | 57.0.4  | Mobil                       |
| `expo-image`                                | 57.0.5  | Mobil                       |
| `expo-image-picker`                         | 57.0.20 | Mobil                       |
| `expo-linking`                              | 57.0.11 | Mobil                       |
| `expo-local-authentication`                 | 57.0.3  | Mobil                       |
| `expo-notifications`                        | 57.0.21 | Mobil (2.5)                 |
| `expo-location`                             | 57.0.20 | Mobil                       |
| `expo-router`                               | 57.0.24 | Mobil                       |
| `expo-secure-store`                         | 57.0.4  | Mobil                       |
| `expo-splash-screen`                        | 57.0.9  | Mobil                       |
| `expo-status-bar`                           | 57.0.1  | Mobil                       |
| `expo-system-ui`                            | 57.0.4  | Mobil                       |
| `expo-web-browser`                          | 57.0.3  | Mobil                       |
| `fastify`                                   | 5.12.5  | API                         |
| `next`                                      | 16.3.8  | Panel                       |
| `pg`                                        | 8.23.1  | API                         |
| `qrcode`                                    | 1.5.4   | Panel                       |
| `react`                                     | 19.2.3  | Mobil, panel, mini uygulama |
| `react-dom`                                 | 19.2.3  | Mobil, panel, mini uygulama |
| `react-native`                              | 0.86.3  | Mobil                       |
| `react-native-gesture-handler`              | 2.32.0  | Mobil                       |
| `react-native-qrcode-svg`                   | 6.3.26  | Mobil                       |
| `react-native-reanimated`                   | 4.5.1   | Mobil                       |
| `react-native-safe-area-context`            | 5.7.0   | Mobil                       |
| `react-native-screens`                      | 4.26.2  | Mobil                       |
| `react-native-svg`                          | 15.15.4 | Mobil                       |
| `react-native-web`                          | 0.21.3  | Mobil (web önizlemesi)      |
| `react-native-webview`                      | 13.16.1 | Mobil                       |
| `react-native-worklets`                     | 0.10.1  | Mobil                       |
| `redis`                                     | 6.3.0   | API                         |
| `server-only`                               | 0.0.1   | Panel                       |
| `socket.io`                                 | 4.8.4   | API                         |
| `socket.io-client`                          | 4.8.4   | Mobil                       |
| `zod`                                       | 4.6.5   | Sözleşmeler, API, panel     |

## Yalnızca geliştirmede kullanılan paketler

Bu paketler derleme, denetim ve test için kullanılır; uygulamayla birlikte dağıtılmaz. TypeScript
Apache-2.0, diğerleri MIT lisanslıdır.

`@eslint/js`, `@types/node`, `@types/pg`, `@types/react`, `@types/react-dom`,
`@vitejs/plugin-react`, `concurrently`, `esbuild`, `eslint`, `eslint-config-prettier`,
`eslint-plugin-react-hooks`, `eslint-plugin-simple-import-sort`, `expo-doctor`, `globals`,
`prettier`, `tsx`, `typescript`, `typescript-eslint`, `vite`, `vitest`.

## Proje sahibi tarafından sağlanan veri

- **Türkiye il / ilçe / mahalle adres veri seti:** proje sahibi 6 Ekim 2026 tarihinde veri setini
  kendisinin derlediğini beyan etmiş ve VADO içinde kullanma, dönüştürme ve VADO dağıtımlarında
  kullanma izni vermiştir. Ham veri arşivi depoya gömülmez; doğrulanan kayıtlar Konum platform
  servisine `locations:import` aracıyla yüklenir. Bu kayıt üçüncü taraf yazılım lisansı değildir;
  burada veri kökeni ve kullanım izninin denetim izi tutulur.

## Dış hizmetler

- **Jitsi Meet** (Apache-2.0): görüntülü görüşme düğmesi `EXPO_PUBLIC_JITSI_URL` adresindeki Jitsi
  sunucusunda bir oda açar. Jitsi'nin kodu bu depoda yer almaz.
- **Simgeler:** arayüzdeki simgeler `@expo/vector-icons` ile gelen Ionicons setindendir (MIT).

## Dolaylı bağımlılıklar

Yukarıdaki paketlerin kendi bağımlılıklarıyla birlikte kilit dosyasında yaklaşık 900 çalışma zamanı
paketi vardır; her birinin lisansı `package-lock.json` içindeki `license` alanında yazılıdır.
Neredeyse tamamı MIT, ISC, BSD ve Apache-2.0 gibi serbest lisanslardır. Farklı olan iki grup:

- **`sharp` ve `libvips` (LGPL-3.0-or-later).** Next.js'in görsel işleme için isteğe bağlı
  bağımlılığıdır ve panel imajının içine girer. Panel bu kitaplığı kullanmaz; imajı yalnızca kendi
  sunucunuzda çalıştırdığınız sürece dağıtım yükümlülüğü doğmaz.
- **`lightningcss` (MPL-2.0).** Derleme sırasında CSS işleyen araçtır; değiştirilmeden kullanılır.

Mobil uygulamayı mağazada yayınlarken ve imajları başkalarına dağıtırken bağımlılıkların lisans
metinleri korunmalıdır; kapsamını hukukçunuzla netleştirin. Yeni bir paket eklediğinizde bu dosyayı
güncelleyin.
