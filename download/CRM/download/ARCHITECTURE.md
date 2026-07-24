# Kiến trúc Game: Tiên Hiệp AI MUD

> Tài liệu sống (living document) — sẽ được cập nhật trong quá trình thảo luận trước khi code.
> **Phiên bản: 0.3** (sau vòng thảo luận 2 — đã chốt toàn bộ)
> Cập nhật cuối: tích hợp câu trả lời §19 + Hệ thống trang bị 2 vòng (mới)

---

## 0. Thông tin dự án

| Mục | Giá trị |
|-----|---------|
| Tên dự án (tạm) | **Tiên Lộ** (có thể đổi) |
| Thể loại | Single-player AI MUD, Tiên Hiệp (Xianxia) |
| **Hình thức** | **PC app (desktop-class)**, KHÔNG phải mobile |
| Nền tảng | Web (Next.js 16 + App Router) — chạy local trên PC |
| Ngôn ngữ UI | Tiếng Việt |
| AI Provider | Nvidia NIM (OpenAI-compatible) — cloud API |
| Mô hình AI | **GLM 5.1** (thông dịch) + **DeepSeek v4** (logic) + **Kimi K2.6** (kể chuyện) |
| Lưu trữ | SQLite (Prisma) + Vector DB (LanceDB) |
| Realtime | socket.io mini-service (GM orchestration) |
| Giao diện | **Hybrid**: text narration + HUD đồ họa + AI-generated images |

---

## 1. Tầm nhìn & Phạm vi

### 1.1 Tầm nhìn
Một game MUD single-player trên PC nơi người chơi nhập vai một **tu sĩ** trên con đường cầu tiên chứng đạo. AI Game Master (GM) gồm 3 mô hình phối hợp:
- **GLM 5.1** tiếp nhận ngôn ngữ tự nhiên của người chơi → chuyển thành **Technical Blueprint** chuyên nghiệp
- **DeepSeek v4** nhận Blueprint → thực thi logic (parse, dice, validate, tính toán)
- **Kimi K2.6** nhận Blueprint + kết quả DeepSeek + ký ức dài → xây dựng đoạn truyện tiếng Việt tiên hiệp

Người chơi gõ lệnh tự do, AI hiểu, thực thi qua tool, kể lại bằng văn phong tiên hiệp. Game có **bản đồ thế giới khám phá được**, bí cảnh ẩn ngẫu nhiên, hệ thống pháp bảo 10 cấp × 5 phẩm chất, và cốt truyện chính phong cách **Diablo** (sandbox + tuyến tính xen kẽ).

### 1.2 Phạm vi MVP (Màn 1 — Phàm Gian)
- 5 cảnh giới chính: **Luyện Khí → Trúc Cơ → Kim Đan → Nguyên Anh → Hóa Thần**
- Hệ thống: tu luyện (active, KHÔNG bế quan), vũ kỹ, luyện đan, luyện khí/tạo đồ, **trang bị 2 vòng** (mới)
- 5 châu + bản đồ thế giới khám phá được (fog of war)
- 3-5 bí cảnh thiết kế + hệ thống bí cảnh ẩn ngẫu nhiên (đa số, biến mất sau 1 ngày in-game)
- AI GM 3 mô hình phối hợp (GLM → DeepSeek → Kimi)
- Save/Load 5 slot
- Cốt truyện chính sandbox (Diablo-style) + thọ nguyên + chuyển sinh
- AI-generated images phong cách **MU Online** cho cảnh quan/boss/bí cảnh
- **Ending**: khi đạt Hóa Thần viên mãn + hoàn thành 1 số mảnh ghép cốt truyện → **Phi Thăng Linh Giới** (chuyển sang Màn 2)

### 1.3 Ngoài phạm vi — dành cho Màn 2 (Linh Giới, post-MVP)
- **Phi Thăng Linh Giới**: thế giới mới hoàn toàn, cốt truyện khác, tông môn/yêu thú/pháp bảo cấp cao hơn
- Cảnh giới Linh Giới: **Luyện Hư → Phân Thân → Hợp Thể → Đại Thừa** (sau Hóa Thần)
- Hệ thống trận pháp & phù lục → **ĐÃ BỎ** khỏi MVP (có thể thêm ở Màn 2 nếu cần)
- Đa nhân vật / đệ tử
- PVP (single-player nên không cần)

---

## 2. Thiết lập thế giới (Setting)

### 2.1 Bối cảnh
Thế giới **Cửu Châu Đại Lục** — chín châu, mỗi châu có phong thổ và tông môn khác nhau. Tu tiên giới và phàm nhân giới song song tồn tại. Người chơi bắt đầu là một đệ tử ngoại môn nhỏ bé tại một tông môn kém nổi tiếng.

### 2.2 Bản đồ thế giới (MỚI — bắt buộc)
- **Bản đồ thế giới toàn cục**: người chơi phải **tự khám phá** (fog of war), ban đầu chỉ thấy vùng quanh tông môn khởi đầu
- **Phong thổ mỗi châu khác nhau**: ảnh hưởng linh khí, yêu thú, linh dược, khoáng sản
- **Tông môn + thành trì**: các điểm neo trên bản đồ, có NPC chịu trách nhiệm cung cấp thông tin

| Châu | Đặc sản | Tông môn tiêu biểu |
|------|---------|-------------------|
| Đông Châu | Linh điền, đan dược | Thanh Vân Tông (khởi điểm) |
| Nam Châu | Yêu thú, hỏa diễm | Huyết Ma Tông (ma đạo) |
| Tây Châu | Khoáng thạch, pháp bảo | Vạn Kiếm Tông |
| Bắc Châu | Băng hàn, linh tuyền | Hàn Nguyệt Các |
| Trung Châu | Linh khí nồng đặc, trung lập | Thiên Cơ Viện |

### 2.3 Phe thế lực
- **Chính đạo**: liên minh các tông danh môn
- **Ma đạo**: Huyết Ma Tông, Vô Ưu Cốc...
- **Tán tu**: không thuộc phe nào
- **Yêu tộc**: yêu thú tu luyện thành tinh
- **Ẩn thế tông môn**: chỉ xuất hiện khi đủ điều kiện

### 2.4 Hệ thống bí cảnh (MỚI — phong phú)

3 loại bí cảnh:

| Loại | Cách tìm | Tỷ lệ | Đặc điểm |
|------|---------|-------|----------|
| **Cố định** | Tự khám phá bản đồ / hỏi NPC tông môn, thành trì | Ít | Thiết kế sẵn, có cốt truyện, reward cố định |
| **NPC-guided** | Hỏi NPC chịu trách nhiệm (trưởng lão, đạo sỹ lang thang...) | Vừa | NPC cho tọa độ/gợi ý, player đi tới |
| **Ngẫu nhiên ẩn** | Sinh ngẫu nhiên khi khám phá + rớt theo thời gian | **Đa số** | **biến mất sau 1 ngày in-game**, reward random, có thể rất hiếm |

Bí cảnh ẩn ngẫu nhiên là **thành phần chính** của gameplay thám hiểm — tạo cảm giác luôn có điều mới mẻ.

Bí cảnh cố định MVP:
- **U Minh bí cảnh** — mở mỗi 100 năm, linh thảo cổ nhưng đầy nguy hiểm
- **Kiếm Trũng** — thánh địa kiếm tu, có kiếm linh
- **Thái Sơ bí cảnh** — chỉ Kim Đan trở lên mới vào được

---

## 3. Hệ thống tu luyện (Cultivation System)

### 3.1 Cảnh giới & Cấp độ

| Cảnh giới | Số cấp | Phân giai | Ghi chú |
|-----------|-------|-----------|---------|
| **Luyện Khí** | 13 | Tuyến tính (không phân giai) | Hấp thu linh khí, mở meridian |
| **Trúc Cơ** | 12 | Sơ/Trung/Hậu/Viên mãn × 3 | Xây nền móng đạo cơ |
| **Kim Đan** | 12 | Sơ/Trung/Hậu/Viên mãn × 3 | Ngưng kết kim đan |
| **Nguyên Anh** | 12 | Sơ/Trung/Hậu/Viên mãn × 3 | Sinh ra nguyên anh |
| **Hóa Thần** | 12 | Sơ/Trung/Hậu/Viên mãn × 3 | Thần thức ngoại phóng, cảnh giới tối cao MVP |

**Tổng số cấp MVP**: 13 + 12×4 = **61 cấp**.

#### 3.1.1 Luyện Khí 13 cấp — tuyến tính
Quyết định: **13 cấp tuyến tính, không phân giai** (per góp ý). Mỗi cấp tăng +3 điểm stats. Đột phá Trúc Cơ khi đạt cấp 13.

### 3.2 Linh căn (Spiritual Root) — HỆ THỐNG NHIỀU THANH EXP (MỚI)

Linh căn là **hệ thống tăng cấp từng thanh EXP riêng biệt**:

| Loại linh căn | Số thuộc tính | Số thanh EXP | Tốc độ tu luyện | Ưu điểm |
|---------------|--------------|-------------|-----------------|---------|
| Thiên linh căn (đơn) | 1 | 1 | ★★★★★ | Nhanh nhất |
| Dị linh căn (Lôi/Băng/Phong...) | 1 | 1 | ★★★★★ | Nhanh + hiếm |
| Chân linh căn (2 thuộc) | 2 | 2 | ★★★★ | Cân bằng |
| Tam linh căn | 3 | 3 | ★★★ | Khá |
| Tứ linh căn | 4 | 4 | ★★ | Chậm |
| Ngũ linh căn | 5 | 5 | ★ | Chậm nhất NHƯNG phù hợp nhiều công pháp nhất → dễ chọn công pháp |

**Cơ chế cốt lõi**:
- Mỗi linh căn có **1 thanh EXP riêng**, cần fill đầy để lên cấp linh căn
- Linh căn càng nhiều = càng nhiều thanh cần fill = tu luyện càng chậm
- Cần **thiên tài địa bảo** để tăng EXP linh căn (không chỉ dựa vào thời gian)
- **Linh căn có thể tăng cấp**: từ ngũ → tứ → tam → chân → thiên (cần vật liệu cực hiếm)

