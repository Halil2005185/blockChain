/**
 * The Academy's lessons, as plain data (Turkish).
 *
 * Each lesson: a short explanation, key points, an interactive experiment
 * (rendered by the component registered under `experiment`), a step-by-step
 * walkthrough, and a quiz. Lesson content must stay technically accurate;
 * when this project does not implement something, the text says so.
 * Lesson ids stay in English: they appear in URLs (#learn/<id>) and saved progress.
 *
 * No runtime imports: this file is unit-tested directly by Node.
 */

export type ExperimentId =
  | "chain-peek"
  | "tx-hash"
  | "hash-playground"
  | "genesis-explorer"
  | "nonce-stepper"
  | "mining-lab"
  | "tamper-lab"
  | "merkle-lab"
  | "signature-lab"
  | "node-offline-lab"
  | "invalid-block-lab"
  | "partition-lab"
  | "pos-demo"
  | "forgery-lab";

export interface QuizQuestion {
  question: string;
  options: string[];
  /** Index into `options`. */
  answer: number;
  /** Shown after answering, whether right or wrong. */
  explanation: string;
}

export interface Lesson {
  id: string;
  title: string;
  minutes: number;
  summary: string;
  explanation: string[];
  keyPoints: string[];
  /** A precise statement worth highlighting (common misconceptions). */
  important?: string;
  experiment: ExperimentId;
  steps: string[];
  quiz: QuizQuestion[];
}

