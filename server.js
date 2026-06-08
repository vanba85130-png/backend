// =====================================================================
// 🚀 BACKEND SERVER NODE.JS EDUCONNECT - SỬA LỖI TOÀN DIỆN & CHỐNG SẬP
// =====================================================================

const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const axios = require('axios');
const { GoogleGenAI } = require("@google/generative-ai");
const { OAuth2Client } = require('google-auth-library');

const app = express();
app.use(express.json());

// BẬT CORS CHUẨN: Cho phép mọi thiết bị điện thoại, laptop kết nối vào
app.use(cors({ 
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'userid']
}));

// ĐƯỜNG DẪN KẾT NỐI DATABASE SUPABASE
// 🚨 CHÚ Ý QUAN TRỌNG: Bạn hãy thay "MAT_KHAU_SUPABASE_CUA_BAN" thành mật khẩu tài khoản Supabase thật của bạn.
// ĐƯỜNG DẪN KẾT NỐI DATABASE SUPABASE
const pool = new Pool({
    user: "postgres",
    password: "%8dx+_rd%5yBLNr", // 👈 Truyền trực tiếp mật khẩu thô của bạn vào đây, không bị lỗi mã hóa URL
    host: "aws-0-ap-southeast-1.pooler.supabase.com", // 👈 Ép chạy qua dải IPv4 của đường truyền Connection Pooler
    database: "postgres",
    port: 6543, // 👈 Cổng Pooler chính thức hỗ trợ IPv4 của Supabase
    ssl: { rejectUnauthorized: false }
});

// Kiểm tra xem kết nối database ổn định chưa khi bật server
pool.connect((err, client, release) => {
    if (err) {
        return console.error('❌ Thất bại! Chưa kết nối được tới database Supabase. Hãy kiểm tra lại mật khẩu:', err.stack);
    }
    console.log('✅ Thành công! Hệ thống đã kết nối hoàn hảo tới Database Supabase.');
    release();
});

const GOOGLE_CLIENT_ID = "859951820524-pdljg6puovkcrv77i6qosbjilbb3g0hu.apps.googleusercontent.com";
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

const YOUTUBE_API_KEY = "AIzaSyB-2EdkKkQjQEPOP0W-nbaaXmzPjvh0Tbo";
const KENH_YOUTUBE_ID = "UCMN2dCF4wGYVcQA-uDO1OxA";

// Bộ lọc bảo mật của Admin Thắng
async function xacThucAdmin(req, res, next) {
    try {
        const { userid } = req.headers;
        if(!userid) return res.status(403).json({ error: "Yêu cầu mã Admin!" });
        const check = await pool.query("SELECT role FROM users WHERE id = $1", [userid]);
        if (check.rows.length > 0 && check.rows[0].role === 'admin') { 
            next(); 
        } else { 
            res.status(403).json({ error: "Từ chối truy cập! Quyền hạn tối cao của Admin Thắng." }); 
        }
    } catch (err) {
        res.status(500).json({ error: "Lỗi hệ thống xác thực: " + err.message });
    }
}