Thuộc tính: **Kim, Mộc, Thủy, Hỏa, Thổ** + ẩn: **Lôi, Băng, Phong, Ám, Quang**.

### 3.3 Công pháp & Vũ kỹ (MỚI — drop + suy diễn)

#### 3.3.1 Phân biệt
- **Công pháp**: pháp môn tu luyện, có **thuộc tính** (Hỏa, Phong...). Tăng tốc độ tu luyện + hiệu ứng thuộc tính. Cần **linh căn phù hợp** mới tu luyện được.
- **Vũ kỹ**: chiêu thức chiến đấu (skill tung ra tấn công). Có thuộc tính + hiệu ứng combat.

#### 3.3.2 Cách thu được
- **Drop ngẫu nhiên** từ: đánh quái, đánh boss, giết NPC, khám phá bí cảnh
- **Bí cảnh ẩn ngẫu nhiên**: hay rớt công pháp/vũ kỹ hiếm
- **Mảnh công pháp/vũ kỹ** (fragments): collect đủ → hợp thành bản hoàn chỉnh
- **Sư truyền**: NPC sư phụ dạy (cần quan hệ tốt)

#### 3.3.3 Suy diễn (Deduction System) — tính năng độc đáo
- Khi có **công pháp/vũ kỹ đã học**, player có thể **gặp** công pháp/vũ kỹ khác để **suy diễn ra loại mới**
- Kết quả: công pháp/vũ kỹ mới với **phẩm chất cao hơn** (ví dụ: Huyền cấp + Huyền cấp → Địa cấp)
- Có tỷ lệ thành công (dựa ngộ tính + vật liệu hỗ trợ)
- Có thể thất bại → mất vật liệu, giữ nguyên công pháp gốc

#### 3.3.4 Ràng buộc thuộc tính
- Mỗi công pháp có thuộc tính (vd: Hỏa Vân Quyết = Hỏa)
- **Linh căn không khớp thuộc tính → không thể tu luyện**
- Ngũ linh căn: tuy chậm nhưng phù hợp nhiều công pháp → dễ lựa chọn

### 3.4 Đột phá cảnh giới (Breakthrough) — MỚI

| Từ → Đến | Yêu cầu | Tỷ lệ thành công | Thất bại |
|----------|---------|-----------------|---------|
| Luyện Khí 13 → Trúc Cơ | Đạt cấp 13 + Trúc Cơ Đan | **Thấp** (30-50%) | Tụt 1-3 cấp, có thể bị thương |
| Trúc Cơ viên mãn → Kim Đan | Viên mãn + Kim Đan tài liệu + ngộ "đan ý" | **Thấp** (20-40%) | Tâm ma, tụt cảnh giới |
| Kim Đan viên mãn → Nguyên Anh | Viên mãn + Nguyên Anh Đan + **Thiên Kiếp phó bản** | Trung (50%) + qua Thiên Kiếp | Thiên kiếp sát thương lớn |
| Nguyên Anh viên mãn → Hóa Thần | Viên mãn + Hóa Thần vật liệu + **Thiên Kiếp phó bản (mạnh)** | Trung (50%) + qua Thiên Kiếp kép | Thiên kiếp + tâm ma kép |

#### 3.4.1 Đan dược hỗ trợ đột phá
- Mỗi cảnh giới có **nhiều loại đan dược** tăng tỷ lệ thành công (cộng dồn)
- Vd Trúc Cơ: Trúc Cơ Đan (base +20%), Tẩy Tủy Đan (+10%), Cố Nguyên Đan (+10%), Cảm Ngộ Đan (+10%)
- Đan dược hiếm hơn = bonus cao hơn

#### 3.4.2 Thiên Kiếp phó bản (từ Nguyên Anh trở lên)
- Không phải auto-roll, mà là **phó bản thực sự** (dungeon)
- Nhiều loại thiên kiếp với cơ chế khác nhau:
  - **Lôi kiếp**: dodge + tank lôi điện
  - **Hỏa kiếp**: kháng hỏa + DPS nhanh
  - **Phong kiếp**: né gió lốc
  - **Tâm ma kiếp**: ảo cảnh, lựa chọn đạo tâm
- **Boss thiên kiếp**: yêu thú/Hóa thần-level với thuộc tính khác nhau
- Player cần **chuẩn bị trước**: đan dược phù hợp (kháng tính), pháp bảo mạnh, vũ kỹ đúng loại
- Càng lên cao càng nhiều loại thiên kiếp cùng lúc

### 3.5 Thần thức & Tuổi thọ (MỚI — khám phá bản đồ)

| Cảnh giới | Thần thức bán kính | Tuổi thọ tự nhiên |
|-----------|-------------------|-------------------|
| Luyện Khí | 10m | 120 năm |
| Trúc Cơ | 100m | 300 năm |
| Kim Đan | 1km | 800 năm |
| Nguyên Anh | 10km | 2000 năm |
| Hóa Thần | 100km | 5000 năm |

#### 3.5.1 Thần thức = công cụ khám phá bản đồ (MỚI)
- Khi mở bản đồ trong phạm vi thần thức → **hiện chấm quái, boss hiếm, phó bản ẩn**
- Thần thức càng lớn → thám hiểm/phát hiện thế giới hay ho càng nhiều
- Đây là **động lực tu luyện** mạnh: lên cảnh giới cao = khám phá được nhiều hơn

#### 3.5.2 Thọ nguyên & Chuyển sinh (XÁC NHẬN)
- **Thọ nguyên = tuổi thọ thật sự trôi qua** (khi hành động, khám phá, chiến đấu — KHÔNG có bế quan)
- Khi thọ nguyên hết → **chuyển sinh**: bắt đầu cuộc đời mới
- **Giữ lại** (per xác nhận §19.3):
  - **Ngộ tính (WIS) stat** — giữ nguyên (rất quan trọng cho cân bằng, tạo progression vĩnh viễn)
  - Trang bị đang mặc/cầm
  - Tiền (linh thạch)
  - Bí kíp công pháp/vũ kỹ đã học
  - Cấp luyện đan/luyện khí skill
- **Mất** (reset):
  - Cảnh giới (về Luyện Khí 1)
  - Cấp linh căn (về mức ban đầu)
  - Stats cơ bản khác (STR, CON, INT, DEX, WIL) — về theo linh căn mới
  - Quan hệ NPC (reset về trung lập)
  - Vị trí (về tông môn khởi đầu)
- Chuyển sinh = cơ hội thử linh căn khác, con đường khác — **vòng lặp rogue-like dài hạn**

---

## 4. Hệ thống nhân vật (Character)

### 4.1 Character Sheet

```
┌─ THANH NHÂN ──────────────────────────────────┐
│ Cảnh giới: Luyện Khí 7/13                      │
│ Tuổi: 16 (thọ nguyên: 120/120)                 │
│ Linh căn: Thủy + Mộc (chân linh căn)           │
│   ├─ Thủy: ████████░░ 80%                      │
│   └─ Mộc: █████░░░░░ 50%                       │
│ Công pháp: Thanh Vân Quyết — Tầng 3             │
├─ SINH LÝ ──────────────────────────────────────┤
│ Khí huyết: 850/850    Pháp lực: 320/320        │
│ Thể lực: 100/100      Thần thức: 45/45         │
├─ ĐIỂM CHI SỐ ──────────────────────────────────┤
│ Sức mạnh (STR): 12    Căn cốt (CON): 18        │
│ Linh lực (INT): 22    Thân pháp (DEX): 14      │
│ Ngộ tính (WIS): 25    Đạo tâm (WIL): 15        │
├─ KINH NGHIỆP ──────────────────────────────────┤
│ Tu vi tiến độ: 67% (Luyện Khí 7 → 8)           │
│ Nhân quả: +12 (thiện)   Sát nghiệp: 3 (ác)    │
└────────────────────────────────────────────────┘
```

### 4.2 Stats & Scaling (MỚI — tăng theo cấp cảnh giới)

| Cảnh giới | Điểm stats / cấp | Ghi chú |
|-----------|-----------------|---------|
| Luyện Khí | **+3** / cấp | 13 cấp → +39 điểm tổng |
| Trúc Cơ | **+10** / cấp | 12 cấp → +120 điểm |
| Kim Đan | **+30** / cấp | 12 cấp → +360 điểm |
| Nguyên Anh | **+50** / cấp | 12 cấp → +600 điểm |
| Hóa Thần | **+70** / cấp | 12 cấp → +840 điểm |
| *(Luyện Hư — post-MVP)* | *(+90 / cấp)* | *dành cho Màn 2* |

> Quyết định: dùng dãy 3, 10, 30, 50, 70, 90. Cấp 90 dành cho Luyện Hư (post-MVP).
> ❓ **Cần xác nhận**: Bạn viết "Kim đan 30, Kim đan 50, Nguyên Anh 70, Hóa Thần 90" — tôi hiểu là typo và map thành KD=30, NA=50, HT=70, LH=90. Đúng không?

Mỗi lên 1 cấp: điểm stats tự động tăng theo bảng trên + tự động tăng theo công pháp. Player được phân bổ.

### 4.3 Trạng thái (Status Effects)

- Tích cực: **Pháp bảo hộ thể**, **Đan dược tăng tu vi**, **Cảm ngộ** (+ngộ tính), **Kháng tính** (từ đan)
- Tiêu cực: **Tẩu hỏa nhập ma** (đột phá thất bại), **Trúng độc**, **Tâm ma** (đạo tâm giảm), **Linh lực cạn kiệt**, **Trọng thương**, **Kháng tính giảm** (từ thiên kiếp)
- Vĩnh viễn: **Tàn phế** (kinh mạch đứt, cần đan dược trị), **Đạo thương** (tổn thương nguyên thần)

---

## 5. Hệ thống vũ kỹ & thần thông (Martial Arts)

### 5.1 Phân loại

