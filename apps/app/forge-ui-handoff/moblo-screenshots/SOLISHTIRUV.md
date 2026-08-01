# Moblo skrinshotlari — tushuntirish + bizniki bilan to'liq solishtiruv

> Har rasm ketma-ket nomlangan. Har biri uchun: **Moblo** (funksiya + UI) → **Bizники** → **foiz (1:1)**.
> Manba: Moblo mobil app skrinshotlari (telefon, portret). Bizники: `forge-ui-handoff` (harness + Stage3D).

---

## 00 — `00-chrome-mobile-layout.png` · UMUMIY MOBIL CHROME
**Moblo (1080×1920 telefon):**
- **Yuqori-bar** (~7%): shaffof — 🏠 home · «My creation» ✎ · `mm` pill · ≡ menu. Karta yo'q.
- **Chap-rail** (vertikal): ↩ undo · 📷 kamera · ⊙ focus · ⊞ menu.
- **Model**: markazda, to'liq fon.
- **Past-o'ng**: ⊗ delete-zone (dashed) + «Board4 ⋮» obyekt-pill.
- **Pastki oq-sheet** (~22%): 5-ikonli **tool-pill** [◇ move · ⧉ duplicate · ↻ rotate · 🎨 materials · ⁝⁝ transforms] + tool-controls qatori.

**Bizники:** forge = faqat manipulyatsiya qatlami. Harness: yig'iladigan drawer (☰) + rejim-tugmalar + ⌖ focus / ⤓ ground tugmalari. Yuqori-bar / to'liq chap-rail / pastki tool-pill **yo'q**.

