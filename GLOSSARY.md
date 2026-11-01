# PDF Okuyucu

Tarayıcıda PDF okuma uygulaması. Kullanıcı PDF'te metin işaretler, işaretlere not yazar ve işaretlediği yerleri hızlı okuma modunda okur.

## Language

**İşaret**:
PDF'te seçilip bir renkle boyanan metin parçası. Bir işaretin sıfır ya da bir notu olur.
_Avoid_: Highlight (arayüzde), Alıntı

**Not**:
Kullanıcının bir işarete yazdığı metin. "Notlar" paneli bütün işaretleri ve notlarını listeler.
_Avoid_: Yorum

**Kitaplık**:
Kullanıcının daha önce açtığı PDF'lerin listesi. Her PDF işaretleri ve kaldığı sayfayla birlikte durur.
_Avoid_: Dosyalar, geçmiş

**Hızlı okuma**:
Bir metni kelime kelime, tek noktada ve seçilen hızda gösteren okuma modu.
_Avoid_: RSVP (arayüzde)

## Flagged ambiguities

- Hızlı okuma ekranı işaretler için "Alıntı" der ("Alıntı 2 / 5"). Başka her yer "işaret" der. Bu tutarsızlık henüz giderilmedi.