| Loại | Mô tả | Ví dụ |
|------|-------|-------|
| **Công pháp** | Pháp môn tu luyện, có thuộc tính | Thanh Vân Quyết, Hỏa Vân Quyết |
| **Vũ kỹ tấn công** | Chiêu thức chiến đấu (skill) | Hàn Tinh Kiếm Pháp, Phách Sơn Chưởng |
| **Thân pháp** | Di chuyển, né đòn | Lăng Ba Vi Bộ, Phong Ảnh Bộ |
| **Phòng ngự** | Chống đòn | Kim Chung Tráo, Hộ Thân Khí |
| **Trợ lực** | Hỗ trợ battle | Khí Kích Phấn Trắc, Phục Ma Ấn |
| **Thần thông** | Kỹ năng tối cao, mở từ Kim Đan | Tam Muội Chân Hỏa, Tịch Diệt Ma Ảnh |

### 5.2 Cấp bậc

| Cấp | Yêu cầu cảnh giới | Hiếm |
|-----|------------------|------|
| Phàm | Luyện Khí | Phổ biến |
| Huyền | Luyện Khí viên mãn + | Khá phổ biến |
| Địa | Trúc Cơ + | Hiếm |
| Thiên | Kim Đan + | Rất hiếm |
| Thần | Nguyên Anh + | Cực hiếm, thường tự suy diễn ra |

### 5.3 Học & Lĩnh ngộ & Suy diễn (MỚI)

**Học**:
- Đọc ngọc giản → cần thần thức đủ mạnh
- Sư truyền → cần quan hệ tốt với NPC
- Drop từ quái/boss/NPC/bí cảnh (xác suất)
- Mảnh ghép → collect đủ → hợp thành

**Lĩnh ngộ tầng sâu**:
- Mỗi vũ kỹ 3-9 tầng
- Cần tu luyện + ngộ tính check
- Tầng sâu hơn = hiệu ứng mạnh + yêu cầu cảnh giới cao

**Suy diễn (Deduction)** — tính năng độc đáo:
- 2+ công pháp/vũ kỹ đã học → suy diễn ra loại mới phẩm chất cao hơn
- Tỷ lệ thành công dựa ngộ tính + vật liệu hỗ trợ
- Thất bại → mất vật liệu, giữ nguyên gốc
- Có thể ra công pháp/vũ kỹ **thuộc tính mới** (vd Hỏa + Phong → Hỏa Phong dung hợp)

**Tự sáng tạo thần thông** (cuối game):
- Nguyên Anh + có thể kết hợp 2-3 vũ kỹ → sáng tạo thần thông
- AI GM hỗ trợ sáng tạo dựa trên ý tưởng player

### 5.4 Cooldown & Pháp lực

- Vũ kỹ có **CD** + **MP cost** + **thể lực cost**
- **Real-time cooldown**: CD chạy theo thời gian thật (không theo turn) — per góp ý "combat có element real-time"
- Thần thông có **long CD** (1 battle, 1 ngày, 1 tháng)

---

## 6. Hệ thống luyện đan (Alchemy) — MỚI, phong phú

### 6.1 Thành phần

| Thành phần | Mô tả | Cách có |
|-----------|-------|---------|
| **Đan phương** (recipe) | Công thức, có cấp bậc | Drop từ khu quái cùng cấp, hoặcNPC bán |
| **Linh dược** (herbs) | Vật liệu chính | Drop quái, hái ở linh điền/bí cảnh |
| **Đan lô** (furnace) | Dụng cụ, ảnh hưởng tỷ lệ | Mua hoặc drop hàng quý từ quái/bí cảnh |
| **Đan hỏa** (fire) | Ngọn lửa, có cấp | **Hiếm**, thường chỉ ở bí cảnh/bí cảnh ẩn |
| **Luyện đan sư skill** | Cấp độ người chơi | Tăng qua việc luyện thành công đan |

### 6.2 Cấp bậc đan dược

| Cấp đan | Yêu cầu luyện đan sư | Ví dụ | Độ hiếm drop |
|---------|---------------------|-------|-------------|
| Phàm cấp | Cấp 1-3 | Tụ Khí Đan, Hồi Huyết Đan | Phổ biến |
| Linh cấp | Cấp 4-6 | Trúc Cơ Đan, Hỏa Linh Đan | Khá phổ biến |
| Huyền cấp | Cấp 7-9 | Kim Đan Đan, Tẩy Tủy Đan | Hiếm |
| Địa cấp | Cấp 10-12 | Nguyên Anh Đan, Cố Nguyên Đan | Rất hiếm |
| Thiên cấp | Cấp 13+ | Hóa Thần Đan, Độ Kiếp Đan | Cực hiếm |

### 6.3 Phân loại đan dược theo hiệu ứng (MỚI — phong phú)

Tỷ lệ drop từ phổ biến → hiếm:

| Loại | Hiệu ứng | Độ hiếm |
|------|---------|---------|
| **Hồi phục** | Hồi HP/MP/thể lực | Rất phổ biến (dễ thấy) |
| **Tu luyện** | Tăng EXP tu vi | Khá phổ biến |
| **Tăng ngộ tính** | Tăng ngộ tính tạm thời, +exp học bí kíp, +tỷ lệ suy diễn | Ít |
| **Tăng stats cơ bản** | +STR/CON/INT... vĩnh viễn hoặc tạm thời | Ít |
| **Đột phá** | Tăng tỷ lệ đột phá cảnh giới | Hiếm |
| **Đặc biệt** | Hiệu ứng độc đáo thời gian ngắn (vd: tàng hình 1h, doubledamage 10 phút) | Rất hiếm |

**Khu quái cấp nào → drop đan phương/linh dược cấp đó** (tương ứng). Tỷ lệ drop thấp hơn cho đan đột phá.

**Trong bí cảnh/phó bản**: drop đan dược các loại cao hơn đáng kể.

### 6.4 Đan hỏa (cốt lõi)

| Loại hỏa | Cấp | Nguồn | Độ hiếm |
|----------|-----|-------|---------|
| Phàm hỏa | — | Lửa thường | Có sẵn |
| Linh hỏa | Linh | Linh mạch, linh thạch | Mua/hái |
| Địa hỏa | Địa | Núi lửa địa mạch | Bí cảnh |
| Thiên hỏa | Thiên | Thiên lôi hỏa | Bí cảnh hiếm |
| Thần hỏa | Thần | Cổ thần di lưu | Bí cảnh ẩn |
| Dị hỏa | Đặc biệt | Thiên địa dị tượng | Cực hiếm, unique |

Cấp hỏa cao → tỷ lệ thành công đan cấp cao tăng + có hiệu ứng đặc biệt.

### 6.5 Quy trình luyện đan (AUTO-ROLL, per góp ý)

```
1. Chọn đan phương (đã học)
2. Chuẩn bị linh dược (đúng số lượng + chất lượng)
3. Chọn đan lô + đan hỏa
4. AUTO-ROLL (không mini-game):
   - Base rate từ phương + đan lô + hỏa
   - Modifier: skill level, ngộ tính, linh căn phù hợp
   - Roll → 1 trong 3 kết quả:
     a. Thành công — thường phẩm
     b. Thành công — thượng phẩm (cấp +1 hiệu ứng, tỷ lệ thấp)
     c. Thất bại — phế đan (vật liệu mất, được "phế đan" có thể tái chế)
5. Đánh giá đan → có thể có "đan vân" (1-9 vân, càng nhiều càng quý, tỷ lệ rất thấp)
```

### 6.6 Skill progression

Luyện đan là skill riêng (1-15+). Lên cấp bằng cách:
- Luyện thành công đan (XP theo cấp đan)
- Đọc đan thư (rare drop)
- Bái sư đan sư NPC

Phẩm chất đan (thường/trung/thượng) phụ thuộc trình độ luyện đan sư.

---

## 7. Hệ thống luyện khí / tạo đồ (Crafting) — MỚI, 10 cấp × 5 phẩm

> ⚠️ **Lưu ý thuật ngữ**: "Luyện khí" ở đây = luyện chế pháp bảo (artifact crafting), KHÔNG phải cảnh giới Luyện Khí. Trong code sẽ gọi là `crafting`.

### 7.1 Thành phần

| Thành phần | Mô tả |
|-----------|-------|
| **Khí phương** (blueprint) | Công thức tạo đồ, có cấp bậc |
| **Vật liệu** | Quặng, linh tinh, yêu thú nội đan, linh mộc... (hệ thống vật liệu PHONG PHÚ per góp ý) |
| **Luyện khí đài** | Bàn luyện, có cấp |
| **Chân hỏa / Đan hỏa** | Nguồn lửa, dùng chung với luyện đan |

### 7.2 Cấp bậc pháp bảo (MỚI — 10 cấp × 5 phẩm chất)

| # | Cấp pháp bảo | Yêu cầu luyện khí sư | Hiếm |
|---|-------------|---------------------|------|
| 1 | Pháp khí | Cấp 1-3 | Phổ biến |
| 2 | Linh khí | Cấp 4-6 | Khá phổ biến |
| 3 | Linh bảo | Cấp 7-9 | Hiếm |
| 4 | Thông Thiên Linh bảo | Cấp 10-12 | Rất hiếm |
| 5 | Huyền Thiên Linh Bảo | Cấp 13-15 | Cực hiếm |
| 6 | Huyền Thiên Chí Bảo | Cấp 16-18 | Huyền thoại |
| 7 | Huyền Thiên Thánh Bảo | Cấp 19-21 | Thần thoại |
| 8 | Tiên khí | — | Cổ bảo, chỉ tìm được |
| 9 | Huyền Thiên Tiên khí | — | Unique, cốt truyện |
| 10 | Huyền Thiên Thánh khí | — | Unique, endgame |

Mỗi cấp pháp bảo chia **5 phẩm chất**:

| Phẩm | Tên | Tỷ lệ tạo được | Đặc điểm |
|------|-----|----------------|---------|
| 1 | Hạ phẩm | 60% | Cơ bản |
| 2 | Trung phẩm | 25% | +10% hiệu ứng |
| 3 | Thượng phẩm | 10% | +25% hiệu ứng, có 1 bonus |
| 4 | Cực phẩm | 4% | +50% hiệu ứng, có 2 bonus |
| 5 | Tuyệt phẩm | 1% | +100% hiệu ứng, có 3 bonus + linh tính |