// ĐỒNG BỘ CHỈ SỐ HAI CHIỀU TỪ CHANNEL YOUTUBE
async function dongBoVideoYouTube() {
    try {
        console.log("🔄 Đang quét danh sách video và cập nhật chỉ số tương tác thực từ YouTube...");
        const url = `https://www.googleapis.com/youtube/v3/search?key=${YOUTUBE_API_KEY}&channelId=${KENH_YOUTUBE_ID}&part=snippet,id&order=date&maxResults=15&type=video`;
        const response = await axios.get(url);
        const items = response.data.items || [];

        for (let item of items) {
            const videoId = item.id.videoId;
            if(!videoId) continue;

            const title = item.snippet.title;
            const description = item.snippet.description;
            const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

            let views = 0, likes = 0, comments = 0;
            try {
                const detailUrl = `https://www.googleapis.com/youtube/v3/videos?key=${YOUTUBE_API_KEY}&id=${videoId}&part=statistics`;
                const detailRes = await axios.get(detailUrl);
                const stats = detailRes.data.items[0]?.statistics || {};
                views = parseInt(stats.viewCount || 0);
                likes = parseInt(stats.likeCount || 0);
                comments = parseInt(stats.commentCount || 0);
            } catch (vErr) {
                console.error(`Không đồng bộ được stats cho video: ${videoId}`);
            }

            const checkExisted = await pool.query("SELECT id FROM libraries WHERE file_url = $1", [videoUrl]);
            
            if (checkExisted.rows.length === 0) {
                await pool.query(
                    `INSERT INTO libraries (title, description, file_type, file_url, views_count, likes_count, comments_count, interaction_score) 
                     VALUES ($1, $2, 'video', $3, $4, $5, $6, $7)`,
                    [title, description, videoUrl, views, likes, comments, (views + likes * 2 + comments * 3)]
                );
            } else {
                await pool.query(
                    `UPDATE libraries SET views_count = $1, likes_count = $2, comments_count = $3, interaction_score = $4 WHERE file_url = $5`,
                    [views, likes, comments, (views + likes * 2 + comments * 3), videoUrl]
                );
            }
        }
    } catch (error) {
        console.error("⚠️ Lỗi đồng bộ dữ liệu YouTube API (Có thể do sai API Key hoặc hết lượt dùng):", error.message);
    }
}
setInterval(dongBoVideoYouTube, 15 * 60 * 1000);
setTimeout(dongBoVideoYouTube, 5000); // Tự động kích hoạt sau 5 giây chạy server

