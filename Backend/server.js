import 'dotenv/config';
import express from "express";
import { createClient } from "@libsql/client";
import cors from "cors";
import jwt from "jsonwebtoken";

const app = express();
app.use(express.json());
const allowedOrigins = [
  "https://skp-hackathon-ybms-atmj0wmpq-kannadhasans-projects-2b21f9ac.vercel.app",
  "https://skp-hackathon-ybms.vercel.app",
  "https://skp-hackathon.vercel.app",
  "http://localhost:5173",
  "http://localhost:5174"
];

app.use(cors({
  origin: function(origin, callback){
    // allow requests with no origin (like Postman)
    if(!origin) return callback(null, true);
    if(allowedOrigins.indexOf(origin) === -1){
      const msg = "The CORS policy for this site does not allow access from the specified Origin.";
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true
}));

// Initialize Turso client
const db = createClient({
  url: 'libsql://skp-hackathon-kannadhasan2.aws-ap-south-1.turso.io',
  authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NTg2OTUxNTYsImlkIjoiMjc1NDEyNWMtM2I4NS00NWYyLWFkNDUtYjUxMTQ4ODYwYjNjIiwicmlkIjoiMGYyN2QwYTItMGVjYS00ZDVmLWE4ZWItZTU4NmNkMjk2NDAwIn0.PLAZwA9cEYF5pE2bqOzsIN8foHyN0dQxchzqhY9bbR7rbb4AlKNnn-LMoOsIX2O17g7q40ggmyF27aN7ijFuCQ"
});

// DB Initialization
const initializeDB = async () => {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS student (
        register_no TEXT PRIMARY KEY,
        username TEXT,
        department TEXT,
        date_of_birth TEXT,
        email TEXT
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS books (
        book_id TEXT PRIMARY KEY,
        book_name TEXT,
        author TEXT,
        number_of_pages INTEGER,
        published_year INTEGER,
        publisher TEXT,
        description TEXT,
        book_count INTEGER,
        image_url TEXT,
        chapters TEXT
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS quiz (
        id TEXT PRIMARY KEY,
        question TEXT,
        options TEXT,
        answer TEXT
      )
    `);

    console.log("✅ DB initialized");
    
    if (!process.env.VERCEL) {
      const PORT = process.env.PORT || 5000;
      app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
    }
  } catch (e) {
    console.error(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDB();

// JWT Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const jwtToken = authHeader && authHeader.split(" ")[1];

  if (!jwtToken) return res.status(401).send("Invalid JWT Token");

  jwt.verify(jwtToken, process.env.JWT_SECRET, (err, payload) => {
    if (err) return res.status(401).send("Invalid JWT Token");
    req.register_no = payload.register_no;
    next();
  });
};

// Routes
app.get("/", (req, res) => res.send("Working..."));

app.post("/register", async (req, res) => {
  const { username, dateOfBirth, registerNo, department, email } = req.body;
  const existing = await db.execute({ sql: "SELECT * FROM student WHERE register_no = ?", args: [registerNo] });
  if (existing.rows.length) return res.status(400).send({ error_msg: "User already exists" });

  await db.execute({
    sql: "INSERT INTO student (username, register_no, department, date_of_birth, email) VALUES (?, ?, ?, ?, ?)",
    args: [username, registerNo, department, dateOfBirth, email]
  });

  res.send({ message: "User Created Successfully" });
});

app.post("/login", async (req, res) => {
  const { registerNo, dateOfBirth } = req.body;
  if (!registerNo || !dateOfBirth) return res.status(400).send({ error: "Missing fields" });

  const dbStudent = await db.execute({
    sql: "SELECT * FROM student WHERE register_no = ?",
    args: [registerNo],
  });

  if (!dbStudent.rows.length) return res.status(400).send({ error: "Invalid Register No" });

  const student = dbStudent.rows[0];
  if (student.date_of_birth === dateOfBirth) {
    const jwtToken = jwt.sign({ register_no: registerNo }, process.env.JWT_SECRET);
    return res.send({ jwt_token: jwtToken });
  } else {
    return res.status(400).send({ error: "Invalid Date Of Birth" });
  }
});

app.get("/student-list", async (req, res) => {
  const result = await db.execute("SELECT * FROM student");
  res.send({ studentList: result.rows });
});

app.get("/profile", authenticateToken, async (req, res) => {
  const result = await db.execute({ sql: "SELECT * FROM student WHERE register_no = ?", args: [req.register_no] });
  res.send(result.rows[0]);
});

app.post("/insert-book", async (req, res) => {
  const { bookId, bookName, author, numberOfPages, publishedYear, description, publisher, bookCount, imageUrl, chapters } = req.body;
  await db.execute({
    sql: `INSERT INTO books (book_id, book_name, author, number_of_pages, published_year, publisher, description, book_count, image_url, chapters)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [bookId, bookName, author, numberOfPages, publishedYear, publisher, description, bookCount, imageUrl, chapters]
  });
  res.send("Book Added");
});

app.get("/books", async (req, res) => {
  const result = await db.execute("SELECT * FROM books ORDER BY book_name");
  res.send(result.rows);
});

app.get("/book/:bookId", async (req, res) => {
  const result = await db.execute({ sql: "SELECT * FROM books WHERE book_id = ?", args: [req.params.bookId] });
  res.send(result.rows[0]);
});

// Quiz routes
app.post("/quiz/add", async (req, res) => {
  const { id, question, options, answer } = req.body;
  await db.execute({
    sql: "INSERT INTO quiz (id, question, options, answer) VALUES (?, ?, ?, ?)",
    args: [id, question, JSON.stringify(options), answer]
  });
  res.send("Quiz question added");
});

app.get("/quiz", async (req, res) => {
  const result = await db.execute("SELECT * FROM quiz ORDER BY RANDOM()");
  res.send(result.rows);
});

// Export app for Vercel
export default app;