**Vật liệu có thể tăng tỷ lệ** nhưng vẫn rất khó (per góp ý: "nguyên liệu có thể tăng tỷ lệ nhưng vẫn khó nhằn").

### 7.3 Thuộc tính pháp bảo

- **Loại**: kiếm, đao, ấn, lưỡng, chuông, kính, phù, phi kiếm...
- **Sát thương cơ bản** (cho vũ khí) / **Hiệu ứng phòng ngự** (cho phòng cụ)
- **Hiệu ứng phụ**: tăng stat, buff kỹ năng, kháng tính...
- **Linh tinh** (slots): số lượng bonus có thể khắc
- **Linh tính**: pháp bảo cấp 3+ có "ý thức", cần thuần phục

### 7.4 Crafting — 3 loại (MỚI)

#### 7.4.1 Tạo đồ mới
- Cần khí phương + vật liệu + đài + hỏa
- Auto-roll → phẩm chất random theo tỷ lệ §7.2
- Có thể ra cực/tuyệt phẩm nếu may mắn + vật liệu tốt

#### 7.4.2 Nâng cấp đồ cũ
- Pháp bảo + vật liệu cao cấp → tăng cấp pháp bảo (vd Pháp khí → Linh khí)
- Tỷ lệ thấp, thất bại → giữ nguyên hoặc giảm 1 phẩm
- Cần vật liệu cùng thuộc tính

#### 7.4.3 Ghép đồ (Random fusion)
- 2+ pháp bảo → ghép ngẫu nhiên
- Kết quả: pháp bảo mới với **thuộc tính/hiệu ứng random**
- Có thể ra hiếm (may mắn) hoặc phế phẩm
- Cơ chế "cờ bạc" — khuyến khích thử nghiệm

---

## 8. Hệ thống trang bị (Equipment) — MỚI, 2 vòng + ngũ hành set bonus

### 8.1 Tổng quan 2 vòng trang bị

Người chơi có **2 vòng trang bị** (inner + outer), tổng cộng **10 slot**:

#### Vòng trong (Inner Ring) — 5 slot
| Slot | Tên gọi | Loại pháp bảo |
------|---------|---------------|
| Mũ | Đầu quản | Quan / Miện / Đaida |
| Áo | Huyền y | Giáp / Bào / Y |
| Quần | Hạ phục | Khôi / Phục |
| Găng tay | Thủ tấu | Tấu / Hộ thủ |
| Giày | Lý bộ | Lý / Hài |

#### Vòng ngoài (Outer Ring) — 5 slot
| Slot | Tên gọi | Loại pháp bảo |
------|---------|---------------|
| Dây chuyền | Liên chuỗi | Liên / Anh lạc |
| Nhẫn trái | Tả chỉ | Chỉ (ring) |
| Nhẫn phải | Hữu chỉ | Chỉ (ring) |
| Ngọc bội | Ngọc bội | Bội / Linh ngọc |
| Thắt lưng | Yêu đới | Đới / Đai |

**Plus**: 1 slot vũ khí (separate, không thuộc 2 vòng) → tổng **11 slot trang bị**.

### 8.2 Ngũ hành thuộc tính của trang bị

Mỗi trang bị có **1 ngũ hành thuộc tính chính**: Kim, Mộc, Thủy, Hỏa, Thổ.

- Vũ khí: thuộc tính ảnh hưởng **sát thương**
- Trang bị vòng trong: thuộc tính ảnh hưởng **phòng ngự + sinh lý**
- Trang bị vòng ngoài: thuộc tính ảnh hưởng **chỉ số chiến đấu + meta**

### 8.3 Set Bonus — CƠ CHẾ CỐT LÕI (MỚI)

#### 8.3.1 Inner Ring Set Bonus (Vòng trong)
**Điều kiện kích hoạt**:
- **5/5 slot vòng trong được trang bị**
- **Tập hợp 5 trang bị có ít nhất 3 ngũ hành thuộc tính khác nhau** (đa dạng ngũ hành)

**Phần thưởng** (kích hoạt khi đủ điều kiện):

| Chỉ số tăng | Mức tăng | Loại |
-------------|---------|------|
| Khí huyết (HP) | +10% max HP | % |
| Pháp lực (MP) | +10% max MP | % |
| Thể lực (Stamina) | +15% max Stamina | % |
| Thần thức | +10% max Divine Sense | % |
| Căn cốt (CON) | +5 điểm | flat |
| Tỷ lệ chí mạng (Crit Rate) | +3% | % |

**Ví dụ**: 5 món vòng trong có ngũ hành [Kim, Mộc, Thủy, Hỏa, Thổ] → 5 ngũ hành ≥ 3 → KÍCH HOẠT.
**Ví dụ 2**: 5 món toàn Hỏa → chỉ 1 ngũ hành < 3 → KHÔNG kích hoạt.

#### 8.3.2 Outer Ring Set Bonus (Vòng ngoài)
**Điều kiện kích hoạt**:
- **3/5 slot vòng ngoài được trang bị trở lên** (3, 4, hoặc 5 món đều được)
- **Tập hợp các trang bị có ít nhất 3 ngũ hành thuộc tính khác nhau** (đa dạng ngũ hành, cùng cơ chế vòng trong)

**Phần thưởng** (kích hoạt khi đủ điều kiện):

| Chỉ số tăng | Mức tăng | Loại |
-------------|---------|------|
| Sức mạnh (STR) | +5 điểm | flat |
| Linh lực (INT) | +5 điểm | flat |
| Thân pháp (DEX) | +5 điểm | flat |
| Ngộ tính (WIS) | +3 điểm | flat |
| Đạo tâm (WIL) | +3 điểm | flat |
| Tỷ lệ chí mạng (Crit Rate) | +3% | % |

**Tier bonus** (càng nhiều món càng mạnh):
- 3 món: bonus cơ bản (như trên)
- 4 món: ×1.5 bonus
- 5 món: ×2.0 bonus + **+5% sát thương chí mạng** (crit damage)

### 8.4 Tương tác ngũ hành giữa 2 vòng

**Phục sinh ngũ hành** (cơ chế nâng cao — optional):
- Nếu vòng trong + vòng ngoài cùng kích hoạt set bonus → **cộng hưởng ngũ hành**
- 5 ngũ hành đều có mặt (cả 2 vòng) → bonus thêm:
  - +5% toàn bộ stats
  - +1 ngộ tính vĩnh viễn
  - Hiệu ứng "Ngũ hành hộ thể" — giảm 10% sát thương nhận vào

### 8.5 Phẩm chất trang bị

Trang bị cũng tuân theo **10 cấp pháp bảo × 5 phẩm chất** (per §7.2):
- Cấp 1 (Pháp khí) → Cấp 10 (Huyền Thiên Thánh khí)
- Phẩm: Hạ / Trung / Thượng / Cực / Tuyệt

**Mỗi cấp pháp bảo tăng**:
- Cấp 1-3 (Pháp khí → Linh bảo): +2-5 chỉ số chính / cấp
- Cấp 4-7 (Thông Thiên Linh bảo → Huyền Thiên Thánh Bảo): +8-15 chỉ số chính / cấp
- Cấp 8-10 (Tiên khí trở lên): +20-50 chỉ số chính / cấp, có hiệu ứng đặc biệt

### 8.6 Nâng cấp trang bị

- **Khảm trận văn** (per §7.4.2): thêm hiệu ứng vào slot
- **Tẩy luyện**: đổi ngũ hành thuộc tính (rủi ro cao, có thể giảm phẩm)
- **Hợp thể** (Nguyên Anh+): hợp pháp bảo vào thân, trở thành bản mệnh pháp bảo (không thể rớt khi chết)
- **Phong ấn**: trang bị cấp cao cần "phong ấn" để không ảnh hưởng người mới (giống hệ thống cấp yêu cầu)

### 8.7 Rớt trang bị khi chết

- Chết thường (HP=0, trọng thương): **KHÔNG rớt trang bị** (chỉ mất 10% tu vi)
- Bị kill (NPC chọn kill): **rớt 1-3 trang bị vòng ngoài** (random) + mất 10% tu vi
- Chuyển sinh: **giữ toàn bộ trang bị** (per §3.5.2)
- Vũ khí bản mệnh (đã hợp thể): không bao giờ rớt

---

## 9. Hệ thống vật phẩm (Items) — MỚI, phong phú

### 9.1 Phân loại vật phẩm

| Loại | Ví dụ | Độ phong phú |
|------|-------|--------------|
| Linh dược | Linh chi, Huyết sâm, Thiên niên hỏa liên | Rất nhiều loại |
| Linh thạch | Hạ phẩm, trung phẩm, thượng phẩm, cực phẩm | 4 cấp |
| Quặng | Huyền thiết, tinh kim, hàn ngọc, hỏa tinh... | Nhiều loại theo thuộc tính |
| Yêu vật | Yêu thú nội đan, yêu cốt, yêu bì, yêu hồn... | Theo cấp yêu thú |
| Ngọc giản | Chứa bí kíp, đọc bằng thần thức | Nhiều loại |
| Đan dược | Như §6 | Phong phú |
| Pháp bảo | Như §7 | 10 cấp × 5 phẩm |
| Mảnh bí kíp | Fragments công pháp/vũ kỹ | Nhiều loại |
| Thiên tài địa bảo | Đặc biệt, unique | Hiếm |
| Bản đồ | Dẫn đến bí cảnh ẩn | Hiếm |
| Vật liệu đột phá | Trúc Cơ Đan nguyên liệu, Kim Đan nguyên liệu... | Theo cảnh giới |
| Vật liệu suy diễn | Hỗ trợ suy diễn công pháp/vũ kỹ | Hiếm |

> **Quyết định (per góp ý)**: Vì đan dược + bí kíp + pháp bảo rất phong phú → **hệ thống vật liệu cũng phải phong phú tương ứng**. Mỗi công thức cần 3-7 loại vật liệu khác nhau.

