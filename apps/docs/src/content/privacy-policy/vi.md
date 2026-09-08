---
locale: vi
title: "Chính sách quyền riêng tư"
description: "Cách Chat Enhancer for YouTube xử lý lưu trữ cục bộ, bản dịch, dữ liệu Playground và các kiểm soát quyền riêng tư."
---

# Quyền riêng tư

Cập nhật lần cuối: ngày 24 tháng 7 năm 2026

Chat Enhancer for YouTube là tiện ích trình duyệt dành cho live chat YouTube. Tiện ích được thiết kế để thêm các tính năng chat nhỏ mà không thay thế chat YouTube hoặc thu thập phân tích.

Bản tóm tắt:

- Hầu hết tính năng của tiện ích chạy cục bộ trong trình duyệt của bạn.
- Dịch bị tắt theo mặc định.
- Khi bật dịch, văn bản được dịch sẽ được gửi đến Google Translate.
- Trò chơi Playground bị tắt theo mặc định. Nếu bạn bật và sử dụng Playground, trạng thái có mặt trong trò chơi, lời mời và hành động trong trò chơi sẽ được gửi đến máy chủ trò chơi Chat Enhancer Playground dưới tên người chơi được tạo.
- Tiện ích không chạy phân tích, không bán dữ liệu và không thu thập lịch sử duyệt web.

## Tiện ích chạy ở đâu

Tiện ích chỉ chạy trên các trang live chat YouTube và replay live chat mà tiện ích được phép truy cập.

Tiện ích sử dụng quyền để lưu cài đặt và dữ liệu riêng của tiện ích trong trình duyệt của bạn. Tiện ích cũng sử dụng quyền truy cập vào các trang web cụ thể cần thiết để các tính năng hoạt động: trang live chat YouTube, dịch vụ dịch của Google Translate và máy chủ trò chơi Chat Enhancer Playground tùy chọn.

Tiện ích không yêu cầu các quyền chung về lịch sử duyệt web, đọc tab, scripting hoặc điều hướng web.

## Dữ liệu được lưu trong trình duyệt của bạn

Tiện ích lưu một số dữ liệu để các tính năng có thể hoạt động giữa các lần tải lại trang.

Trừ khi có ghi chú khác bên dưới, dữ liệu trong phần này vẫn nằm trong hồ sơ trình duyệt của bạn và không được gửi đến Chat Enhancer. Trình duyệt có thể đồng bộ cài đặt tiện ích giữa các bản cài đặt trình duyệt của riêng bạn đã đăng nhập.

- **Cài đặt:** lựa chọn tính năng và tùy chọn của bạn.

- **Dữ liệu Inbox:** các từ khóa được theo dõi và tối đa 100 bản ghi inbox cho mỗi stream hoặc replay. Bản ghi Inbox có thể bao gồm văn bản tin nhắn, tên tác giả, dấu thời gian, chi tiết cơ bản của tin nhắn YouTube cần để hiển thị nguồn gốc của tin nhắn đã lưu, chi tiết khớp và thông tin emoji hoặc hình ảnh cần để hiển thị đúng tin nhắn đã lưu.

- **Dữ liệu emoji thường dùng:** số lần sử dụng cục bộ và thông tin hiển thị emoji dùng để tạo hàng emoji thường dùng.

- **Dữ liệu dấu trang:** nội dung tin nhắn đã lưu và thông tin hiển thị emoji, tên tác giả, URL ảnh đại diện và ID kênh khi có, thời gian gửi và lưu tin nhắn, cùng tiêu đề và URL của stream. Dấu trang vẫn dùng được giữa các stream trong hồ sơ trình duyệt hiện tại.

- **Dữ liệu vòng ảnh đại diện:** tên tác giả, thời điểm thêm vòng, URL stream và, khi có, URL ảnh đại diện, ID kênh cùng tiêu đề stream của những người dùng mà bạn chủ động thêm vòng từ hồ sơ tin nhắn gần đây của họ. Lựa chọn này vẫn dùng được giữa các stream trong hồ sơ trình duyệt hiện tại và chỉ dùng để trang trí ảnh đại diện khớp.

- **Bản nháp chat chưa gửi:** được lưu riêng cho từng stream và khôi phục sau khi làm mới trang. Bản nháp bị xóa khi ô nhập chat được xóa, tin nhắn được gửi, hoặc dữ liệu tiện ích được đặt lại.

- **Dữ liệu danh tính Playground:** danh tính cục bộ được tạo ngẫu nhiên nếu Playground được sử dụng. Danh tính này dùng để nhận ra cùng một bản cài đặt trình duyệt khi kết nối lại với Playground. Đây không phải danh tính YouTube của bạn.