// API TRANG CHỦ
app.get('/api/homepage/videos', async (req, res) => {
    try {
        let ngay = await pool.query("SELECT * FROM libraries WHERE created_at >= NOW() - INTERVAL '1 day' ORDER BY interaction_score DESC");
        let tuan = await pool.query("SELECT * FROM libraries WHERE created_at >= NOW() - INTERVAL '7 days' ORDER BY interaction_score DESC");
        let thang = await pool.query("SELECT * FROM libraries ORDER BY interaction_score DESC LIMIT 15");
        
        res.json({ 
            day: ngay.rows.length ? ngay.rows : thang.rows, 
            week: tuan.rows.length ? tuan.rows : thang.rows, 
            month: thang.rows 
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// API ĐĂNG KÝ THÀNH VIÊN MỚI
app.post('/api/auth/register', async (req, res) => {
    const { email, password, rePassword } = req.body;
    if (!email || !password || !rePassword) {
        return res.status(400).json({ success: false, error: "Vui lòng điền đầy đủ thông tin biểu mẫu!" });
    }
    if (password !== rePassword) {
        return res.status(400).json({ success: false, error: "Mật khẩu nhập lại không khớp nhau!" });
    }
    try {
        let userCheck = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ success: false, error: "Địa chỉ Email này đã tồn tại trên hệ thống!" });
        }
        const newUser = await pool.query(
            `INSERT INTO users (full_name, email, password_hash, role, ranking_tier) 
             VALUES ('Học Sinh Mới', $1, $2, 'student', 'Thành Viên Mới') RETURNING *`,
            [email, password]
        );
        res.json({ success: true, user: newUser.rows[0] });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// API ĐĂNG NHẬP THƯỜNG
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        let userCheck = await pool.query("SELECT * FROM users WHERE email = $1 AND password_hash = $2", [email, password]);
        if (userCheck.rows.length === 0) {
            return res.status(401).json({ success: false, error: "Tài khoản hoặc mật khẩu không chính xác!" });
        }
        res.json({ success: true, user: userCheck.rows[0] });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// API ĐĂNG NHẬP BẰNG GOOGLE
app.post('/api/auth/google', async (req, res) => {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ success: false, error: "Thiếu mã xác thực Google!" });
    try {
        const ticket = await client.verifyIdToken({
            idToken: idToken,
            audience: GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        const email = payload.email;
        const name = payload.name;
        const picture = payload.picture;

        let userCheck = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
        let user;

        if (userCheck.rows.length === 0) {
            const newUser = await pool.query(
                `INSERT INTO users (full_name, email, avatar_url, role, ranking_tier, password_hash) 
                 VALUES ($1, $2, $3, 'student', 'Thành Viên Mới', 'LOGGED_WITH_GOOGLE') RETURNING *`,
                [name, email, picture]
            );
            user = newUser.rows[0];
        } else {
            const updatedUser = await pool.query(
                `UPDATE users SET avatar_url = $1 WHERE email = $2 RETURNING *`,
                [picture, email]
            );
            user = updatedUser.rows[0];
        }

        res.json({ success: true, user: user });
    } catch (err) {
        res.status(500).json({ success: false, error: "Xác thực tài khoản Google thất bại: " + err.message });
    }
});

// API THAY ĐỔI 12 MỤC THÔNG TIN
app.post('/api/user/update', async (req, res) => {
    const { userId, full_name, province_name, school_name, class_name, avatar_url, phone, dob, gender, address, bank_account, facebook_link } = req.body;
    try {
        await pool.query(
            `UPDATE users SET 
                full_name = $1, province_name = $2, school_name = $3, class_name = $4, 
                avatar_url = $5, phone = $6, dob = $7, gender = $8, address = $9, 
                bank_account = $10, facebook_link = $11 
             WHERE id = $12`,
            [full_name, province_name, school_name, class_name, avatar_url, phone, dob || null, gender, address, bank_account, facebook_link, userId]
        );
        res.json({ success: true, message: "Hệ thống đã lưu thông tin cá nhân của cậu thành công!" });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// API BẠN AI TRÒ CHUYỆN
app.post('/api/ai/chat', async (req, res) => {
    try {
        const { message, mode, userId } = req.body;
        if (!message) return res.json({ reply: "Cậu chưa gõ nội dung kìa!" });

        let instruction = "Bạn là người bạn tri kỷ học đường của học sinh. Hãy trả lời thật ấm áp, đồng cảm sâu sắc, xưng hô tớ - cậu cực kỳ gần gũi.";
        let contentsHistory = [];

        if (userId) {
            await pool.query("INSERT INTO ai_memories (user_id, role, content, chat_type) VALUES ($1, 'user', $2, $3)", [userId, message, mode]);
            const historyQuery = await pool.query(
                `SELECT role, content FROM ai_memories WHERE user_id = $1 AND chat_type = $2 ORDER BY created_at ASC LIMIT 15`
            , [userId, mode]);
            
            contentsHistory = historyQuery.rows.map(row => ({
                role: row.role === 'user' ? 'user' : 'model',
                parts: [{ text: row.content }]
            }));
        } else {
            contentsHistory = [{ role: 'user', parts: [{ text: message }] }];
        }

        // 🚨 LƯU Ý: Thay thế chuỗi chữ dưới đây bằng API Key Gemini thật lấy tại Google AI Studio để AI trả lời được nhé.
        const ai = new GoogleGenAI({ apiKey: "DIEN_KEY_GEMINI_CỦA_BAN" });
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: contentsHistory,
            config: { systemInstruction: instruction }
        });

        const aiReply = response.text;
        if (userId) {
            await pool.query("INSERT INTO ai_memories (user_id, role, content, chat_type) VALUES ($1, 'model', $2, $3)", [userId, aiReply, mode]);
        }
        res.json({ reply: aiReply });
    } catch (err) { 
        console.error("Lỗi trò chuyện với AI:", err.message);
        res.json({ reply: "Tớ đang bận ôn bài một chút, cậu đợi tớ tẹo nhé!" }); 
    }
});

// CÁC CHỨC NĂNG ĐIỀU HÀNH CỦA ADMIN THẮNG
app.get('/api/admin/users', xacThucAdmin, async (req, res) => {
    try {
        const users = await pool.query("SELECT id, full_name, email, province_name, school_name, class_name, phone, bank_account, role FROM users ORDER BY id DESC");
        res.json({ success: true, list: users.rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/notification', xacThucAdmin, async (req, res) => {
    const { title, content, notif_type } = req.body;
    try {
        await pool.query("INSERT INTO notifications (title, content, notif_type) VALUES ($1, $2, $3)", [title, content, notif_type]);
        res.json({ success: true, message: "Phát thông báo hệ thống thành công!" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// TỰ ĐỘNG LẤY CỔNG CỦA HOSTING KHI DEPLOY HOẶC MẶC ĐỊNH LÀ 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Hệ thống Backend trực tuyến EduConnect hoạt động tại cổng ${PORT}!`));