### 9.2 Cấp bậc vật phẩm (màu sắc)

| Cấp | Màu UI | Ví dụ |
|-----|--------|-------|
| Phàm | Trắng | Linh thạch hạ phẩm |
| Linh | Xanh lá | Linh thạch trung phẩm |
| Huyền | Xanh dương | Huyền thiết |
| Địa | Tím | Thiên tài địa bảo địa cấp |
| Thiên | Cam | Yêu vương nội đan |
| Thần | Vàng | Cổ thần di lưu |
| Tiên | Cầu vồng | Tiên khí cổ bảo (unique) |

### 9.3 Vật phẩm Unique (MỚI)

- Xuất hiện **ngẫu nhiên trong các bí cảnh đặc biệt** (không phải bí cảnh ẩn thông thường)
- **Tỷ lệ cực hiếm**
- Nâng cấp cần **nguyên liệu cao cấp tương ứng** (tìm ở bí cảnh cùng cấp hoặc cao hơn)
- Mỗi unique có **tên + lai lịch + hiệu ứng đặc biệt** riêng (AI GM sinh ra)
- Ví dụ: Thái Sơ cổ kiếm, Hỗn Nguyên Châu, Cửu Chuyển Kim Đan...

---

## 10. Hệ thống thế giới (World)

### 10.1 Cấu trúc bản đồ (MỚI — khám phá được)

```
Cửu Châu Đại Lục (overworld — fog of war)
├── Đông Châu (khởi đầu)
│   ├── Phàm nhân trấn (Thái Bình Trấn — điểm bắt đầu)
│   ├── Thanh Vân Sơn (tông môn khởi đầu)
│   ├── Linh điền
│   ├── [???] bí cảnh cố định (cần khám phá)
│   ├── [???] bí cảnh ẩn (random, biến mất)
│   └── ...
├── Nam Châu (cần khám phá)
│   └── ...
└── ...
```

- **Di chuyển**: từng bước ("đi bắc", "về tông môn", "đến Thái Bình Trấn")
- **Thời gian**: mỗi bước đi = 1 canh giờ (2h in-game)
- **Fog of war**: chỉ thấy vùng đã khám phá + vùng trong tầm thần thức
- **Thần thức quét**: trong phạm vi thần thức → hiện chấm quái, boss, phó bản ẩn

### 10.2 Địa điểm

| Loại | Chức năng |
|------|----------|
| Tông môn | Tu luyện, nhận nhiệm vụ, học bí kíp, thương phố, hỏi NPC |
| Phàm trấn | Mua bán, nghỉ ngơi, nghe tin đồn, hỏi NPC |
| Linh điền | Trồng linh dược |
| Bí cảnh cố định | Thám hiểm, săn bảo (thiết kế sẵn) |
| Bí cảnh ẩn | Random, biến mất sau thời gian |
| Yêu thú sào huyệt | Săn yêu (respawn) |
| Cấm địa | Nguy hiểm, có thưởng lớn |
| Tiên nhân di tích | Cốt truyện chính |
| Thiên kiếp đài | Đột phá Nguyên Anh+ (per §3.4.2) |

### 10.3 Thời gian thế giới

- 1 ngày in-game = 24 canh giờ
- 1 tháng in-game = 30 ngày
- **Không có bế quan** (per góp ý) — tu luyện thông qua combat, quest, đan dược, khám phá
- AI GM sinh ra sự kiện theo thời gian: lễ hội tông môn, bí cảnh mở, yêu thú tập kích

---

## 11. Hệ thống NPC

### 11.1 Loại NPC

| Loại | Vai trò |
|------|---------|
| Sư phụ | Dạy công pháp, vũ kỹ |
| Trưởng lão tông môn | Cấp nhiệm vụ, bán đan phương, **cung cấp thông tin bí cảnh** |
| Đạo sỹ lang thang | Bán bản đồ bí cảnh ẩn, cung cấp thông tin |
| Đồng tu | Bạn/thù, có thể nhóm đi bí cảnh |
| Tán tu | Giao dịch ngầm, có thể cướp |
| Yêu tu | Phe địch/đồng minh tùy nhân quả |
| Thương nhân | Mua bán vật phẩm |
| Yêu thú | Quái, có AI hành vi |
| Ẩn thế cao nhân | Quan trọng cốt truyện |
| Ma đầu | Trùm cốt truyện |

### 11.2 NPC state

Mỗi NPC có:
- **Tính cách** (trait): ôn hòa, điên cuồng, tham lam, chính trực...
- **Quan hệ với player**: -100 → +100
- **Cảnh giới + trang bị**
- **Lịch sử tương tác** (lưu trong vector DB)
- **Lịch trình** (NPC schedule): ở đâu lúc nào
- **Mục tiêu cá nhân** (quest giver / plot driver)
- **Kiến thức bí cảnh**: NPC nào biết bí cảnh nào (per §2.4)

### 11.3 NPC AI

- **Dialogue**: Kimi generate theo tính cách + quan hệ + kiến thức
- **Hành động**: DeepSeek reasoning trong combat / kịch bản
- **Ký ức**: Kimi lưu lịch sử tương tác, recall khi gặp lại

---

## 12. Hệ thống Combat (MỚI — real-time element)

### 12.1 Cấu trúc combat

- **Turn-based + real-time cooldown**: action có cooldown theo thời gian thật
- Mỗi turn: player hành động → NPC hành động → resolve
- Hàng đợi tốc độ (dựa Thân pháp)
- Real-time: CD vũ kỹ chạy theo giây thật, player có thể chờ CD rồi đánh tiếp

### 12.2 Loại hành động

| Hành động | Chi phí | Hiệu ứng |
|-----------|---------|----------|
| Tấn công thường | Thể lực | Sát thương cơ bản |
| Dùng vũ kỹ | MP + CD (real-time) | Sát thương kỹ năng |
| Dùng pháp bảo | MP | Hiệu ứng pháp bảo |
| Dùng đan dược | Turn | Hồi phục/buff |
| Phòng thủ | Thể lực | Giảm sát thương |
| Né tránh | Thể lực | Tăng né |
| Thần thức công kích | Thần thức | Tấn công hồn phách |
| Bỏ chạy | — | Cần vượt tốc độ địch |

### 12.3 Sát thương & phòng ngự

```
Damage = (Vũ kỹ base + STR × 2 + Linh lực × 1.5) × Cảnh giới hệ số × Vũ khí hệ số
       − (DEF cơ bản + Căn cốt × 2) × Cảnh giới hệ số × 0.5
       × Crit multiplier (1.5-3.0)
       × Thuộc tính khắc (Kim khắc Mộc, Mộc khắc Thổ, ...)
```

Engine thực hiện tính toán, AI chỉ mô tả kết quả.

### 12.4 Tử vong (MỚI — -10% tu vi)

- HP = 0 → **trọng thương**, mất **10% tu vi** (per góp ý)
- Không perma-death (trừ khi chọn chế độ khó)
- Có thể bị **giết chết** nếu địch chọn kill (mất thêm 10% tu vi + rớt đồ)
- **Nguyên Anh+** có **nguyên thần thoát xác** — cơ hội sống sót thứ 2 (nhưng mất pháp bảo)
- Thọ nguyên hết → **chuyển sinh** (per §3.5.2)

---

## 13. Hệ thống Quest — Diablo-style (MỚI)

### 13.1 Loại Quest (Diablo-style)

| Loại | Nguồn | Ví dụ |
|------|-------|-------|
| **Tông môn nhiệm vụ** | Trưởng lão, bảng nhiệm vụ | Săn 5 yêu thố, hái 10 linh thảo |
| **Bí cảnh nhiệm vụ** | Tự nhiên khi vào bí cảnh | Tìm cửa vào tầng 2, giết boss tầng cuối |
| **Cốt truyện chính** | Trigger qua sự kiện, **sandbox** | Khám phá lai lịch Thái Sơ cổ kiếm |
| **Nhân quả nhiệm vụ** | Từ hành động trước | Cứu 1 NPC → sau này NPC giúp lại |
| **Ẩn nhiệm vụ** | Explore + ngộ tính | Đọc cổ bia → mở bí cảnh ẩn |
| **Phe nhiệm vụ** | Phe thế lực | Thanh trừng ma tu |
| **Daily/Weekly** | Reset theo thời gian | Săn yêu, hái dược, luyện đan |

### 13.2 Cốt truyện chính — Sandbox (per góp ý)

- **KHÔNG tuyến tính A→Z**
- Nhiều **mảnh ghép cốt truyện** rải rác trong thế giới
- Player tự khám phá, tự ghép
- Mỗi mảnh ghép mở ra content mới (bí cảnh, NPC, công pháp)
- Có thể **play nhiều lần** và thấy cốt truyện khác nhau (replayability)
- Điểm nhấn: **AI-generated events** dựa trên lựa chọn player

### 13.3 Quest structure

```typescript
Quest {
  id: string
  type: QuestType
  giver?: NPCId
  title: string
  description: string  // narrative, by Kimi
  objectives: Objective[]
  rewards: Reward[]
  prerequisites?: Condition[]
  branches?: Quest[]   // nhánh lựa chọn
  consequences?: Event[] // ảnh hưởng world state
  isMainStory: boolean
  isGenerated: boolean  // AI-generated?
}
```

### 13.4 AI-generated quests

AI GM có thể **tự sinh quest** dựa trên:
- Bối cảnh player (cảnh giới, địa điểm, lịch sử)
- Phe thế lực động thái
- Trigger sự kiện (NPC gặp, bí cảnh vào)
- Replayability (tránh trùng lặp với lịch sử)

**Luồng sinh quest**:
1. DeepSeek reasoning: tạo quest structure (type, objectives, rewards)
2. GLM interpret: viết description tiếng Việt
3. Engine validate feasibility
4. Lưu vào DB
5. Kimi nhớ quest này cho context sau

---

## 14. AI Game Master (3 mô hình) — KIẾN TRÚC MỚI

