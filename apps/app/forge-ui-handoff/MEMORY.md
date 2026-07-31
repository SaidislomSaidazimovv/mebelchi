# FORGE-UI — ISH QONUNLARI (doim bo'ysunamiz)

> Har qanday vazifada shu qonunlarga **so'zsiz** bo'ysunamiz. Bu fayl — pin/qadoq.
> Manba: `README.md` + `src/contract/types.ts` + `reference/` (Moblo screenshotlari).
> Faqat `forge-ui-handoff` ichida ishlaymiz — boshqa folderда emas.

> ⚑ **SESSIYA DAVOMI / KONTEKST YANGILANGANDA:** yangi chat, yangi sessiya yoki
> kontekst yangilanganда — ish boshlashдан OLDIN shu faylni + xotira faylини
> (`memory/forge-ui-handoff.md`) o'qiб chiqaman. Qayerga kelinganini (holat + vazifalar)
> va qaysi qonunlarга bo'ysunish kerakliгini shundan bilaman. Buni o'tkazib yubormayman.

## Maqsad
Karkas (yangi-dunyo) muharririning **F1–F7 jest+indikator qatlami**ni Moblo appi bilan
**1:1** qilish — avval **funksiya (ishlashi)**, so'ng mobil UI. Xo'jayin topshirig'i.

