"""Small standard-library HTTP API for the Careflow admission app."""
from datetime import date, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
import os
from pathlib import Path
import re
import sqlite3
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("DSCRIBE_DB", ROOT / "patients.db"))
DIST_PATH = ROOT.parent / "dist"
DATABASE_URL = os.environ.get("DATABASE_URL")
GENDERS = {"Female", "Male", "Non-binary", "Prefer not to say"}
WARDS = {"General", "ICU", "Maternity", "Pediatrics", "Surgery", "Emergency"}
DEPARTMENTS = {"Cardiology", "General Medicine", "Neurology", "Oncology", "Orthopedics", "Pediatrics", "Surgery"}
DOCTORS = {"Dr. A. Mehta", "Dr. R. Sharma", "Dr. P. Iyer", "Dr. S. Khan", "Dr. N. Rao", "Dr. K. Patel"}


def connect():
    if DATABASE_URL:
        import psycopg
        from psycopg.rows import dict_row

        conn = psycopg.connect(DATABASE_URL, row_factory=dict_row)
        conn.execute("""CREATE TABLE IF NOT EXISTS patients (
            id SERIAL PRIMARY KEY, name TEXT NOT NULL, age INTEGER NOT NULL,
            gender TEXT NOT NULL, ward TEXT NOT NULL, department TEXT NOT NULL,
            doctor TEXT NOT NULL, admission_date DATE NOT NULL,
            status TEXT NOT NULL DEFAULT 'Admitted', created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )""")
        return conn
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("""CREATE TABLE IF NOT EXISTS patients (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, age INTEGER NOT NULL,
        gender TEXT NOT NULL, ward TEXT NOT NULL, department TEXT NOT NULL,
        doctor TEXT NOT NULL, admission_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Admitted', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )""")
    return conn


def execute(conn, statement, params=()):
    """Use qmark placeholders for both SQLite and the optional PostgreSQL backend."""
    if DATABASE_URL:
        statement = statement.replace("?", "%s")
    return conn.execute(statement, params)


def serialize_row(row):
    result = dict(row)
    return {key: value.isoformat() if isinstance(value, (date, datetime)) else value
            for key, value in result.items()}


def validate(data):
    errors = {}
    name = data.get("name")
    if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z ]+", name.strip()):
        errors["name"] = "Name is required and must contain letters only."
    age = data.get("age")
    try:
        age = int(age)
        if str(age) != str(data.get("age")) or not 0 <= age <= 120:
            raise ValueError()
    except (ValueError, TypeError):
        errors["age"] = "Age is required and must be a whole number from 0 to 120."
    for field, values, label in (("gender", GENDERS, "Gender"), ("ward", WARDS, "Ward"),
                                 ("department", DEPARTMENTS, "Department"), ("doctor", DOCTORS, "Doctor")):
        if data.get(field) not in values:
            errors[field] = f"Select a valid {label.lower()}."
    admission_date = data.get("admission_date")
    try:
        parsed_date = date.fromisoformat(admission_date)
        if parsed_date > date.today():
            raise ValueError()
    except (ValueError, TypeError):
        errors["admission_date"] = "Enter a valid admission date that is not in the future."
    if errors:
        raise ValueError(errors)
    return {"name": name.strip(), "age": age, "gender": data["gender"], "ward": data["ward"],
            "department": data["department"], "doctor": data["doctor"], "admission_date": admission_date}