- **Dữ liệu trang tạm thời:** tin nhắn hồ sơ gần đây, trạng thái lệnh và kết quả dịch chỉ được giữ trong bộ nhớ cho trang live chat hiện tại. Chúng được xóa khi bạn rời khỏi hoặc làm mới trang chat.

## Dữ liệu được gửi ra ngoài trình duyệt của bạn

Dữ liệu chỉ được gửi đến các dịch vụ sau khi tính năng liên quan được bật và sử dụng:

### Google Translate (`translate-pa.googleapis.com`)

Dịch chat gửi văn bản tin nhắn chat hiển thị trong live chat và đủ điều kiện dịch khi dịch được bật. Dịch bản nháp gửi văn bản bản nháp mà bạn chọn dịch từ ô chat.

Yêu cầu dịch bao gồm văn bản cần dịch và ngôn ngữ đích. Tiện ích không gửi cookie YouTube hoặc thông tin xác thực YouTube của bạn cùng với yêu cầu dịch.

Truy cập Google Translate qua `translate-pa.googleapis.com` là không chính thức và có thể bị giới hạn tốc độ, thay đổi hoặc không khả dụng.

### <span id="playground"></span>Chat Enhancer Playground ([playground.chatenhancer.com](https://playground.chatenhancer.com))

Nếu bạn bật Playground và sử dụng bảng trò chơi, tiện ích sẽ kết nối với máy chủ trò chơi Chat Enhancer Playground để người dùng opt-in trong cùng stream có thể thấy trạng thái sẵn sàng, trao đổi lời mời và chơi trò chơi.

Tin nhắn Playground có thể bao gồm mã định danh stream hoặc video YouTube, danh tính người chơi Playground được tạo của bạn, tên người chơi được tạo của bạn, danh sách trò chơi có sẵn, lời mời và phản hồi lời mời, và hành động trò chơi như nước đi cờ vua.

Playground lưu trữ kết quả trận đấu gọn nhẹ được liên kết với danh tính người chơi Playground đã tạo để cung cấp số liệu thống kê người chơi. Kết quả được lưu có thể gồm phiên bản trò chơi, thời gian bắt đầu và kết thúc, kết quả và lý do kết thúc, vai trò người tham gia, cùng số liệu nhỏ dành riêng cho trò chơi như nước đi hoặc điểm số. Chúng không gồm nội dung câu hỏi trivia hay toàn bộ trạng thái trò chơi.

Tiện ích không gửi văn bản live chat, tên hiển thị YouTube của bạn, URL avatar YouTube của bạn, cookie YouTube hoặc thông tin xác thực YouTube đến máy chủ trò chơi Playground.

Riêng việc tạo câu hỏi HELP-A-FRIEND! Trivia có thể gửi các đoạn trích bản chép lời video YouTube công khai được chọn và mã định danh trò chơi đến máy chủ trò chơi Playground. Các đoạn trích này đến từ bản chép lời của video, không phải từ live chat. Máy chủ dùng OpenAI để tạo câu hỏi trivia từ các đoạn trích đó.

Việc tạo Replay Trivia có thể yêu cầu xác minh Cloudflare Turnstile tại [playground.chatenhancer.com](https://playground.chatenhancer.com). Cloudflare có thể nhận dữ liệu xác minh thông thường như địa chỉ IP, thông tin trình duyệt và thiết bị, và kết quả thử thách.

Như mọi dịch vụ web, máy chủ trò chơi Playground có thể nhận thông tin kết nối thông thường như địa chỉ IP và thông tin trình duyệt/thiết bị từ trình duyệt hoặc nhà cung cấp mạng.

## Kiểm soát dữ liệu

Bạn có thể xóa dữ liệu tiện ích từ popup tiện ích bằng nút đặt lại. Thao tác này xóa dữ liệu tiện ích cục bộ và cài đặt tiện ích đã đồng bộ, sau đó khôi phục cài đặt mặc định.

Bạn cũng có thể gỡ tiện ích khỏi trình duyệt. Tùy trình duyệt, việc gỡ tiện ích cũng có thể xóa bộ nhớ cục bộ của tiện ích.

Việc đặt lại hoặc gỡ tiện ích không tự động xóa các kết quả trận đấu mà Playground đã lưu trước đó.

## Những gì tiện ích không làm

- Chạy phân tích.
- Thu thập lịch sử duyệt web.
- Bán dữ liệu người dùng.
- Gửi dữ liệu đến máy chủ Chat Enhancer trừ khi bạn dùng các tính năng Playground opt-in được mô tả ở trên.

## Câu hỏi

Đối với câu hỏi về quyền riêng tư, hãy [liên hệ bộ phận hỗ trợ](https://www.chatenhancer.com/vi/support).

Chat Enhancer for YouTube không liên kết với YouTube hoặc Google.