## Qonunlar (buzib bo'lmaydi)
1. **Zona:** faqat `src/ui/` o'zgartiriladi. `src/harness/` — o'z test uchun mumkin.
   **`src/contract/types.ts` — TEGILMAYDI** (appга yagona ko'prik).
2. **Birlik = mm10** (butun, o'ndan bir mm). 16mm=160, 600mm=6000. Santimetr faqat
   ekranда va uni **faqat `ui/measure.ts`** aylantiradi (1см=100mm10). Float yo'q,
   ikkinchi birlik yo'q — stanok fayli shundan yasaladi.
3. **Universal qoida (har asbob):** jest vaqtida → raqam + **punktir выноска**
   (boshlanish→hozir); qo'yib yuborgach → raqam **qoladi**, bosilsa **numpad**
   (qiymat oldindan tanlangan, matematika mumkin); so'ng **o'zi yo'qoladi**.
4. **Taqiqlar:** qalinlik/kromka/paz/styajka **qo'shmaslik** (profil beradi);
   UIда **yaxlitlash/magnit yo'q** (magnitlar modelда); **`@react-three/fiber`/`drei`
   YO'Q** (sof Three.js + `TransformControls`); `contract` tegmaslik.
5. **Yaxlitlash faqat `measure.ts`да** (`evalCmToMm10`/`evalDeg`, expr-eval). Boshqa
   joyда `Parser` chaqirilmaydi.
6. **Ish jarayoni (Mebelchi qoidasi):** READ→MEASURE→PROPOSE→ASK→build. O'zimdан
   qo'shmayman, o'ylab topmayman, o'zboshimchalik qilmayman. Reja tuzib tasdiqlataman.
7. **Modelдан nimadir kerak bo'lsa** — README oxiriga yozib, ish bilan qaytariladi
   (o'zim invent qilmayman).
8. **Topshirish:** faqat `src/ui/`. `npm run typecheck` + `npm run build` o'tishi shart;
   app tomonда 40 test + «✓ profil tozaligi» bedji (qizarsa qabul qilinmaydi).
9. **HECH QANDAY O'ZBOSHIMCHALIK YO'Q.** O'zimдан qo'shmayman, o'ylab topmayman,
   taxmin qilmayman. Kod ham, hisobot ham — **faqat grounded**: `reference/` (Moblo),
   kod, yoki tekshirilgan manba. Bilmasam «**tekshirilmagan**» deб ochiq belgilayman —
   o'ylab topib to'ldirmayman. O'ylab topib hisobot berish = juda noto'g'ri, umuman qilinmaydi.

## F1–F7 asboblari (reference = Moblo)
- **F1 · MOVE** (перемещение): yashil jonli pill + yashil punktir выноска; markaz-hub +
  o'qlar; «Измерение» ruletka.
- **F2 · RESIZE** (размер): qizil size-chip (✎) + L/T/W rang-kodли (R/G/B=X/Y/Z) tap-edit;
  qirra/yon sudrash.
- **F3 · ROTATE** (поворот): ko'k disk + pona (o'tilgan burchak) + boshqa o'qlar xira halqa;
  ko'k burchak-chip; per-o'q burchak readout.
- **F4 · TARGET** (нишон/выбор цели): ⬡⊕ pinlar — modifikatorни qayerga qo'yish (F5/F6/F7/F03 kirishи).
- **F5 · CHAMFER** (фаска): qirra profili (L-step); radius/chuqurlik chip + drag-tutqich.
- **F6 · CUTOUT/NOTCH** (вырез, qirraда): U-o'yiq; **qizil sudraladigan yon-tutqichlar** (◀▶⌒);
  qizil size + kulrang offset+qulf (lockable) + oq radius + ko'k pozitsiya + ✓/Удалить.
- **F7 · HOLE/WINDOW** (окно/отверстие, o'rtaда): to'rtburchak kesim; F6 bilan bir sistema
  (4 tomonга offset+qulf).
- **F03 · ROUND CORNER** (скругление): radius chip «15 ✎» + drag-tutqich + link + ✓/Удалить.

Rang-kodning ma'nosi (`measure.ts`): live=yashil · size=qizil · offset=kulrang(lockable) ·
angle=ko'k · radius=oq.

## ✅ VIDEO-TASDIQLANGAN (Moblo Notion demo mp4: move/resize/rotate/Focus/Magnetism/Uniform)
Manba: rasmiy Notion docs ичидаги demo videolar (kadrларга ajratildи, 2026-08-01).
- **RGB TASDIQLANDI:** o'q rangi = **qizil=X · yashil=Y(tik/yuqori) · ko'k=Z**. (Agentning «faqat
  ko'k» xulosаси ESKI App Store shotидан — noto'g'ri; hozirgi Moblo RGB ishlatади.)
- **F1 MOVE:** yashил tik o'q(Y) + qizил/ko'k yotиq o'qlar(X,Z) + markazда **4-tomon romb** (planar);
  tik siljitganда **yashил punktir chiziq → yerга** + yashил qiymat-chip; **teal disk** = anchor/fokus
  nuqта; pastда balandлик maydoni + «**Put on ground**» + «**Measure**» (ruletka) tugmаси.
- **F2 RESIZE:** yuzларда **rang-kod puk-tutqичлар** (qizил=X yuz, yashил=Y ust, ko'k=Z yuz); sudraganда
  o'sha o'q rangидаги **«{qiymat} ✎» chip**; pastда per-o'q readout (● qizил ● yashил ● ko'к) +
  **zanjир/link ikonка**; chip bosilса → «**Dimension**» oynаси (qiymat tanlangan, «ok»).
- **UNIFORM:** link/zanjир ikonка bosilса **ko'к yonади** → barcha o'q **proporsional** (readout ostида
  nuqтали chiziqlar = bog'langan).
- **F3 ROTATE:** **3 ta rang-kod halqа** (qizил/yashил/ko'к = X/Y/Z), faol o'q halqаси to'q, boshqалари
  xira; **faol o'q rangидаги pona/sектор** (o'tilган burчак); **«{burчак} ✎» chip faol o'q rangида**;
  pastда per-o'q ° readout + o'ngда aylanа-reset ikonка; chip bosilса → «**Angle**» oynаси (manfий mumkin).
- **MAGNETISM (snap):** bitта o'q bo'ylаб yaqinlashганда **ghost karkас-quti** (snap-nishon) + **ko'к
  masофа-chip**; faqat bitта o'qда. ⇒ Bizда **model tomonда** (UIда snap yo'q) — indikатор(ghost+chip)
  modelдан keladi (README oxiriга model-side need).
- **FOCUS:** yuzга teб anchor(sarиq disk) qo'yилади; resizeда **o'q rangидаги qirра-yo'naltiruvchи chiziq**.
- **NUMPAD:** Moblo oддий «Dimension»/«Angle» input (qiymat tanlangan+ok) — bizда `expr-eval` matematика
  ustunlиги (Moblo ham «simple math functions» qo'llайди, store).
- **Pastки toolbar:** [move-romb · duplicate-⧉ · rotate-↻ · materials-🎨 · transforms-⋮], faol=ko'к.
- ⚠️ **F4–F7 modifikатор gizmolari** (notch/hole/edge-machining/round) bu ESKI demoларда YO'Q —
  ular 2025.06 yangилиги; ular uchun **`reference/` stопkadrlari avtoritет** (founder shotlari). Sistema
  (RGB+chip+lock+handle) tasdiqlangan, gizmoлар reference'дан.

## Hozirgi holat (kodda)
BOR (poydevor): move-gizmo(translate)+live callback, panel qirra o'lcham-tutqichlari(2-qadam),
chip→numpad, suzuvchi o'lcham kartasi. IMKONIYAT bor lekin ulanmagan: `overlays`(F4–F7 kontur+punktir),
`rotationGizmo`(F3), `transformMode=rotate`, tones(live/offset/angle/radius), locked chip.

## ✅ F1 · MOVE — BAJARILDI + VIDEO/BARMOQ-TEST BILAN TASDIQLANDI (2026-08-01)
Faqat `src/ui/Stage3D.tsx` (+ `MeasureChip`/`Numpad`/`measure` qayta ishlatildi; contract tegilmadi).
- Sudrash paytida: **yashil punktir leader + yashil live pill (cm)**. Tik(Y) sudrashda leader panel→pol,
  raqam = **yergacha balandlik** (Moblo); yotiq(X/Z) leader start→hozir, raqam = **siljish**.
- Qo'yib yuborgach: **yashil ✎ resting chip** qoladi; bosilса **Numpad** (cm, expr-eval, oldindan tanlangan).
  Y→«Высота, см», X/Z→«Сдвиг, см». ✓ → aniq pozitsiya (`evalCmToMm10`) → `onDragPanel`. 4s auto-hide (numpad ochilса qolади).
- «Pol» = y=0; ixtiyoriy `groundY_mm10` prop (default 0) — model boshqa pol bersa shu orqali (README oxiriga yozildi).
- Barmoq-test (puppeteer): Y→«23,91» pill+leader→numpad«Высота»→«30» yozib→`drop 0,300,0`; X→«30,49»«Сдвиг» leader start→hozir. typecheck+build toza.
- Harness demo qizil «72 ✎» chip — test artefakti (yetkazilmaydi), F1 yashil chipga xalaqit bermaydi.
- Kelishilgan qarorlar: markaz-romb(planar) HOZIR yo'q(1-o'q); `Put on ground`/`Measure`/anchor = keyingi bosqich.

## ✅ F2 · RESIZE — BAJARILDI + BARMOQ-TEST BILAN TASDIQLANDI (2026-08-01), commit qilinmagan
`src/ui/Stage3D.tsx` (mavjud handle-drag ustiga) + `src/harness/Harness.tsx` (test: `resizeSide` — handle-drag'ni panelga qo'llash; demo qizil chip OLIB TASHLANDI — F2 bilan ziddiyat qilardi).
- Yon-handle (2-qadam: arm→drag) sudralganda: **qizil punktir leader (ikki yuz orasi) + qizil size-chip (sm)** = hosil bo'layotgan o'lcham. Qarama-qarshi yuz drag boshida qotiriladi.
- Qo'yib yuborgach: **qizil ✎ resting chip** → bosilса **Numpad «Размер, см»** → aniq o'lcham → `onDragHandle(newCoord)`, model qo'yadi (newCoord = oppositeCoord + sign*qiymat). 4s auto-hide.
- FAQAT en(x)+bo'y(y); chuqurlik(z)=profil (z-handle yo'q). uniform/link + rejimlar = keyingi.
- Barmoq-test (puppeteer): yMin arm→drag→qizil «97,98»+leader→numpad «Размер»→«80»→`resize yMin → -80мм` (balandlik aynan 80 sm). typecheck+build toza.

## ✅ IKKI FIX (2026-08-01, founder so'radi + tasdiqladi)
1. **Chip rangi:** `MeasureChip.tsx` — `className` dan `${live?" chip-live":""}` OLIB TASHLANDI. Endi rang faqat tone'dan (size=qizil doim, live paytida ham). F1 (tone="live") o'zgarmadi (yashil). Tasdiq: resize live chip color=rgb(229,52,43)=qizil.
2. **Bloklar drag paytida yo'qolardi:** `Stage3D.tsx` qayta-qurish effekti — `if(gizmoDraggingRef.current) return;` guruh o'chirishdan OLDINga ko'chirildi. Sabab: move-drag'da `panels` har freym o'zgaradi → effekt eski guruhni o'chirib, guardda chiqib ketardi → panel g'oyib. Endi guard oldin → guruh butun qoladi, TransformControls mesh'ni o'zi suradi. Resize (gizmoDraggingRef=false) hamon har freym qayta quriladi. Tasdiq: VERIFY-move-mid.png panel ko'rinadi.

## ✅ F3 · ROTATE — BAJARILDI + BARMOQ-TEST (2026-08-01), commit qilinmagan
`src/ui/Stage3D.tsx` + `src/harness/Harness.tsx` (rejim tugmasi translate↔rotate; onDragPanel rx/ry/rz saqlaydi; rotate rejimda handle yashirin).
- Rotate rejim → TransformControls'ning **3 rang-halqasi** (🔴X 🟢Y 🔵Z, o'zidan). Faol o'q sariq.
- Halqa sudralganda: **ko'k «{burchak}° ✎» chip** (tone="angle") + **swept pona** (ko'k sektor, o'tilgan burchakka to'ladi, har freym qayta quriladi).
- Qo'yib yuborgach: 90°ga snap (mavjud) → resting ko'k chip → **Numpad (deg) «Угол, °»** → commitRot 90°ga snaplab emit → panel aylanadi (renderBlock rx/ry/rz).
- ⚠️ **FAQAT 90° QADAM** — contract PartOrientation faqat asosiy tekisliklar; ixtiyoriy burchak = contract o'zgarishi (TAQIQ).
- Qarorlar (founder tasdiqladi): rejim kerak(ha), chip=ko'k(measure.ts, o'q-rangli emas), 90°(ha), pona(ha).
- Barmoq-test: Поворот→halqa→ko'k «-3/8°»+pona→numpad→90→`drop … ry=90°`. typecheck+build toza. Pona kichik burchakda ingichka, 90°da chorak-doira.

VAZIFALAR (README «Что плохо», muhimlik): 1)🔴 F6/F7 kesim tutqichlari 3Dда sudralsin (eng katta);
2)✅ jonli yashil chip (F1 — BAJARILDI); 3)🟡 kichik panelда kub↔o'q hamma o'lchamда sinalsin (P2);
4)🔴 F4 nishon-pin ikonografiyasi (⬡⊕); 5)✅ sudrab-burish (F3 — BAJARILDI). +F2 RESIZE BAJARILDI.
Endi qolgan asosiy: F4 nishon-pin → F5 chamfer/F03 round → F6/F7 kesim (eng katta) → #3 kichik-panel sinovi.