### 14.1 Kiến trúc: GLM → DeepSeek → Kimi (Pipeline)

Per góp ý: **GLM 5.1 là mô hình tiếp nhận thông tin từ người dùng, chuyển thành prompt chuyên nghiệp (Technical Blueprint), DeepSeek v4 và Kimi K2.6 nhận Blueprint để triển khai xây dựng.**

```
┌─ Player input (free text, Vietnamese) ──────────┐
│ "Ta muốn dùng Hỏa Vân Quyết tấn công con       │
│  hỏa long bằng kiếm Thái Sơ, kèm 1 viên        │
│  Bạo Phù"                                       │
└─────────────────────┬───────────────────────────┘
                      ▼
┌─ [1] GLM 5.1 — INTERPRETER ─────────────────────┐
│ Input: player text + character sheet + location │
│ Output: Technical Blueprint (TB)                │
│   {                                              │
│     intent: "combat_attack",                    │
│     parameters: {                               │
│       technique: "Hỏa Vân Quyết",               │
│       target: "hỏa long",                       │
│       weapon: "Thái Sơ cổ kiếm",                │
│       consumables: ["Bạo Phù x1"]               │
│     },                                          │
│     narrative_direction: {                      │
│       tone: "hào hùng",                         │
│       focus: "hỏa long phản ứng",               │
│       pacing: "nhanh"                           │
│     },                                          │
│     required_tools: ["attack", "use_talisman"], │
│     context_query: "lịch sử gặp hỏa long",      │
│     validation_checks: [                        │
│       "có Hỏa Vân Quyết?",                      │
│       "có Thái Sơ kiếm?",                       │
│       "có Bạo Phù?"                             │
│     ]                                           │
│   }                                             │
└─────────────────────┬───────────────────────────┘
                      ▼
┌─ [2] DeepSeek v4 — LOGIC ENGINE ────────────────┐
│ Input: TB + game state                          │
│ Action:                                         │
│   - Validate (chạy validation_checks)           │
│   - Call engine tools (function calling)        │
│   - Dice rolls, skill checks                    │
│   - Calculate damage, XP, drops                 │
│ Output: Structured result                       │
│   {                                              │
│     success: true,                              │
│     actions_executed: [...],                    │
│     state_changes: [                            │
│       {target: "hỏa long", hp: -450},           │
│       {item: "Bạo Phù", qty: -1},               │
│       {stat: "MP", delta: -50}                  │
│     ],                                          │
│     narrative_facts: [                          │
│       "Thái Sơ kiếm chém xuống",                │
│       "Hỏa Vân bốc cháy",                       │
│       "Hỏa long rống đau",                      │
│       "Bạo phù nổ cạnh sườn",                   │
│       "Hỏa long mất 450 HP, còn 1200"           │
│     ]                                           │
│   }                                             │
└─────────────────────┬───────────────────────────┘
                      ▼
┌─ [3] Kimi K2.6 — NARRATIVE BUILDER ─────────────┐
│ Input: TB + DeepSeek result + recalled memories │
│ Action:                                         │
│   - RAG recall (context_query → past events)    │
│   - Build narration from narrative_facts        │
│   - Apply tone/focus/pacing from TB             │
│   - Vietnamese, tiên hiệp style                 │
│ Output: Final narration                         │
│   "Thái Sơ kiếm rung lên bắn sáng —            │
│    Hỏa Vân Quyết vận chuyển, kiếm mang        │
│    diễm kích thẳng vào sườn long. Bão phù      │
│    nổ bùng bên hông, long tê tái rống lên,     │
│    vảy đỏ rụng lả tả. Hỏa long lảo đảo,        │
│    mất 450 huyết, còn 1200..."                 │
└─────────────────────┬───────────────────────────┘
                      ▼
┌─ [4] Engine ────────────────────────────────────┐
│ - Apply state_changes to game state             │
│ - Emit events to UI (HUD update)                │
│ - Save chronicle event for future recall        │
│ - Stream narration to player via socket.io      │
└─────────────────────────────────────────────────┘
```

### 14.2 Vai trò từng mô hình (tóm tắt)

| Model | Vai trò | Đầu vào | Đầu ra | Khi nào gọi |
|-------|---------|---------|--------|-------------|
| **GLM 5.1** | **Interpreter** — thông dịch + tạo Blueprint | Player text + state | Technical Blueprint (JSON) | Mỗi turn (bắt đầu) |
| **DeepSeek v4** | **Logic Engine** — thực thi logic | TB + state | Structured result (JSON) | Mỗi turn (sau GLM) |
| **Kimi K2.6** | **Narrative Builder** — kể chuyện | TB + result + memory | Vietnamese narration | Mỗi turn (sau DeepSeek) |

### 14.3 Tool Registry (xianxia-flavored)

```typescript
// === CULTIVATION ===
cultivate(action: "combat" | "pill" | "comprehend", ...)  // active, không bế quan
attempt_breakthrough(realm: Realm)               // đột phá cảnh giới
learn_method(jade_slip_id: ItemId)                // học công pháp/vũ kỹ
practice_technique(technique_id)                  // tu luyện vũ kỹ tầng sâu
deduce_techniques(source_ids: ItemId[], materials: ItemId[])  // suy diễn (MỚI)
upgrade_spirit_root(materials: ItemId[])          // tăng cấp linh căn (MỚI)

// === COMBAT (real-time CD) ===
attack(target_id, technique_id?)
use_treasure(treasure_id, target_id?)
use_pill(pill_id)
divine_attack(target_id, technique_id)            // thần thức tấn công
flee(direction?)

// === ALCHEMY (auto-roll) ===
refine_pill(recipe_id, materials: ItemId[], furnace_id, fire_id)
identify_herb(item_id)

// === CRAFTING (auto-roll) ===
craft_artifact(recipe_id, materials: ItemId[], station_id, fire_id)
upgrade_artifact(artifact_id, materials: ItemId[])
fuse_artifacts(artifact_ids: ItemId[], materials: ItemId[])  // ghép random (MỚI)

// === WORLD ===
move_to(location_id)
sense_area()  // thần thức quét vùng, hiện chấm quái/boss (MỚI)
explore_current_location()  // tìm vật ẩn
discover_secret_realm(clue?: string)  // khám phá bí cảnh ẩn (MỚI)
enter_secret_realm(realm_id)
ask_npc_about_realm(npc_id)  // hỏi NPC về bí cảnh (MỚI)

// === SOCIAL ===
talk_to(npc_id, topic?)
trade(npc_id, offer: TradeOffer)
join_sect(sect_id)
accept_quest(quest_id)
complete_quest(quest_id)

// === MEMORY ===
recall(query: string, k?: number)
remember(fact: string, type: FactType)

// === META ===
save_game(slot: number)
load_game(slot: number)
reincarnate()  // chuyển sinh (MỚI)
```

### 14.4 Memory architecture

| Lớp | Lưu trữ | Sử dụng |
|----|---------|---------|
| Short-term (working) | In-memory, 20 turn gần nhất | Inject vào prompt mỗi turn |
| Character state | SQLite (Prisma) | Always inject |
| World state | SQLite | Selective inject theo zone |
| Long-term chronicle | Vector DB (LanceDB) | RAG retrieval khi cần (Kimi) |
| NPC relationship | SQLite | Inject khi gặp NPC |
| Session summary | SQLite, nén mỗi 50 turn | Inject context dài hạn |

### 14.5 Prompt templates (đặc thù tiên hiệp)

- **GLM 5.1**: "Ngươi là thông dịch viên. Nhận văn bản tự do của tu sĩ, chuyển thành Technical Blueprint JSON cấu trúc. Không kể chuyện, chỉ phân tích intent + parameters + narrative direction."
- **DeepSeek v4**: "Ngươi là trọng tài luật lệ tiên hiệp. Nhận Blueprint, thực thi tool calls, tính skill check, không kể chuyện. Trả JSON kết quả."
- **Kimi K2.6**: "Ngươi là bút trạch tiên hiệp. Nhận Blueprint + kết quả logic + ký ức, viết narration tiếng Việt cổ trang, hào sảng. Không nói OOC, không bịa fact."

### 14.6 AI-Generated Images (MỚI — phong cách MU Online)

- Khi vào bí cảnh mới / gặp boss / sự kiện quan trọng → sinh ảnh minh họa
- Dùng image-generation skill (z-ai-web-dev-sdk)
- **Phong cách MU Online**: dark fantasy, gothic medieval, character 3D rendered, armor ornate, atmosphere u ám có sương mù, palette đậm (đỏ/tím/xanh đen), kiểu medieval-fantasy
- Prompt sinh ảnh được **Kimi tạo ra** từ narrative context, sau đó thêm style prefix MU Online
- Cache ảnh để tránh regenerate (mỗi scene/boss chỉ sinh 1 lần)
- Hiển thị trong image panel (bên cạnh text narration)

**Prompt template** (Kimi generate):
```
MU Online style, dark fantasy MMORPG, [subject], 
[environment], gothic atmosphere, ornate armor, 
fog/mist background, dramatic lighting, 
highly detailed 3D render, medieval fantasy
```

Ví dụ:
- Boss: "MU Online style dark fantasy, Fire Dragon boss, 
  volcanic cavern, glowing lava, ornate scales, 
  dramatic red and orange lighting"
- Scene: "MU Online style, Thanh Van Sect mountain gate, 
  misty peaks, ancient temple architecture, 
  dark atmospheric, gothic fantasy"

---

## 15. Tech Stack

### 15.1 Frontend
- Next.js 16 + App Router
- Tailwind CSS 4 + shadcn/ui (New York)
- Zustand (UI state), TanStack Query (server state)
- Framer Motion (animation)
- next-themes (dark mode)
- **Hybrid UI**: text narration (main) + HUD đồ họa (stats, inventory, map) + image panel
- **Desktop-class layout** (không mobile-first, tối ưu cho màn hình lớn)

### 15.2 Backend
- Next.js API routes (REST) — game state, save/load
- **Mini-service GM** (Bun + socket.io, port riêng) — GM turn orchestration, streaming narration
- Prisma + SQLite — tất cả state persistent
- LanceDB — vector DB cho memory
- OpenAI SDK (gọi NIM) — gọi 3 mô hình

