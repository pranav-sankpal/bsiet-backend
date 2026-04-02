const express = require('express');
const { Pool } = require('pg');
const multer = require('multer');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const cors = require('cors');
const fs = require('fs');
require('dotenv').config();

const app = express();

// --- 1. CORS CONFIGURATION (IMPORTANT) ---
// Replace the URL below with your actual Vercel deployment URL
const allowedOrigins = [
    'https://your-project-name.vercel.app', 
    'http://localhost:3000', // For local testing
    'http://127.0.0.1:5500'  // For VS Code Live Server
];

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            return callback(new Error('CORS policy does not allow access from this origin.'), false);
        }
        return callback(null, true);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));

app.use(express.json());

// --- 2. DATABASE CONNECTION ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const upload = multer({ dest: 'uploads/' });

// --- 3. LOGIN API ---
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
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- 4. MANUAL ADD STUDENT ---
app.post('/api/students', async (req, res) => {
    const { student_name, enroll_no, department, year, roll_no, email } = req.body;
    try {
        await pool.query(
            'INSERT INTO students (name, enroll_no, department, year, roll_no, email) VALUES ($1, $2, $3, $4, $5, $6)',
            [student_name, enroll_no, department, year, roll_no, email]
        );
        res.json({ success: true, message: "Student added successfully!" });
    } catch (err) {
        res.status(500).json({ success: false, error: "Duplicate Enrollment or Database Error" });
    }
});

// --- 5. BULK UPLOAD ---
app.post('/api/students/bulk', upload.single('student_file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const filePath = req.file.path;
    let students = [];

    try {
        if (req.file.originalname.endsWith('.csv')) {
            fs.createReadStream(filePath)
                .pipe(csv())
                .on('data', (data) => students.push(data))
                .on('end', () => processBulk(students, res, filePath));
        } else {
            const workbook = xlsx.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            students = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
            processBulk(students, res, filePath);
        }
    } catch (err) {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.status(500).json({ error: "File parsing failed" });
    }
});

async function processBulk(students, res, filePath) {
    try {
        for (let s of students) {
            // Note: Column names must match exactly what is in your Excel/CSV (Case Sensitive)
            await pool.query(
                'INSERT INTO students (name, enroll_no, department, year, roll_no, email) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (enroll_no) DO NOTHING',
                [s.Name, s.Enroll_No, s.Dept, s.Year, s.Roll_No, s.Email]
            );
        }
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.json({ success: true, message: `${students.length} students processed.` });
    } catch (err) {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.status(500).json({ error: err.message });
    }
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
