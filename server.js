const express = require('express');
const { Pool } = require('pg');
const multer = require('multer');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const cors = require('cors');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use(cors()); // Allows Vercel to talk to Render
app.use(express.json());

// Database Connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const upload = multer({ dest: 'uploads/' });

// --- 1. LOGIN API ---
app.post('/api/login', async (req, res) => {
    const { role, username, password } = req.body;
    try {
        const result = await pool.query(
            'SELECT * FROM users WHERE username = $1 AND password = $2 AND role = $3',
            [username, password, role]
        );
        if (result.rows.length > 0) {
            res.json({ success: true, message: "Login Successful", user: result.rows[0] });
        } else {
            res.status(401).json({ success: false, message: "Invalid Credentials" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- 2. MANUAL ADD STUDENT ---
app.post('/api/students', async (req, res) => {
    const { student_name, enroll_no, department, year, roll_no, email } = req.body;
    try {
        await pool.query(
            'INSERT INTO students (name, enroll_no, department, year, roll_no, email) VALUES ($1, $2, $3, $4, $5, $6)',
            [student_name, enroll_no, department, year, roll_no, email]
        );
        res.json({ success: true, message: "Student added successfully!" });
    } catch (err) {
        res.status(500).json({ error: "Duplicate Enrollment or DB Error" });
    }
});

// --- 3. BULK UPLOAD (CSV/Excel) ---
app.post('/api/students/bulk', upload.single('student_file'), async (req, res) => {
    const filePath = req.file.path;
    let students = [];

    if (req.file.originalname.endsWith('.csv')) {
        // Parse CSV
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (data) => students.push(data))
            .on('end', () => processBulk(students, res, filePath));
    } else {
        // Parse Excel
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        students = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
        processBulk(students, res, filePath);
    }
});

async function processBulk(students, res, filePath) {
    try {
        for (let s of students) {
            await pool.query(
                'INSERT INTO students (name, enroll_no, department, year, roll_no, email) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING',
                [s.Name, s.Enroll_No, s.Dept, s.Year, s.Roll_No, s.Email]
            );
        }
        fs.unlinkSync(filePath); // Delete temp file
        res.json({ success: true, message: `${students.length} students processed.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));