### 15.3 AI/ML
- OpenAI Node SDK (gọi NIM với base_url = NIM endpoint)
- z-ai-web-dev-sdk (image generation cho scene/boss illustrations)
- **Token streaming**: qua socket.io (chọn socket.io cho consistency với realtime rules)

### 15.4 Caching & Performance
- In-memory cache cho character/world state
- Cache narration (cùng action + cùng state → dùng lại)
- Cache AI-generated images
- Lazy load NPC data

### 15.5 Save System
- **5 slot** save (per góp ý)
- Mỗi slot: 1 character + snapshot state
- Auto-save mỗi 5 turn + manual save
- Load game → khôi phục toàn bộ state

### 15.6 UI Display
- **Text hiển thị ngay** (không typewriter chậm)
- Stream tokens via socket.io, display nhanh (gần như ngay lập tức khi token arrive)
- HUD update real-time (HP/MP/tu vi progress)

---

## 16. Data Models (Prisma schema draft)

```prisma
// === CHARACTER ===
model Character {
  id            String   @id @default(cuid())
  slot          Int      @unique        // save slot 1-5
  name          String
  createdAt     DateTime @default(now())
  lastPlayedAt  DateTime @default(now())
  
  // Cultivation
  realm         String                  // "LIEN_KHI" | "TRUC_CO" | ...
  realmStage    String?                 // "SO" | "TRUNG" | "HAU" | "VIEN"
  level         Int                     // 1-13 for Lien Khi, 1-12 for others
  cultivationProgress Int               // 0-100 (% to next level)
  
  // Spiritual root (MỚI — multi exp bar)
  spiritRoots   String                  // JSON: [{element:"FIRE", exp:0, max:100}, ...]
  rootGrade     String                  // "TIAN" | "ZHEN" | "WU" | ...
  
  // Cultivation method
  mainMethodId  String?
  
  // Stats
  baseStats     String                  // JSON: {STR, CON, INT, ...}
  bonusPoints   Int
  
  // Resources
  hp            Int
  mp            Int
  stamina       Int
  divineSense   Int
  
  // Meta (MỚI — thọ nguyên + chuyển sinh)
  age           Int                     // in-game years
  lifespan      Int                     // max tuổi thọ
  karma         Int
  slayingMerit  Int
  reincarnationCount Int @default(0)    // số lần chuyển sinh
  
  // Relations
  inventory     InventoryItem[]
  learnedMethods LearnedTechnique[]
  quests        QuestProgress[]
  npcRelations  NpcRelation[]
  saveData      SaveData?
  
  @@map("characters")
}

// === ITEMS ===
model Item {
  id            String   @id @default(cuid())
  type          String                  // "PILL" | "ARTIFACT" | "HERB" | "FRAGMENT" | ...
  grade         String                  // "PHAM" | "LINH" | "HUEN" | ...
  name          String
  description   String
  baseStats     String?                 // JSON
  effects       String?                 // JSON
  unique        Boolean  @default(false)
  
  // For artifacts (MỚI — 10 cấp × 5 phẩm)
  artifactTier  Int?                    // 1-10 (Pháp khí → Huyền Thiên Thánh khí)
  artifactQuality String?               // "HA" | "TRUNG" | "THUONG" | "CUC" | "TUYET"
  
  // For equipment (MỚI — §8)
  equipSlot     String?                 // "WEAPON" | "INNER_HELMET" | "INNER_ARMOR" | ... (11 slots)
  equipRing     String?                 // "INNER" | "OUTER" | null (for set bonus calc)
  element       String?                 // "KIM" | "MOC" | "THUY" | "HOA" | "THO" (ngũ hành)
  
  inventoryItems InventoryItem[]
  @@map("items")
}

model InventoryItem {
  id            String   @id @default(cuid())
  character     Character @relation(fields: [characterId], references: [id])
  characterId   String
  item          Item     @relation(fields: [itemId], references: [id])
  itemId        String
  quantity      Int      @default(1)
  equipped      Boolean  @default(false)
  equippedSlot  String?                 // which slot is this equipped in (NEW §8)
  
  @@map("inventory_items")
}

// Equipment set bonus state (computed, persisted for performance)
model EquipmentSetBonus {
  id            String   @id @default(cuid())
  character     Character @relation(fields: [characterId], references: [id])
  characterId   String  @unique
  innerRingActive Boolean @default(false)  // 5/5 + 3+ ngũ hành
  outerRingActive Boolean @default(false)  // 3+/5 + 3+ ngũ hành
  outerRingCount  Int     @default(0)      // 0-5
  fiveElementResonance Boolean @default(false) // cả 2 vòng + 5 ngũ hành
  bonusStats    String                   // JSON: computed bonuses
  
  @@map("equipment_set_bonuses")
}

// === TECHNIQUES & METHODS (MỚI — có fragments + deduction) ===
model Technique {
  id            String   @id @default(cuid())
  name          String
  type          String                  // "CULTIVATION_METHOD" | "COMBAT" | ...
  grade         String                  // "PHAM" | "HUEN" | "DIA" | "THIEN" | "THAN"
  element       String                  // "FIRE" | "WATER" | ... (must match root)
  layers        Int
  requirements  String                  // JSON
  effects       String                  // JSON per layer
  
  // For deduction (MỚI)
  sourceIds     String?                 // JSON: [tech_id, tech_id] nếu là kết quả suy diễn
  
  learnedBy     LearnedTechnique[]
  fragments     TechniqueFragment[]
  @@map("techniques")
}

model TechniqueFragment {           // MỚI
  id            String   @id @default(cuid())
  techniqueId   String                  // technique hoàn chỉnh khi ghép đủ
  character     Character @relation(fields: [characterId], references: [id])
  characterId   String
  count         Int                     // số mảnh đã có
  required      Int                     // số mảnh cần
  
  @@map("technique_fragments")
}

model LearnedTechnique {
  id            String   @id @default(cuid())
  character     Character @relation(fields: [characterId], references: [id])
  characterId   String
  technique     Technique @relation(fields: [techniqueId], references: [id])
  techniqueId   String
  currentLayer  Int      @default(1)
  mastery       Int      @default(0)
  
  @@map("learned_techniques")
}

// === WORLD ===
model Location {
  id            String   @id @default(cuid())
  parentId      String?
  name          String
  type          String                   // "TOWN" | "SECT" | "WILD" | "SECRET_REALM"
  description   String
  connections   String                   // JSON
  npcs          String                   // JSON: NPC ids
  events        String?
  discovered    Boolean @default(false)  // fog of war
  
  // For secret realms (MỚI)
  isHidden      Boolean @default(false)
  expiresAt     DateTime?                // bí cảnh ẩn biến mất
  
  @@map("locations")
}

model NPC {
  id            String   @id @default(cuid())
  name          String
  type          String
  personality   String                   // JSON: traits
  realm         String
  level         Int
  schedule      String                   // JSON
  knownRealms   String?                  // JSON: realm ids NPC biết (MỚI)
  
  relations     NpcRelation[]
  @@map("npcs")
}

model NpcRelation {
  id            String   @id @default(cuid())
  character     Character @relation(fields: [characterId], references: [id])
  characterId   String
  npc           NPC      @relation(fields: [npcId], references: [id])
  npcId         String
  relationship  Int
  history       String
  
  @@map("npc_relations")
}

// === QUESTS (MỚI — Diablo-style + sandbox) ===
model Quest {
  id            String   @id @default(cuid())
  type          String                   // "SECT" | "STORY" | "HIDDEN" | ...
  title         String
  description   String
  objectives    String
  rewards       String
  prerequisites String?
  isMainStory   Boolean @default(false)
  isGenerated   Boolean @default(false)  // AI-generated?
  
  progress      QuestProgress[]
  @@map("quests")
}

model QuestProgress {
  id            String   @id @default(cuid())
  character     Character @relation(fields: [characterId], references: [id])
  characterId   String
  quest         Quest    @relation(fields: [questId], references: [id])
  questId       String
  status        String
  objectiveState String
  
  @@map("quest_progress")
}

// === MEMORY ===
model ChronicleEvent {
  id            String   @id @default(cuid())
  characterId   String
  turn          Int
  type          String
  summary       String
  embedding     String?
  details       String
  createdAt     DateTime @default(now())
  
  @@map("chronicle_events")
}

// === SAVE ===
model SaveData {
  id            String   @id @default(cuid())
  character     Character @relation(fields: [characterId], references: [id])
  characterId   String  @unique
  data          String
  updatedAt     DateTime @default(now())
  
  @@map("save_data")
}
```

---

## 17. Roadmap / Phases (đề xuất cập nhật)

### Phase 0: Khảo sát & Setup (1 ngày)
- Verify 3 model có trên NIM + tên chính xác + tool calling support
- Test latency từng model
- Setup mini-service GM (Bun + socket.io)
- Thiết kế DB schema cuối + db push
- Test image generation API

### Phase 1: Engine lõi (4-5 ngày)
- Prisma schema + db push
- Character CRUD + 5 save slots
- World/Location/Navigation + fog of war
- Inventory & item management (10 cấp × 5 phẩm cho pháp bảo)
- Basic combat resolver (deterministic + real-time CD)
- Cultivation logic (level up, breakthrough check, tỷ lệ thấp)
- Linh căn multi-exp-bar system
- Dice roll + skill check utilities
- Thần thức + khám phá bản đồ

### Phase 2: GM Service (3-4 ngày)
- Mini-service GM (Bun + socket.io)
- Tool registry đầy đủ (per §14.3)
- Pipeline GLM → DeepSeek → Kimi
- Memory layer (short-term + SQLite + LanceDB)
- Prompt templates (VN tiên hiệp)
- AI image generation cho scene/boss