**Solishtiruv — UI ~65%:** indikatorlar 1:1, lekin **doimiy pastki tool-pill + yuqori-bar (Moblo chrome) = app-chrome = HOST ishi** (qonun bo'yicha forge qurmaydi). Eng katta ko'rinish-farqi shu.

---

## 01 — `01-move.png` · F1 MOVE
**Moblo:** yashil Y-o'q + **punktir yashil leader → yerга** + «20,9» yashil qiymat-chip; markazда **4-tomon romb** (planar); pastda tool-controls: `[▽ 20,9 (tahrirlanadi)] [⤓ Полу қўй] [Измерение 🔍]`.
**Bizники:** yashil leader + yashil pill (yergача balandlik) + **markaz-romb** (qo'shildi) + **⤓ put-on-ground** (tugma) + **Measure** (rejim, +masofani tahrirlab surish).
**Solishtiruv — Funksiya ~95% · UI ~85%.** Farq: Moblo qiymat+put-on-ground+Measure'ни bitta **pastki qatorда**; bizда alohida tugma/rejim.

---

## 02 — `02-resize-a/b/c.png` · F2 RESIZE
**Moblo:** rang-o'q strelkalar (X qizil · Y yashil · Z ko'k) + markaz-romb + **panelда o'lcham-chiziqlar** («28,2 × 19,4 × 1,6») + «{qiymat} ✎» chip; link=uniform; «Dimension» oynаси.
**Bizники:** yuz **rang-pucklar** (x=qizil/y=yashil/z=ko'k) + qizil size-chip + **uniform/link** + numpad. Z=qalinlik surilmaydi (profil qonuni).
**Solishtiruv — Funksiya ~90% · UI ~75%.** Farq: Moblo **o'lcham-CHIZIQlarини** panelда ko'rsatadi (bizда yo'q); biz puck ishlatamiz (Moblo strelka+puck ikkаласи).

---

## 03 — `03-rotate-a/b.png` · F3 ROTATE
**Moblo:** **3 halqa** (faol o'q to'q ko'k, boshqалари xira) + **swept pona** (o'tilган burчак sektori) + «-25 ✎» ko'k burchak-chip; pastда **per-o'q ° readout** (● qizil 0 · ● yashil 0 · ● ko'k -25) + aylanа-reset ikonка.
**Bizники:** 3 halqa + pona + ko'k burchak-chip + numpad. Erkin + yumshoq-90° snap.
**Solishtiruv — Funksiya ~95% · UI ~85%.** Farq: Moblo pastда per-o'q ° readout + reset; bizда faqat chip.

---

## 04 — `04-target-a/b/c/d.png` · F4 TARGET (modifikator nishoni)
**Moblo:** modifikatorни qayerga qo'yishni tanlash — burchaklarда/qirralarда `[⬡ ⊕]` pinlar; pastki-sheet tanlangan asbob.
**Bizники:** burchak-bracket pinlar `[⌐ +]` (har burchak o'z ikonаси) + qirra-pinlar; sub-toggle (Углы/Кромки/Вырез/Окно).
**Solishtiruv — Funksiya ~90% · UI ~85%.** Yaqin; Moblo to'g'ridan qirра/burchakni bosadi, bizда pin-qatlam.

---

## 05 — `05-chamfer-a/b/c.png` · F5 CHAMFER (фаска/rabbet)
**Moblo:** **2 kulrang drag-handle** (en ◖◗ + chuqurlik sharcha) + «en ✎»/«chuqurlik ✎» chip + link 🔗 + yashil ✓ + pastki-sheet `[profil ⌐┐↕] [Удалить]`.
**Bizники:** 2 kulrang handle (en+chuqurlik) + **spatial** en/chuqurlik chip + link + ✓ + pastki bottom-sheet `[🗑 Удалить]`.
**Solishtiruv — Funksiya ~88% · UI ~85%.** **Yo'q: profil-tanlagич** (⌐┐↕ — model tasdig'i kerak).

---

## 06 — `06-notch-a/b/c/d.png` · F6 NOTCH (вырез)
**Moblo:** qizil ◀▶ (en) + ▲ (chuqurlik) + ko'k pos-handle + qizil size-chip + **kulrang offset-chip (🔒) panel qirralarида** + oq radius + yashil ✓ + pastki-sheet `[U-profil↕] [Удалить]`.
**Bizники:** qizil ◀▶▲ + ko'k pos + **spatial xoch-tarqoq** chiplar (offsetlar chetларда, size/radius burchakларда) + qulflar (ko'rinib o'chadi) + yumaloq U + ✓ + pastki-sheet `[🗑 Удалить]`.
**Solishtiruv — Funksiya ~92% · UI ~88%.** **Yo'q: profil-tanlagич.**

---

## 07 — `07-window-a/b.png` · F7 WINDOW (окно)
**Moblo:** qizil ◀▶▲▼ + ko'k markaz ✥ + **kulrang offset-chip (🔒) qirralarда** + qizil size + radius + yashil ✓ + pastki-sheet `[▢-profil↕] [markaz ⊹] [dublikat ⧉] [Удалить]`.
**Bizники:** qizil ◀▶▲▼ + ko'k ✥ + spatial offset/size/radius + ✓ + pastki-sheet `[⧉ Дублировать] [🗑 Удалить]`. **+ Ko'p-oyna** (dublikat) + buzilish-himoya.
**Solishtiruv — Funksiya ~92% · UI ~88%.** **Yo'q: profil-tanlagич + markaz-align ⊹.**

---

## 08 — `08-round-a/b/c.png` · F03 ROUND (скругление)
**Moblo:** burchak `[⬡⊕]` (yumaloqlanмаган) / holat (yumaloqlanган) + **kulrang ◐ drag-handle** + radius chip + link (4 burchak) + pastki-sheet.
**Bizники:** burchak-bracket pin + **kulrang round-handle** + radius chip + link + ✓ + pastki-sheet `[🗑 Удалить]`.
**Solishtiruv — Funksiya ~95% · UI ~90%.**

---

## 📊 JAMI (Moblo bilan 1:1)

| Asbob | Funksiya | UI |
|---|---|---|
| F1 Move | ~95% | ~85% |
| F2 Resize | ~90% | ~75% |
| F3 Rotate | ~95% | ~85% |
| F4 Target | ~90% | ~85% |
| F5 Chamfer | ~88% | ~85% |
| F6 Notch | ~92% | ~88% |
| F7 Window | ~92% | ~88% |
| F03 Round | ~95% | ~90% |
| **Chrome (umumiy)** | — | ~65% |
| **JAMI** | **~90%** | **~80%** |

## Eng katta UI-farqlar (Moblo → biz)
1. **Doimiy pastki tool-pill** (◇⧉↻🎨⁝⁝) — bizда rejim-tugmalar drawer'да. *(app-chrome=host)*
2. **Yuqori-bar** (home/nom/mm/menu) — bizда yo'q. *(app-chrome=host)*
3. **Chap-rail** (undo/camera/focus/menu) — bizда faqat focus/ground.
4. **F2 o'lcham-chiziqlar** panelда — bizда size-chip.
5. **Profil-tanlagич** (F5/F6/F7 pastki-sheet ⌐┐↕) — model tasdig'i kerak.
6. **Per-o'q ° readout** (F3) + **markaz-align ⊹** (F7).

## Halol xulosa
- **Funksiya ~90% 1:1** — yadro manipulyatsiya Moblo kabi ishlaydi.
- **UI ~80% 1:1** — indikator tizimi + editor declutter 1:1; qolgan farq = app-chrome (host ishi) + profil-tanlagич (model tasdig'i).