class Handler(BaseHTTPRequestHandler):
    def send_bytes(self, status, body, content_type):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_json(204, {})

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/healthz":
            try:
                with connect() as conn:
                    conn.execute("SELECT 1")
                return self.send_json(200, {"status": "ok"})
            except Exception:
                return self.send_json(503, {"status": "database unavailable"})
        if parsed.path != "/api/patients" and not parsed.path.startswith("/api/"):
            return self.serve_frontend(parsed.path)
        if parsed.path != "/api/patients":
            return self.send_json(404, {"message": "Endpoint not found."})
        query = parse_qs(parsed.query)
        clauses, params = [], []
        for key in ("ward", "department", "doctor"):
            value = query.get(key, [""])[0]
            if value:
                clauses.append(f"{key} = ?")
                params.append(value)
        search = query.get("search", [""])[0].strip()
        if search:
            clauses.append("LOWER(name) LIKE LOWER(?)")
            params.append(f"%{search}%")
        where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
        with connect() as conn:
            rows = execute(conn, "SELECT * FROM patients" + where + " ORDER BY created_at DESC, id DESC", params).fetchall()
        self.send_json(200, {"patients": [serialize_row(row) for row in rows]})

    def serve_frontend(self, request_path):
        """Serve the built React app and allow client-side routes to refresh."""
        if not DIST_PATH.is_dir():
            return self.send_json(404, {"message": "Frontend build not found. Run npm run build first."})
        relative_path = request_path.lstrip("/")
        candidate = (DIST_PATH / relative_path).resolve()
        try:
            candidate.relative_to(DIST_PATH.resolve())
        except ValueError:
            return self.send_json(404, {"message": "File not found."})
        if not candidate.is_file():
            candidate = DIST_PATH / "index.html"
        try:
            content_type = mimetypes.guess_type(candidate.name)[0] or "application/octet-stream"
            return self.send_bytes(200, candidate.read_bytes(), content_type)
        except OSError:
            return self.send_json(404, {"message": "File not found."})

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != "/api/patients":
            return self.send_json(404, {"message": "Endpoint not found."})
        try:
            data = self.read_body()
            patient = validate(data)
            with connect() as conn:
                fields = ", ".join(patient)
                marks = ", ".join("?" for _ in patient)
                if DATABASE_URL:
                    cursor = execute(conn, f"INSERT INTO patients ({fields}) VALUES ({marks}) RETURNING id", list(patient.values()))
                    patient_id = cursor.fetchone()["id"]
                else:
                    cursor = execute(conn, f"INSERT INTO patients ({fields}) VALUES ({marks})", list(patient.values()))
                    patient_id = cursor.lastrowid
                row = execute(conn, "SELECT * FROM patients WHERE id = ?", (patient_id,)).fetchone()
            self.send_json(201, {"patient": serialize_row(row)})
        except ValueError as error:
            self.send_json(400, {"message": "Please correct the highlighted fields.", "errors": error.args[0] if error.args and isinstance(error.args[0], dict) else {"body": "Invalid request body."}})

    def do_PUT(self):
        patient_id = self.patient_id()
        if patient_id is None: return
        try:
            patient = validate(self.read_body())
            with connect() as conn:
                cursor = execute(conn, "UPDATE patients SET name=?, age=?, gender=?, ward=?, department=?, doctor=?, admission_date=? WHERE id=?",
                    (*patient.values(), patient_id))
                if not cursor.rowcount: return self.send_json(404, {"message": "Patient not found."})
                row = execute(conn, "SELECT * FROM patients WHERE id=?", (patient_id,)).fetchone()
            self.send_json(200, {"patient": serialize_row(row)})
        except ValueError as error:
            self.send_json(400, {"message": "Please correct the highlighted fields.", "errors": error.args[0] if error.args and isinstance(error.args[0], dict) else {"body": "Invalid request body."}})

    def do_PATCH(self):
        patient_id = self.patient_id()
        if patient_id is None: return
        with connect() as conn:
            cursor = execute(conn, "UPDATE patients SET status='Discharged' WHERE id=?", (patient_id,))
        self.send_json(404 if not cursor.rowcount else 200, {"message": "Patient not found." if not cursor.rowcount else "Patient discharged."})

    def do_DELETE(self):
        patient_id = self.patient_id()
        if patient_id is None: return
        with connect() as conn:
            cursor = execute(conn, "DELETE FROM patients WHERE id=?", (patient_id,))
        self.send_json(404 if not cursor.rowcount else 200, {"message": "Patient not found." if not cursor.rowcount else "Patient deleted."})

    def patient_id(self):
        match = re.fullmatch(r"/api/patients/(\d+)", urlparse(self.path).path)
        if not match:
            self.send_json(404, {"message": "Patient not found."})
            return None
        return int(match.group(1))

    def read_body(self):
        length = int(self.headers.get("Content-Length", "0"))
        value = json.loads(self.rfile.read(length) or b"{}")
        if not isinstance(value, dict): raise ValueError()
        return value

    def log_message(self, fmt, *args):
        print(f"{self.log_date_time_string()} {fmt % args}")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    connect().close()
    print(f"Patient API listening on http://localhost:{port} (SQLite: {DB_PATH})")
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