### Phase 3: Gameplay cơ bản (4-5 ngày)
- Hybrid UI (text + HUD + image panel)
- Di chuyển, xem phòng, tương tác vật phẩm
- Combat cơ bản (1v1 yêu thú) + real-time CD
- Tu luyện (active, không bế quan) + đột phá Luyện Khí → Trúc Cơ
- 1 NPC sư phụ + vài NPC đơn giản
- 1 bí cảnh cố định + bí cảnh ẩn ngẫu nhiên
- Save/Load 5 slot

### Phase 4: Hệ thống nghề (4-5 ngày)
- Luyện đan (recipe, material, furnace, fire, auto-roll, phẩm chất)
- Luyện khí/tạo đồ (recipe, station, fire, 10 cấp × 5 phẩm, create/upgrade/fuse)
- Drop system theo cấp quái

### Phase 5: Vũ kỹ & Chiều sâu (4-5 ngày)
- Vũ kỹ đa tầng + lĩnh ngộ
- Thần thông (Kim Đan+)
- Combat phức tạp (đa mục tiêu, đội nhóm NPC)
- Suy diễn công pháp/vũ kỹ
- Thiên kiếp phó bản (Nguyên Anh+)
- Tâm ma kiếp

### Phase 6: Thế giới & Cốt truyện (5-6 ngày)
- 5 châu + tông môn + bản đồ thế giới
- Hệ thống bí cảnh ẩn ngẫu nhiên (đa số)
- Phe thế lực + nhân quả tracking
- Cốt truyện chính sandbox (Diablo-style)
- AI-generated quest system
- Thọ nguyên + chuyển sinh system

### Phase 7: Memory & Polish (4-5 ngày)
- Vector DB (LanceDB) cho long-term memory
- NPC relationship evolution
- Session summary auto-generation
- UI polish (HUD, animation, image caching)
- Save/load 5 slot ổn định

### Phase 8: Kiểm thử & Cân bằng (3-4 ngày)
- Playtest end-to-end
- Cân bằng stat/skill/drop rate
- Tối ưu prompt AI
- Fix bug

**Tổng ước tính**: ~30-35 ngày làm việc.

---

## 18. Quyết định thảo luận (ĐÃ CHỐT)

### 18.1 Quyết định hệ thống
1. ✅ **Luyện Khí 13 cấp**: tuyến tính, không phân giai
2. ✅ **Thọ nguyên**: có — khi hết → chuyển sinh (giữ trang bị/tiền/bí kíp)
3. ✅ **5 châu + tông môn**: giữ nguyên, thêm bản đồ thế giới khám phá được
4. ✅ **Cảnh giới tối đa MVP**: Hóa Thần. Post-MVP: Luyện Hư, Phân Thân, Hợp Thể, Đại Thừa, Phi Thăng Linh Giới

### 18.2 Quyết định gameplay
5. ✅ **Combat**: turn-based + real-time cooldown (theo thời gian thật)
6. ✅ **Bế quan**: BỎ — tu luyện active (combat, quest, đan, khám phá)
7. ✅ **Luyện đan/luyện khí**: auto-roll (không mini-game)
8. ✅ **Độ khó**: chết = mất 10% tu vi (không perma-death)
9. ✅ **Cốt truyện chính**: sandbox (Diablo-style)

### 18.3 Quyết định UI/UX
10. ✅ **Giao diện**: hybrid (text + HUD đồ họa + image panel)
11. ✅ **Save system**: 5 slot
12. ✅ **Tốc độ text**: hiển thị ngay (stream nhanh, không typewriter chậm)
13. ✅ **Minh họa**: có AI-generated image cho cảnh quan/boss/bí cảnh

### 18.4 Quyết định kỹ thuật
14. ✅ **3 mô hình**: giữ nguyên, KIẾN TRÚC MỚI (GLM interpreter → DeepSeek logic → Kimi narrative)
15. ✅ **Vector DB**: LanceDB (local, nhẹ)
16. ✅ **Stream narration**: socket.io (qua mini-service GM)
17. ✅ **Token budget**: không hạn chế

### 18.5 Quyết định bổ sung (từ Game.txt)
18. ✅ **PC app**, không phải mobile
19. ✅ **Linh căn**: hệ thống multi-exp-bar (1-5 thanh tùy số thuộc tính)
20. ✅ **Công pháp/vũ kỹ**: drop + fragments + suy diễn + ràng buộc thuộc tính
21. ✅ **Đột phá**: tỷ lệ thấp cho TC/KD, đan hỗ trợ, Thiên Kiếp phó bản từ NA+
22. ✅ **Thần thức**: công cụ khám phá bản đồ (hiện chấm quái/boss)
23. ✅ **Pháp bảo**: 10 cấp × 5 phẩm chất (Hạ/Trung/Thượng/Cực/Tuyệt)
24. ✅ **Crafting**: tạo mới + nâng cấp + ghép random
25. ✅ **Bỏ**: trận pháp + phù lục
26. ✅ **Vật phẩm unique**: random trong bí cảnh đặc biệt, hiếm
27. ✅ **Vật liệu**: phong phú tương ứng đan + pháp bảo
28. ✅ **Thời tiết**: linh khí theo châu (phong thổ khác nhau)

### 18.6 Quyết định vòng thảo luận 2 (từ câu trả lời §19 + bổ sung)
29. ✅ **Stat growth**: LK=+3, TC=+10, KD=+30, NA=+50, HT=+70, LH=+90 (post-MVP). Typo đã xác nhận.
30. ✅ **NIM**: cloud API (integrate.api.nvidia.com), game chạy local PC
31. ✅ **Chuyển sinh**: GIỮ NGỘ TÍNH (WIS) — stat quan trọng nhất, giữ vĩnh viễn qua các đời
32. ✅ **Bế quan**: BỎ HẲN mechanic (không time-skip, không mini-game)
33. ✅ **Real-time combat**: CHỈ cooldown theo giây thật, KHÔNG auto-attack
34. ✅ **Bí cảnh ẩn**: biến mất sau **1 ngày in-game** (24 canh giờ)
35. ✅ **AI image style**: phong cách **MU Online** (dark fantasy, gothic, 3D render, ornate)
36. ✅ **Ending Màn 1**: đạt Hóa Thần viên mãn + hoàn thành mảnh ghép cốt truyện → **Phi Thăng Linh Giới** (Màn 2)
37. ✅ **Hệ thống trang bị 2 vòng**: 5 slot vòng trong + 5 slot vòng ngoài + 1 vũ khí = 11 slot
38. ✅ **Set bonus ngũ hành**: vòng trong cần 5/5 + 3+ ngũ hành; vòng ngoài cần 3+/5 + 3+ ngũ hành

---

## 19. Câu hỏi còn lại — ĐÃ CHỐT HẾT

Tất cả 8 câu hỏi trong v0.2 đã được trả lời trong §18.6. Không còn câu hỏi mở.

---

## 20. Màn 2: Linh Giới (Tổng quan cho post-MVP)

Khi người chơi đạt **Hóa Thần viên mãn** + hoàn thành các mảnh ghép cốt truyện chính (sẽ định nghĩa cụ thể trong Phase 6), sẽ kích hoạt sự kiện **Phi Thăng**:

- **Cốt truyện Phi Thăng**: trải qua Thiên Kiếp cuối cùng (cực mạnh), nếu sống → chuyển sang Linh Giới
- **Linh Giới** = thế giới mới:
  - Khác hoàn toàn Phàm Gian (Cửu Châu Đại Lục)
  - Linh khí nồng đặc gấp 100 lần
  - Cảnh giới: Luyện Hư → Phân Thân → Hợp Thể → Đại Thừa
  - Tông môn Linh Giới mạnh hơn nhiều
  - Yêu thú Linh Giới = yêu thần cấp
  - Pháp bảo Linh Giới cấp Tiên khí trở lên phổ biến
- **Giữ nguyên qua Phi Thăng**: cảnh giới Hóa Thần, trang bị, linh căn, ngộ tính, bí kíp
- **Cốt truyện Linh Giới**: khác hoàn toàn, sẽ thiết kế khi đến Màn 2

Màn 2 là **content expansion**, không phải MVP. MVP chỉ cần làm đến Hóa Thần + sự kiện Phi Thăng (cutscene ending).

---

## 21. Bước triển khai tiếp theo

Đã chốt toàn bộ tài liệu. Bây giờ bắt đầu:

### Bước 1 — Phase 0: Khảo sát NIM (ngay)
- Test API key của bạn với 3 model trên NIM
- Verify tên model chính xác (vd `deepseek-ai/deepseek-r1`, `zhipuai/glm-4.5`, `moonshotai/kimi-k2`...)
- Test tool calling (function calling) support
- Đo latency trung bình mỗi model
- Test image generation API (z-ai-web-dev-sdk) với style MU Online
- Kết quả quyết định có cần điều chỉnh kiến trúc không

### Bước 2 — Thiết kế chi tiết Phase 1 (Engine lõi)
Tạo file `docs/PHASE-1-ENGINE.md` chi tiết:
- Prisma schema cuối (tích hợp equipment set bonus, multi-exp-bar linh căn)
- Danh sách module engine + interface TypeScript
- Seed data: tông môn Thanh Vân, Đông Châu, 1 bí cảnh đầu
- Dice/skill check API spec
- Combat resolver API (real-time cooldown)
- File structure dự án

### Bước 3 — Bắt đầu code Phase 1
1. Cập nhật `prisma/schema.prisma`
2. Tạo `src/lib/engine/` (combat, cultivation, inventory, equipment, world...)
3. API routes cho character CRUD + save/load 5 slot
4. UI hybrid layout (text panel + HUD sidebar + image panel + equipment grid)

### Bước 4 — Phase 2: GM Service
- Mini-service GM (Bun + socket.io)
- Tool registry + Pipeline GLM → DeepSeek → Kimi
- Memory layer (short-term + SQLite + LanceDB)
- Prompt templates tiên hiệp

---

**Hết tài liệu v0.3 — đã chốt toàn bộ, sẵn sàng triển khai**

> Tiếp theo: bắt đầu Phase 0 (khảo sát NIM) → Phase 1 (engine lõi). Bạn có thể cung cấp API key NIM hoặc để tôi viết script test với placeholder, bạn tự điền key và chạy.