export const LESSONS: Lesson[] = [
  {
    id: "what-is-a-blockchain",
    title: "Blokzincir nedir?",
    minutes: 4,
    summary: "Her bloğun bir hash ile kendinden önceki bloğa kilitlendiği bir blok listesi.",
    explanation: [
      "Blokzincir, verilerin yalnızca sona eklendiği bir kayıt listesidir; bu kayıtlara blok denir. Her blok, kendinden önceki bloğun hash’ini (parmak izini) saklar ve blok listesini bir zincire dönüştüren şey bu bağlantıdır.",
      "Biri eski bir bloğu değiştirirse o bloğun parmak izi değişir ve sonraki blok artık onu göstermez. Bu yüzden değişiklik kolayca fark edilir.",
      "Gerçek bir blokzincirde birçok bağımsız bilgisayar (düğüm) bir kopya tutar ve her biri her yeni bloğu kendisi doğrular; böylece tek bir taraf geçmişi gizlice yeniden yazamaz. Bu uygulamada «Tek zincir» sekmesi sunucuda tek bir zincir çalıştırır, «Ağ» sekmesi ise birden çok düğümü simüle eder.",
    ],
    keyPoints: [
      "Bloklar, önceki bloğun hash’i ile birbirine bağlanır.",
      "Yeni veriler sona eklenir; eski veriler değiştirilmez.",
      "Kripto para, blokzincirin yalnızca bir uygulamasıdır; aynı şey değildir.",
    ],
    experiment: "chain-peek",
    steps: [
      "Aşağıdaki zincire bakın. Her kart blok numarasını ve hash’inin başını gösterir.",
      "«Deneme işlemi ekle» düğmesine tıklayın. İşlem, bekleyen işlem havuzunda bekleyecek.",
      "«Bir bloğa kaz» düğmesine tıklayın. Sonda yeni bir blok belirir.",
      "Yeni bloğun önceki hash’inin, kendinden önceki bloğun hash’ine eşit olduğunu kontrol edin.",
    ],
    quiz: [
      {
        question: "Bir bloğu kendinden önceki bloğa bağlayan nedir?",
        options: ["Zaman damgası", "Önceki bloğun hash’i", "Bir veritabanı satır numarası", "Madencinin adı"],
        answer: 1,
        explanation: "Her blok, kendinden önceki bloğun tam hash’i olan previous_hash değerini saklar. O blok değişirse bağlantı artık eşleşmez.",
      },
      {
        question: "Blokzincir, kripto parayla aynı şey midir?",
        options: ["Evet, ikisi aynı şeydir", "Hayır, kripto para blokzincirin olası kullanımlarından yalnızca biridir"],
        answer: 1,
        explanation: "Blokzincir, üzerinde uzlaşmak için kuralları olan bir veri yapısıdır. Kripto paralar onu kullanır, başka uygulamalar da kullanır. Bu projede gerçek bir para yoktur.",
      },
    ],
  },
  {
    id: "blocks-and-transactions",
    title: "Bloklar, işlemler ve zincir",
    minutes: 5,
    summary: "Bir bloğun içinde ne var ve işlemler bloğun hash’ini nasıl etkiler.",
    explanation: [
      "Buradaki bir işlem, hayali EDU birimlerinin bir addan diğerine aktarılmasını kaydeder. Yeni işlemler, bir madenci onları bir bloğa koyana kadar bekleyen işlem havuzunda bekler.",
      "Bir bloğun bir başlığı (dizin, zaman damgası, önceki hash, Merkle kökü, veri, zorluk ve nonce) ve bir işlem listesi vardır. Bloğun hash’i, başlığının SHA-256 hash’idir.",
      "İşlemler başlığın içinde tek tek hash’lenmez; onları Merkle kökü özetler. Kök başlıkta yer aldığı için herhangi bir işlemi değiştirmek bloğun hash’ini değiştirir.",
      "Kazılan her bloktaki ilk işlem madenci ödülüdür ve özel gönderen NETWORK tarafından gönderilir.",
    ],
    keyPoints: [
      "Bekleyen işlemler, kazılana kadar bir havuzda bekler.",
      "Blok hash’i = başlığın SHA-256’sı; başlık Merkle kökünü içerir.",
      "Tek bir işlemi değiştirmek bloğun tüm hash’ini değiştirir.",
    ],
    experiment: "tx-hash",
    steps: [
      "Deney, iki işlem içeren varsayımsal bir blok gösterir. Hiçbir şey kaydedilmez.",
      "İlk işlemin tutarını değiştirin.",
      "İşlem kimliğinin, Merkle kökünün ve bloğun tüm hash’inin nasıl değiştiğini izleyin.",
      "Orijinal tutarı geri koyun: eski hash’ler geri gelir. Hash deterministiktir.",
    ],
    quiz: [
      {
        question: "Yeni bir işlem bir bloğa girmeden önce nerede bekler?",
        options: ["Genesis bloğunda", "Bekleyen işlem havuzunda", "Önceki bloğun içinde", "Hiçbir yerde, hemen kazılır"],
        answer: 1,
        explanation: "İşlemler, bir madenci onları sonraki bloğa koyana kadar bekleyen işlem havuzunda kalır.",
      },
      {
        question: "Bir bloktaki tek bir işlemin tutarını değiştirdiniz. Bloğun hash’ine ne olur?",
        options: ["Hiçbir şey, yalnızca başlık hash’lenir", "Yalnızca son hane değişir", "Tamamen farklı olur"],
        answer: 2,
        explanation: "İşlem kimliği değişir, böylece Merkle kökü değişir. Kök başlıkta yer aldığı için başlığın hash’i tamamen değişir.",
      },
    ],
  },
  {
    id: "sha256",
    title: "SHA-256 ve hash fonksiyonları",
    minutes: 5,
    summary: "Veriler için parmak izleri: deterministik, öngörülemez ve tek yönlü.",
    explanation: [
      "Bir hash fonksiyonu herhangi bir girdiyi sabit boyutlu bir çıktıya dönüştürür. SHA-256 her zaman 256 bit üretir; bu da 64 onaltılık karakter olarak yazılır.",
      "Deterministiktir: aynı girdi her zaman aynı hash’i verir. Çığ etkisi vardır: tek bir karakteri değiştirmek çıktıyı tamamen değiştirir. Tek yönlüdür: hash’ten girdiyi çıkaramazsınız.",
      "Aynı hash’e sahip farklı girdiler (çakışmalar) matematiksel olarak var olmak zorundadır, ancak SHA-256’da bunları pratikte nasıl bulacağını kimse bilmiyor.",
    ],
    important:
      "Hash, şifreleme değildir. Şifreleme bir anahtar kullanır ve o anahtara sahip olan tarafından geri çözülebilir. Hash’in ise anahtarı yoktur ve «şifresi çözülemez»; eşleşen bir girdi bulmanın tek yolu tahmin etmektir.",
    keyPoints: [
      "Girdinin boyutu ne olursa olsun her zaman 64 onaltılık karakter.",
      "Girdide küçük bir değişiklik → tamamen farklı bir hash.",
      "Tek yönlü: hash, şifreleme değildir.",
    ],
    experiment: "hash-playground",
    steps: [
      "İlk kutuya \"hello\" yazın ve hash’e bakın.",
      "İkinci kutuya \"hellp\" yazın ve karşılaştırın: her 16 karakterden yaklaşık 15’i farklıdır.",
      "\"abc\" ve \"abc \" (boşluklu) deneyin. İnsana benzer görünürler, SHA-256’ya değil.",
      "Bütün bir paragraf yapıştırın: hash yine tam olarak 64 karakterdir.",
    ],
    quiz: [
      {
        question: "Orijinal metni geri almak için bir SHA-256 hash’inin şifresini çözebilir misiniz?",
        options: ["Evet, doğru anahtarla", "Hayır, hash tek yönlüdür ve anahtarı yoktur", "Evet, bitleri tersine çevirerek"],
        answer: 1,
        explanation: "Hash fonksiyonları şifreleme değildir. Anahtar da ters işlem de yoktur; eşleşen bir girdiyi yalnızca tahmin bulabilir.",
      },
      {
        question: "Onaltılık olarak yazılan bir SHA-256 hash’i ne kadar uzundur?",
        options: ["32 karakter", "64 karakter", "Girdinin uzunluğuna bağlıdır"],
        answer: 1,
        explanation: "256 bit = 64 onaltılık karakter (her karakter 4 bit), girdinin boyutu ne olursa olsun.",
      },
      {
        question: "Girdide tek bir harfi değiştirdiniz. Hash’e ne olur?",
        options: ["Tek bir karakter değişir", "Hiçbir şey", "Tamamen farklı görünür"],
        answer: 2,
        explanation: "Bu çığ etkisidir: ortalama olarak çıktı bitlerinin yaklaşık yarısı değişir.",
      },
    ],
  },
  {
    id: "genesis-block",
    title: "Genesis bloğu",
    minutes: 4,
    summary: "Üst bloğu olmayan ilk blok; bu yüzden içeriği programa önceden yazılmıştır.",
    explanation: [
      "İlki hariç her blok kendinden öncekini gösterir. Genesis bloğunun önceki bir bloğu yoktur, bu yüzden previous_hash değeri geleneksel olarak 64 sıfırdır.",
      "İçeriği (2025-01-01 olan sabit bir zaman damgası, sabit bir mesaj ve hiç işlem yok) programa yazılıdır. Her düğüm tamamen aynı genesis bloğunu oluşturur; düğümler aynı ağa ait olduklarını böyle anlar.",
      "Bu projede genesis bloğu da zincirin zorluğuyla kazılır, bu yüzden farklı bir zorluk farklı bir genesis bloğu üretir. Bitcoin’in genesis bloğu da hedefini karşılar. Diğer blokzincirler genesis bloğunun içeriğini farklı yollarla seçer.",
    ],
    keyPoints: [
      "previous_hash = 64 sıfır: daha eski bir blok yoktur.",
      "İçerik önceden yazılmıştır, bu yüzden tüm düğümler onda uzlaşır.",
      "Blok 1, genesis bloğunun hash’ini previous_hash olarak saklar.",
    ],
    experiment: "genesis-explorer",
    steps: [
      "Tek zincirinizdeki genesis bloğunun alanlarını okuyun.",
      "«Hash’ini yeniden hesapla» düğmesine tıklayın: sunucu aynı alanları hash’ler ve aynı hash’i elde eder.",
      "Zincirinizde blok 1 varsa, onun previous_hash değerini genesis bloğunun hash’iyle karşılaştırın.",
    ],
    quiz: [
      {
        question: "Genesis bloğunun previous_hash değeri neden tamamen sıfırlardan oluşur?",
        options: ["Çünkü kurcalanmıştır", "Önceki bir blok yoktur, bu yüzden geleneksel olarak sıfırlar kullanılır", "Sıfırlar onu daha hızlı kazdırır"],
        answer: 1,
        explanation: "İlk bloğun üst bloğu yoktur. Altmış dört sıfır, tüm düğümlerin üzerinde uzlaştığı bir yer tutucudur.",
      },
      {
        question: "Her düğüm neden aynı genesis bloğunu oluşturmak zorundadır?",
        options: ["Bellekten tasarruf etmek için", "Aksi halde zincirleri daha ilk bloktan itibaren farklı olur", "Önemli değildir"],
        answer: 1,
        explanation: "Sonraki tüm bloklar genesis bloğunun hash’i üzerine kurulur. Farklı genesis bloğuna sahip düğümler farklı bir ağdadır.",
      },
    ],
  },
  {
    id: "nonce-and-difficulty",
    title: "Nonce, zorluk ve hedef",
    minutes: 5,
    summary: "Blok hash’inin karşılaması gereken kural ve madencilerin değiştirdiği tek sayı.",
    explanation: [
      "Madenci bloğun hash’ini seçemez. Değiştirebildiği şey nonce’tur; başlıkta yalnızca bu amaçla bulunan bir sayıdır. Her yeni nonce tamamen yeni bir hash verir.",
      "Hedef, geçerli bir hash’in karşılaması gereken kuraldır. Bu projede: hash, zorluk kadar sıfırla başlamalıdır. Her onaltılık karakterin sıfır olma olasılığı 16’da 1’dir, bu yüzden d zorluğu ortalama yaklaşık 16^d deneme gerektirir.",
      "Basitleştirme: gerçek Bitcoin, sayı olarak okunan hash’i sayısal bir hedefle karşılaştırır ve zorluğu yaklaşık iki haftada bir otomatik olarak ayarlar. Burada ise hedef «baştaki sıfırlar»dır ve zorluğu siz belirlersiniz.",
    ],
    keyPoints: [
      "Nonce = madencilerin değiştirdiği sayaç.",
      "Hedef: hash’in `zorluk` kadar sıfırla başlaması.",
      "Ortalama deneme = 16^zorluk.",
    ],
    experiment: "nonce-stepper",
    steps: [
      "Zorluk 1 ile başlayın: hash tek bir sıfırla başlamalıdır.",
      "«Sonraki nonce» düğmesine birkaç kez basın. Her nonce, öncekiyle ilgisi olmayan bir hash verir.",
      "Bir hash hedefi karşılayana kadar «50 nonce dene» düğmesine basın.",
      "Zorluk 2’ye geçin ve eşleşmenin ne kadar seyrekleştiğine dikkat edin.",
    ],
    quiz: [
      {
        question: "Farklı bir blok hash’i elde etmek için madenci neyi değiştirir?",
        options: ["Önceki bloğun hash’ini", "Nonce’u", "Genesis bloğunu", "SHA-256 algoritmasını"],
        answer: 1,
        explanation: "Nonce, değiştirilmek için ayrılmış alandır. Diğer alanları değiştirmek bloğun anlamını değiştirir.",
      },
      {
        question: "Zorluk 3’te madencinin ortalama olarak yaklaşık kaç denemeye ihtiyacı vardır?",
        options: ["3", "48", "4,096 (16^3)", "1,000,000"],
        answer: 2,
        explanation: "Baştaki her sıfırın olasılığı 1/16’dır, bu yüzden üç sıfır ortalama 16 × 16 × 16 = 4,096 deneme gerektirir.",
      },
    ],
  },
  {
    id: "mining",
    title: "Madencilik: neden çok deneme gerektirir",
    minutes: 5,
    summary: "Madencilik kaba kuvvetle yapılan bir aramadır ve her ek sıfır 16 kat daha fazla iş demektir.",
    explanation: [
      "Madencilik üç adımı tekrarlamaktır: bir nonce seç, başlığı hash’le, hedefi kontrol et. Bir hash hedefi karşılayana kadar tekrarla.",
      "Kestirme bir yol yoktur, çünkü SHA-256’nın çıktısı öngörülemez. Madencilik bir bulmacanın zekice çözümü değil, çok hızlı tahmin etmektir. Şansın da payı vardır: arama ortalamadan çok daha erken ya da daha geç bitebilir.",
      "Bu maliyet amacın kendisidir. Geçerli bir blok üretmek gerçek iş gerektirir; bu yüzden geçmişi yeniden yazmak o işi yeniden yapmak demektir, hem de dürüst zincir üzerine inşa eden herkesten daha hızlı.",
    ],
    keyPoints: [
      "Madencilik = hash’i hedefi karşılayan bir nonce aramak.",
      "Zorluk +1 → yaklaşık 16 kat daha fazla deneme.",
      "Maliyetli bloklar, geçmişi yeniden yazmayı maliyetli kılar.",
    ],
    experiment: "mining-lab",
    steps: [
      "Laboratuvar sunucuda bir deneme bloğu kazar. Zincirinize dokunulmaz.",
      "Zorluk 1, 2 ve 3 ile (isterseniz 4 ile de) kazın ve deneme sayılarını karşılaştırın.",
      "İlk denemelere bakın: nonce 0, sonra 1, sonra 2… biri eşleşene kadar hepsi başarısız olur.",
      "Aynı zorlukla iki kez kazın: aynı veri aynı nonce’u verir. Arama deterministiktir.",
    ],
    quiz: [
      {
        question: "Madenci kazanan nonce’u neden doğrudan hesaplayamaz?",
        options: ["Çünkü gizlidir", "SHA-256’nın çıktısı öngörülemez, tek yol nonce değerlerini denemektir", "Ağ her madenciye cevabı söyler"],
        answer: 1,
        explanation: "Hangi girdinin sıfırlarla başlayan bir hash vereceğini kimse öngöremez, bu yüzden madenciler adayları tek tek denemek zorundadır.",
      },
      {
        question: "Zorluk 2 yaklaşık 256 deneme gerektirdi. Zorluk 4 için yaklaşık ne kadar?",
        options: ["512", "1,024", "65,536", "256"],
        answer: 2,
        explanation: "İki ek sıfır = 16 × 16 = 256 kat daha fazla iş: 256 × 256 = 65,536.",
      },
    ],
  },
  {
    id: "tampering",
    title: "Önceki hash’ler ve kurcalamanın tespiti",
    minutes: 7,
    summary: "Eski bir bloğu değiştirin ve ondan sonraki her bloğun güvenini kaybettiğini izleyin.",
    explanation: [
      "k bloğunu kazıldıktan sonra düzenleyin; saklanan hash’i artık içeriğiyle eşleşmez: blok geçersizdir (hash_mismatch). Sonraki her blok onun üzerine kuruludur, bu yüzden her biri kendi kontrollerini geçse bile güvenilmez olur.",
      "k bloğunu yeniden kazın; yeni bir hash’le yeniden geçerli olur. Ancak k+1 bloğu hâlâ eski hash’i previous_hash olarak saklar, bu yüzden bağlantı kopar (broken_link).",
      "Sonraki her bloğu da yeniden kazın; zincir kendi içinde yeniden geçerli olur. Hash’ler tek başına geçmişi değiştirmeyi imkânsız kılmaz. Gerçek bir blokzinciri koruyan şey, birçok başka düğümün orijinal zinciri tutması ve tüm dürüst ağın işini geçmenin son derece maliyetli olmasıdır.",
    ],
    keyPoints: [
      "Geçerli: tüm kontrolleri geçer. Geçersiz: bir kuralı ihlal eder. Güvenilmez: geçersiz bir blok üzerine kurulu.",
      "Yeniden kazım, kopukluğu bir sonraki bağlantıya taşır.",
      "Değiştirilemezlik hash’lerden + işten + birçok bağımsız kopyadan gelir.",
    ],
    experiment: "tamper-lab",
    steps: [
      "Laboratuvar tek zincirinizi değiştirir, bu yüzden önce size sorar. Yeni bir zincirle başlayabilirsiniz.",
      "Zincirde en az 3 blok olduğundan emin olun (laboratuvar bunları kazabilir).",
      "Blok 1’i kurcalayın. Kırmızı (geçersiz) olur; sonraki bloklar turuncu (güvenilmez) olur.",
      "Blok 1’i yeniden kazın. Yeniden geçerli olur, ancak blok 2 ile bağlantı kopar.",
      "Blok 2’yi, sonra 3’ü… zincir geçerli olana kadar tek tek yeniden kazın. Sonra isterseniz sıfırlayın.",
    ],
    quiz: [
      {
        question: "Blok 1’i kurcaladınız. Kendi kontrolleri başarılı olduğu hâlde blok 2’ye neden «güvenilmez» denir?",
        options: ["Çünkü o da kurcalanmıştır", "Çünkü geçersiz bir blok üzerine kuruludur", "Çünkü zaman damgası yanlıştır"],
        answer: 1,
        explanation: "Bir blok, uzattığı geçmiş kadar güvenilirdir. Blok 2 kendi başına sağlamdır ama bozuk bir bloğu uzatır.",
      },
      {
        question: "Bir saldırgan, değiştirdiği bloktan sonraki her bloğu yeniden kazdı. Gerçek bir ağda onu ne durdurur?",
        options: [
          "Hiçbir şey, zincir artık her yerde geçerli",
          "Diğer düğümler orijinal zinciri tutar ve saldırganın tüm dürüst ağın işini geçmesi gerekir",
          "SHA-256 kurcalanmış veriyi hash’lemeyi reddeder",
        ],
        answer: 1,
        explanation: "Onun kopyası kendi içinde geçerlidir, ancak diğer düğümler, toplam işi herkesin uzatmaya devam ettiği zincirden büyük olmadıkça ona geçmez.",
      },
    ],
  },
  {
    id: "merkle-trees",
    title: "Merkle ağaçları ve Merkle kökü",
    minutes: 5,
    summary: "Bloktaki her işlemi taahhüt eden tek bir hash.",
    explanation: [
      "Bir Merkle ağacı işlem kimliklerini (bunlar da hash’tir) yaprak olarak alır, onları çiftler halinde hash’ler, sonra bu sonuçları çiftler halinde hash’ler ve tek bir hash kalana kadar devam eder: Merkle kökü.",
      "Bir seviyede tek sayıda hash varsa, sonuncusu kendisiyle eşleştirilir (Bitcoin’in kullandığı kural; bu proje de kullanır).",
      "Blok başlığında yalnızca kök saklanır. Herhangi bir işlemi değiştirin; yaprağı ve ardından köke kadar yolundaki her hash değişir. Gerçek sistemler Merkle kanıtlarını da kullanır: birkaç hash, diğer işlemleri indirmeden bir işlemin bir blokta bulunduğunu kanıtlar. Bu proje kanıtları açıklar ama bir özellik olarak sunmaz.",
    ],
    keyPoints: [
      "Yapraklar = işlem kimlikleri; kök = hepsi için tek bir hash.",
      "Tek sayılı seviye → son hash tekrarlanır.",
      "Tek bir işlemi değiştirmek, köke kadar tüm yolunu değiştirir.",
    ],
    experiment: "merkle-lab",
    steps: [
      "Zincirinizden bir blok seçin; laboratuvar onun Merkle ağacını sunucuda kurar.",
      "İşareti kontrol edin: hesaplanan kök, blokta saklanan köke eşittir.",
      "Bir işlemin tutarını (bir kopya üzerinde) düzenleyin ve ağacı yeniden kurun.",
      "Hangi hash’lerin değiştiğine bakın (renkle işaretli): yalnızca o yaprağın köke kadar olan yolu.",
    ],
    quiz: [
      {
        question: "İşlemleri temsil etmek için blok başlığında ne saklanır?",
        options: ["Her işlemin tamamı", "Yalnızca Merkle kökü", "İşlem sayısı"],
        answer: 1,
        explanation: "Yalnızca kök tüm işlemleri taahhüt eder. Herhangi birini değiştirin, kök değişir.",
      },
      {
        question: "Bir seviyede 3 hash var. Sonraki seviye nasıl kurulur?",
        options: ["Üçüncü hash silinir", "Üçüncü hash kendi kopyasıyla eşleştirilir", "Üç hash tek seferde birleştirilir"],
        answer: 1,
        explanation: "Her hash’in bir eşi olması için son hash tekrarlanır: (A+B), (C+C).",
      },
    ],
  },
  {
    id: "digital-signatures",
    title: "Dijital imzalar ve anahtarlar",
    minutes: 6,
    summary: "Gerçek blokzincirler bir işlemi kimin onayladığını nasıl kanıtlar (burada uygulanmadı).",
    explanation: [
      "Gerçek bir blokzincirde bir hesap bir anahtar çiftine bağlıdır. Özel anahtar gizli kalır ve imzalamak için kullanılır; açık anahtar paylaşılır ve doğrulamak için kullanılır. Geçerli bir imza, özel anahtarın sahibinin tam olarak bu işlemi onayladığını, özel anahtarı açığa çıkarmadan kanıtlar.",
      "Biri imzalı işlemi, tek bir birimle bile olsa, değiştirirse doğrulama başarısız olur. Bu, başkalarının paranızı harcamasını veya ödemelerinizi değiştirmesini engeller.",
      "İmza şifreleme değildir: işlem okunabilir kalır. Hash fonksiyonları imzalama sürecinin içinde kullanılır.",
    ],
    important:
      "Bu eğitim blokzinciri imza kullanmaz, anahtar da kullanmaz. Hesaplar sıradan adlardır ve herkes «alice’ten» bir işlem oluşturabilir. Aşağıdaki deney, yalnızca fikri göstermek için tarayıcınızdaki gerçek Web Crypto API’sini (P-256 eğrisi üzerinde ECDSA) kullanır. Anahtarları bu sayfanın belleğinde bulunur ve blokzincirle bağlantılı değildir.",
    keyPoints: [
      "Özel anahtar imzalar; açık anahtar doğrular.",
      "Mesajdaki herhangi bir değişiklik imzayı bozar.",
      "Bu projenin işlemlerinde uygulanmamıştır.",
    ],
    experiment: "signature-lab",
    steps: [
      "«Anahtar çifti oluştur» düğmesine tıklayın: tarayıcı P-256 üzerinde bir ECDSA anahtar çifti oluşturur.",
      "İşlem metnini imzalayın, sonra doğrulayın: geçerli.",
      "Metinde tek bir karakteri değiştirin ve yeniden doğrulayın: geçersiz.",
      "İkinci bir anahtar çifti oluşturun ve yanlış açık anahtarla doğrulayın: geçersiz.",
    ],
    quiz: [
      {
        question: "İmzayı hangi anahtar oluşturur?",
        options: ["Açık anahtar", "Özel anahtar", "Herhangi biri"],
        answer: 1,
        explanation: "Özel anahtar imzalar. Herkesin sahip olabileceği açık anahtar ise yalnızca doğrular.",
      },
      {
        question: "Bu eğitim blokzinciri işlemlerdeki imzaları doğruluyor mu?",
        options: ["Evet, her işlem imzalıdır", "Hayır, imzasız sıradan adlar kullanır"],
        answer: 1,
        explanation: "Bu büyük bir basitleştirmedir. Dersin demosu gerçek tarayıcı kriptografisi kullanır, ancak zincirden ayrıdır.",
      },
      {
        question: "İmzalı bir mesajda tek bir karakter değişti. Doğrulamada ne olur?",
        options: ["Doğrulama yine başarılı olur", "Doğrulama başarısız olur"],
        answer: 1,
        explanation: "İmza mesajı tam olarak (hash’i aracılığıyla) kapsar. Herhangi bir değişiklik onu geçersiz kılar.",
      },
    ],
  },
  {
    id: "decentralization",
    title: "Merkeziyetsizlik ve bağımsız düğümler",
    minutes: 6,
    summary: "Her birinin kendi kopyası olan ve her şeyi kendisi doğrulayan birçok düğüm.",
    explanation: [
      "Tek bir merkezi veritabanı yerine, bir blokzincir ağı birçok bağımsız düğümden oluşur. Her düğüm zincirin tam kopyasını saklar ve her bloğu kendisi doğrular. Bir bloğu yalnızca başka bir düğüm sağlam olduğunu söylediği için kabul etmez.",
      "Düğümlerin bağlantısı kesilebilir. Biri geri döndüğünde diğer düğümlerin zincirlerini ister, onları doğrular ve varsa daha iyi bir geçerli zinciri benimser.",
      "Bu simülasyonda dört düğüm tek bir sunucu süreci içinde çalışır. Her birinin kendi Blockchain nesnesi ve bekleyen işlem havuzu vardır ve simüle edilmiş gecikmeli mesajlarla blok kopyaları alışverişi yaparlar.",
    ],
    keyPoints: [
      "Her düğüm kendi kopyasını tutar ve doğrular.",
      "Çevrimdışı düğüm geride kalır, sonra diğer düğümlerden yetişir.",
      "Bu simülasyon tek bir süreçte çalışır; gerçek ağlar birçok bilgisayara yayılır.",
    ],
    experiment: "node-offline-lab",
    steps: [
      "Laboratuvar ağ simülasyonunu değiştirir, bu yüzden önce size sorar (ağı sıfırlayabilirsiniz).",
      "Düğüm D’nin bağlantısını kesin.",
      "Düğüm A’da bir blok kazın. Düğüm D’nin geride kaldığını izleyin.",
      "Düğüm D’yi yeniden bağlayın. Diğer düğümlerin zincirlerini alır ve onlara yetişir.",
    ],
    quiz: [
      {
        question: "Başka bir düğüm bir blok gönderdi ve geçerli olduğunu söyledi. Dürüst bir düğüm ne yapar?",
        options: ["Kabul eder, çünkü düğüm öyle söyledi", "Kabul etmeden önce kendisi doğrular", "Bakmadan iletir"],
        answer: 1,
        explanation: "Düğümler her şeyi kendileri doğrular. Ağı kötü bloklara karşı sağlam kılan budur.",
      },
      {
        question: "Çevrimdışı olan bir düğüm nasıl yetişir?",
        options: [
          "Yalnızca sonraki bloğu bekler",
          "Diğer düğümlerin zincirlerini alır, doğrular ve en çok işe sahip geçerli olanı benimser",
          "Sonsuza kadar genesis bloğuna döner",
        ],
        answer: 1,
        explanation: "Yeniden bağlanınca zincirler değiş tokuş edilir; düğüm yalnızca daha fazla toplam işe sahip geçerli bir zincire geçer.",
      },
    ],
  },
  {
    id: "propagation-and-consensus",
    title: "Yayılma, doğrulama ve uzlaşma",
    minutes: 6,
    summary: "Bir bloğun geçerliliği ile ağın bir zincirde uzlaşması iki ayrı şeydir.",
    explanation: [
      "Yayılma: madenci yeni bloğunu yayınlar. Diğer her düğüm onu doğrular. O düğümün son bloğu üzerine kuruluysa eklenir; üst bloğu bilinmiyorsa düğüm gönderenin zincirini ister.",
      "Blok geçerliliği şu soruyu yanıtlar: bu tek blok kurallara (hash, iş kanıtı, bağlantı, işlemler ve ödül) uyuyor mu? Uzlaşma ise şunu yanıtlar: var olan tüm geçerli zincirler arasından tüm düğümler hangisini izler? Buradaki cevap: en çok toplam işe sahip geçerli zincir.",
      "Geçersiz bloklar, kim gönderirse göndersin reddedilir. Bu simülasyon mesajların dürüstçe iletildiğini varsayar ve imza içermez. Bizans hata toleranslı değildir.",
    ],
    important: "Geçerli bir blok otomatik olarak uzlaşılan zincirin parçası olmaz. Geçerlilik kurallarla ilgilidir; uzlaşma ise geçerli zincirler arasından tek bir zincir seçmekle ilgilidir.",
    keyPoints: [
      "Geçerlilik: tek bir blok kurallara karşı.",
      "Uzlaşma: herkesin izlediği geçerli zincir hangisi.",
      "Her dürüst düğüm kötü blokları reddeder.",
    ],
    experiment: "invalid-block-lab",
    steps: [
      "«Şişirilmiş ödül» gibi bir geçersiz blok türü seçin.",
      "Onu Düğüm A’dan yayınlayın. Düğüm A’nın kendi zincirine hiçbir şey eklenmez.",
      "Düğüm B’nin ne karar verdiğini ve nedenini (bloğun ihlal ettiği kural) okuyun.",
      "Başka bir türle tekrarlayın ve neden kodlarını karşılaştırın.",
    ],
    quiz: [
      {
        question: "Hangi ifade doğrudur?",
        options: [
          "Her geçerli blok uzlaşılan zincirde yer alır",
          "Geçerlilik tek bir bloğu kontrol eder; uzlaşma hangi geçerli zincirin izleneceğine karar verir",
          "Uzlaşma, hash’i kontrol etmek demektir",
        ],
        answer: 1,
        explanation: "Geçerli bir blok kaybedebilir; örneğin bir çatallanmadaki eskimiş blok. Uzlaşma tek bir zincir seçer.",
      },
      {
        question: "Düğüm A kendine ödülün 1000 katını ödedi. Diğer düğümler ne der?",
        options: ["accepted (kabul edildi)", "bad_reward (hatalı ödül)", "stale_block (eskimiş blok)"],
        answer: 1,
        explanation: "Ödül sınırı bir uzlaşma kuralıdır. Her dürüst düğüm onu ihlal eden bir bloğu reddeder.",
      },
    ],
  },
  {
    id: "forks-and-reorgs",
    title: "Çatallanmalar, yeniden düzenleme ve kümülatif iş",
    minutes: 8,
    summary: "Düğümler farklılaştığında, en çok işe sahip geçerli zincir kazanır.",
    explanation: [
      "Çatallanma, düğümlerin farklı son bloklara sahip olmasıyla oluşur; örneğin iki madenci aynı yükseklikte bir blok bulduğunda ya da ağ birbiriyle iletişim kuramayan gruplara bölündüğünde.",
      "Bir düğüm rakip bir zinciri öğrendiğinde kümülatif işi karşılaştırır: her blok için 16^zorluk toplamı. En uzun zincir otomatik olarak en iyisi değildir. Düşük zorluklu birçok ucuz bloğun toplam işi, sayıca daha az ama daha maliyetli bloklarınkinden az olabilir.",
      "Diğer zincir geçerliyse ve daha fazla işe sahipse, düğüm yeniden düzenleme yapar: çatallanma noktasından sonraki bloklarını bırakır ve diğer zinciri benimser. Bırakılan blokların işlemleri bekleyen işlem havuzuna geri döner. İş eşitse ilk gördüğü zinciri korur. Yakın tarihli bloklar yeniden düzenlenebileceği için gerçek ağlar birkaç onay bekler.",
    ],
    important: "«En uzun zincir kazanır» kuralı bir basitleştirmedir. Bu proje de, Bitcoin gibi, en çok kümülatif işe sahip geçerli zinciri izler.",
    keyPoints: [
      "Çatallanma = düğümlerin son blokta farklılaşması.",
      "Seçim kuralı = geçerli zincirler arasında en çok kümülatif iş.",
      "Yeniden düzenleme: atılan işlemler bekleyenlere geri döner.",
    ],
    experiment: "partition-lab",
    steps: [
      "Laboratuvar ağ simülasyonunu değiştirir, bu yüzden önce size sorar.",
      "Ağı iki gruba bölün.",
      "Grup 1’de (Düğüm A) bir blok, Grup 2’de (Düğüm C) iki blok kazın. İki grup artık farklı.",
      "Ağı yeniden birleştirin ve Grup 1’in, işi daha fazla olduğu için Grup 2’nin zincirine geçtiğini izleyin.",
    ],
    quiz: [
      {
        question: "Bu proje geçerli zincirler arasında seçim yapmak için hangi kuralı kullanır?",
        options: ["En fazla blok sayısı", "En büyük kümülatif iş kanıtı", "İlk düğümün söylediği", "Düğümlerin çoğunluk oyu"],
        answer: 1,
        explanation: "Blok sayısı değil toplam iş; bu yüzden ucuz bloklardan oluşan uzun bir zincir kazanamaz.",
      },
      {
        question: "Yeniden düzenleme sırasında atılan blokların işlemlerine ne olur?",
        options: ["Silinirler", "Bekleyen işlem havuzuna geri dönerler", "Genesis bloğuna eklenirler"],
        answer: 1,
        explanation: "Kaybolmazlar: düğüm onları yeniden kazılabilmeleri için bekleyen işlem havuzuna geri koyar.",
      },
    ],
  },
  {
    id: "pow-vs-pos",
    title: "İş kanıtı ve hisse kanıtı",
    minutes: 6,
    summary: "Sonraki bloğu kimin ekleyeceğine karar vermenin iki yolu.",
    explanation: [
      "İş kanıtı (bu projede kullanılan): madenciler hedefi karşılayan bir hash bulmak için yarışır. Kazanma şansı hash gücüyle orantılıdır ve güvenlik bu hesaplamanın gerçek maliyetinden gelir.",
      "Hisse kanıtı: doğrulayıcılar coin kilitler («hisse»). Protokol blok önericiyi hisseye göre ağırlıklandırılmış yarı rastgele bir şekilde seçer ve diğer doğrulayıcılar blokları onaylar. Kötü davranış, hissenin bir kısmının yakılmasıyla (slashing) cezalandırılabilir.",
      "Hisse kanıtı madencilik yapmaz: nonce araması da hash yarışı da yoktur. Gerçek hisse kanıtı sistemleri ayrıca güvenli rastgelelik, kesinlik kuralları ve çok daha fazlasını gerektirir. Bu proje yalnızca iş kanıtını uygular; deney kavramsal bir modeldir.",
    ],
    important: "Hisse kanıtı madencilik kullanmaz. Doğrulayıcıları hisseye göre seçer ve zinciri hash işiyle değil, ekonomik cezalarla güvence altına alır.",
    keyPoints: [
      "İş kanıtı: şans ∝ hash gücü; maliyet = hesaplama.",
      "Hisse kanıtı: şans ∝ hisse; hile hisseyi kaybetme riski taşır.",
      "Burada yalnızca iş kanıtı uygulanmıştır.",
    ],
    experiment: "pos-demo",
    steps: [
      "Madencilerin hash gücünü ve doğrulayıcıların hisselerini ayarlayın.",
      "200 tur çalıştırın ve her sistemde blokları kimin ürettiğini karşılaştırın.",
      "İş sütununa dikkat edin: iş kanıtı hash denemeleri harcar, hisse kanıtı hiçbir şey harcamaz.",
    ],
    quiz: [
      {
        question: "Hisse kanıtı, iş kanıtı gibi bir nonce arar mı?",
        options: ["Evet, daha az sıfırla", "Hayır, madencilik yerine doğrulayıcıları hisseye göre seçer"],
        answer: 1,
        explanation: "Hisse kanıtı, hash yarışının yerine hisseye göre ağırlıklandırılmış seçimi ve doğrulayıcı onaylarını koyar.",
      },
      {
        question: "Hisse kanıtında hileyi maliyetli kılan nedir?",
        options: ["Elektrik", "Kilitli coin’lerin kaybedilmesi (slashing)", "Hiçbir şey"],
        answer: 1,
        explanation: "Doğrulayıcılar hisselerini riske atar. Kanıtlanmış kötü davranış, hisselerin yakılmasıyla cezalandırılabilir.",
      },
    ],
  },
  {
    id: "limitations",
    title: "Bu eğitim blokzinciri ne değildir",
    minutes: 4,
    summary: "Herhangi bir gerçek sisteme güvenmeden önce bilmeniz gereken basitleştirmeler.",
    explanation: [
      "Bu proje öğrenmek için yapılmıştır. Her şeyi bellekte tutar, bu yüzden sunucuyu yeniden başlatmak tüm blokları siler.",
      "Anahtar da imza da yoktur: herkes herhangi bir addan işlem gönderebilir. Bakiyeler zorunlu tutulmaz, bu yüzden sahip olmadığınız parayı harcamayı (çifte harcama) hiçbir şey engellemez.",
      "Zorluk asla kendiliğinden ayarlanmaz, hedef baştaki sıfırlardan oluşan basit bir kuraldır ve ücret yoktur. Ağ simülasyonu, mesajların dürüstçe iletildiği ve tam bağlantılı tek bir süreçte çalışır. Bizans hata toleranslı değildir ve üretime uygun bir dağıtık sistem değildir.",
    ],
    important: "Bu projeyi gerçek değeri olan hiçbir şeyi saklamak veya aktarmak için asla kullanmayın.",
    keyPoints: [
      "Yalnızca bellekte; yeniden başlatma = veri kaybı.",
      "İmza yok, bakiye kontrolü yok.",
      "Simüle edilmiş ağ; Bizans hata toleranslı değildir.",
    ],
    experiment: "forgery-lab",
    steps: [
      "«alice’ten mallory’ye» 1,000 EDU göndermek için düğmeye tıklayın. alice’in anahtarına sahip değilsiniz, çünkü zaten hiç anahtar yok.",
      "Sunucunun bunu bekleyen işlem havuzuna kabul ettiğine dikkat edin.",
      "Gerçek bir blokzincirin bunu neden reddedeceğini okuyun: geçerli bir imza yok, muhtemelen bakiye de yok.",
    ],
    quiz: [
      {
        question: "Bu proje gerçek parayı güvenle tutabilir mi?",
        options: ["Evet, SHA-256 kullanıyor", "Hayır, büyük basitleştirmeler içeren eğitim amaçlı bir simülasyondur"],
        answer: 1,
        explanation: "Hash tek başına yetmez: imza yok, bakiye kontrolü yok, kalıcı depolama yok ve gerçek bir ağ yok.",
      },
      {
        question: "«alice’ten» bir işlem neden alice’in izni olmadan kabul edildi?",
        options: ["Çünkü alice bir deneme hesabıdır", "Çünkü bu zincir imza kullanmaz", "Çünkü mallory parolayı tahmin etti"],
        answer: 1,
        explanation: "İmza olmadan gönderen alanı sadece bir metindir. Gerçek zincirler, gönderenin özel anahtarından geçerli bir imza ister.",
      },
    ],
  },
];

/** The eight guided experiments, mapped to the lesson that hosts each one. */
export const GUIDED_EXPERIMENTS: Array<{ title: string; lessonId: string; changes: "nothing" | "chain" | "network" }> = [
  { title: "Bir işlemi değiştirin ve hash’in değiştiğini izleyin", lessonId: "blocks-and-transactions", changes: "nothing" },
  { title: "Farklı zorluk seviyelerinde bloklar kazın", lessonId: "mining", changes: "nothing" },
  { title: "Önceki bir bloğu kurcalayın ve kopuk bağlantıları inceleyin", lessonId: "tampering", changes: "chain" },
  { title: "Geçerli, geçersiz ve güvenilmez blokları karşılaştırın", lessonId: "tampering", changes: "chain" },
  { title: "Bir düğümün bağlantısını kesip yeniden bağlayın", lessonId: "decentralization", changes: "network" },
  { title: "Ağı bölün ve bir çatallanmanın oluşmasını izleyin", lessonId: "forks-and-reorgs", changes: "network" },
  { title: "Ağı yeniden birleştirin ve zincir seçimini izleyin", lessonId: "forks-and-reorgs", changes: "network" },
  { title: "İş kanıtını kavramsal bir hisse kanıtıyla karşılaştırın", lessonId: "pow-vs-pos", changes: "nothing" },
];

export function lessonById(id: string): Lesson | undefined {
  return LESSONS.find((lesson) => lesson.id === id);
}
